#!/usr/bin/env bun
// ─────────────────────────────────────────────────────
//  Materio MCP Server — Main Entry Point
//
//  MCP uses JSON-RPC 2.0 over Streamable HTTP.
//  The SDK's StreamableHTTPServerTransport expects
//  express-compatible req/res objects, so we use
//  express (which Bun runs natively).
//
//  Transports:
//    • stdio   — for Claude Desktop local
//    • http    — Streamable HTTP JSON-RPC for
//                Perplexity & Claude remote connectors
//
//  Additionally, REST endpoints are exposed under
//  /api/* for ChatGPT Custom GPT Actions.
// ─────────────────────────────────────────────────────

import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import sharp from "sharp";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { executeJsTool, handleExecuteJs } from "./tools/execute-js.js";
import { memoryTool, handleSaveMemory } from "./tools/memory.js";
import { registerMaterioTools } from "./tools/materio.js";
import { registerExaSearch } from "./tools/exa-search.js";
import {
  listSemesters,
  listSubjects,
  listResources,
  searchResources,
  resolvePdfUrl,
  getFullIndex,
  generateMaskedUrl,
} from "./services/resources.js";
import { queryDeepThinkRAG, queryVectorlessRAG } from "./services/rag.js";
import { lookupExternalSources } from "./services/external-lookup.js";
import { AuthError, authorizeMaterioAccess } from "./services/materio-auth.js";
import { connectDB, Conversation, Message } from "./db.js";
import { requireAuth, type AuthenticatedRequest } from "./middleware/auth.js";

const APP_ICON_PATH = fileURLToPath(new URL("./app.png", import.meta.url));
const OPENAPI_SPEC_PATH = fileURLToPath(new URL("../openapi.json", import.meta.url));
const OPENAPI_LITE_SPEC_PATH = fileURLToPath(
  new URL("../openapi.search-lite.json", import.meta.url)
);
const FAVICON_SIZES = [16, 24, 32, 48, 64, 96, 128, 180, 192, 256, 512];
const faviconCache = new Map<number, Buffer>();
const DIAGRAM_INTENT_PATTERN = /(?:^|\b)(draw|diagram|visualize|render|flowchart|mermaid|graphviz|dot|svg|dfa|fsm|automaton|state machine|circuit|gantt|timeline|logic gate|schemdraw|matplotlib|plot|chart)(?:\b|$)/i;

function isDiagramIntent(query: string): boolean {
  return DIAGRAM_INTENT_PATTERN.test(query);
}

function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

function truncateToWordLimit(text: string, wordLimit: number): string {
  const words = text.trim().split(/\s+/);
  if (words.length <= wordLimit) return text.trim();
  return `${words.slice(0, wordLimit).join(" ")} ...`;
}

function getRequestedFaviconSize(req: express.Request): number {
  const rawSize = req.query.sz ?? req.query.size ?? req.query.s;
  const parsed = Number(Array.isArray(rawSize) ? rawSize[0] : rawSize);

  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.min(512, Math.max(16, Math.round(parsed)));
  }

  return 256;
}

function faviconLinkHeader(): string {
  return FAVICON_SIZES.map(
    (size) => `</app.png?size=${size}>; rel="icon"; type="image/png"; sizes="${size}x${size}"`
  ).join(", ");
}

function applyIconHeaders(res: express.Response): void {
  res.setHeader("Link", faviconLinkHeader());
  res.setHeader("X-Content-Type-Options", "nosniff");
}

async function readTextFile(filePath: string): Promise<string> {
  if (typeof Bun !== "undefined") {
    return Bun.file(filePath).text();
  }

  return readFile(filePath, "utf8");
}

async function renderFavicon(size: number): Promise<Buffer> {
  const cached = faviconCache.get(size);
  if (cached) return cached;

  const buffer = await sharp(APP_ICON_PATH)
    .resize(size, size, {
      fit: "contain",
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();

  faviconCache.set(size, buffer);
  return buffer;
}

async function sendFavicon(req: express.Request, res: express.Response): Promise<void> {
  try {
    const size = getRequestedFaviconSize(req);
    const buffer = await renderFavicon(size);

    applyIconHeaders(res);
    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("X-Favicon-Size", `${size}x${size}`);
    res.send(buffer);
  } catch (error) {
    console.error("Favicon render error:", error);
    res.status(404).send("Not found");
  }
}

// ──── Helper: create a fresh, tool-registered MCP server instance ────
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: "materio-mcp-server",
    version: "1.0.0",
  });
  registerMaterioTools(server);
  registerExaSearch(server);
  server.tool(executeJsTool.name, executeJsTool.description, executeJsTool.inputSchema, handleExecuteJs);
  server.tool(memoryTool.name, memoryTool.description, memoryTool.inputSchema, handleSaveMemory);
  return server;
}

// ──── Transport: stdio (for Claude Desktop) ────
async function runStdio(): Promise<void> {
  const server = createMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("✅ Materio MCP server running via stdio (JSON-RPC over stdin/stdout)");
}

// ──── Transport: Streamable HTTP (for remote MCP connectors) ────
async function runHTTP(): Promise<void> {
  const port = Number(process.env.PORT ?? 3001);
  const app = express();

  // ── Parse JSON bodies for MCP JSON-RPC requests ──
  app.use(express.json());

  // ── CORS for all origins (needed by remote connectors) ──
  app.use((_req, res, next) => {
    if (_req.method === "GET" || _req.method === "HEAD") {
      applyIconHeaders(res);
    }
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, mcp-session-id, mcp-protocol-version, X-OAuth-Client-Id, X-OAuth-Client-Secret"
    );
    res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
    if (_req.method === "OPTIONS") {
      res.sendStatus(204);
      return;
    }
    next();
  });

  // ════════════════════════════════════════════════════
  //  MCP JSON-RPC endpoint — POST /mcp
  //  This is the core MCP protocol endpoint.
  //  Perplexity and Claude connect here via
  //  Streamable HTTP transport (JSON-RPC 2.0).
  //
  //  IMPORTANT: We create a new McpServer instance
  //  per request to avoid the reconnect race condition.
  //  Each request gets its own server+transport pair.
  // ════════════════════════════════════════════════════
  app.post("/mcp", async (req, res) => {
    try {
      // Stateless: new server + transport per request
      const server = createMcpServer();
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      // Clean up transport when the HTTP connection closes
      res.on("close", () => transport.close());

      // Connect and handle the JSON-RPC request
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("MCP JSON-RPC error:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Internal server error" },
          id: null,
        });
      }
    }
  });

  // ════════════════════════════════════════════════════
  //  Health check
  // ════════════════════════════════════════════════════
  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      server: "materio-mcp-server",
      version: "1.0.0",
      protocol: "MCP (JSON-RPC 2.0 over Streamable HTTP)",
    });
  });

  // ════════════════════════════════════════════════════
  //  Web crawler support
  // ════════════════════════════════════════════════════
  app.get("/", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(200).json({
      jsonrpc: "2.0",
      message: "Materio MCP server is running. Use POST /mcp for JSON-RPC.",
    });
  });

  app.head("/", (_req, res) => {
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(200).end();
  });

  app.get(["/app.png", "/favicon.png", "/favicon.ico", "/apple-touch-icon.png"], sendFavicon);

  // ════════════════════════════════════════════════════
  //  OpenAPI spec — served for ChatGPT Actions import
  // ════════════════════════════════════════════════════
  app.get("/openapi.json", async (_req, res) => {
    try {
      const spec = await readTextFile(OPENAPI_SPEC_PATH);
      res.type("application/json").send(spec);
    } catch {
      res.status(404).json({ error: "openapi.json not found" });
    }
  });

  app.get("/openapi.search-lite.json", async (_req, res) => {
    try {
      const spec = await readTextFile(OPENAPI_LITE_SPEC_PATH);
      res.type("application/json").send(spec);
    } catch {
      res.status(404).json({ error: "openapi.search-lite.json not found" });
    }
  });

  // ════════════════════════════════════════════════════
  //  REST API endpoints — for ChatGPT Custom GPT Actions
  //  These are plain REST wrappers so ChatGPT (which
  //  doesn't speak MCP) can call the same business logic.
  // ════════════════════════════════════════════════════

  app.get("/api/semesters", async (_req, res) => {
    try {
      const semesters = await listSemesters();
      res.json({ semesters, count: semesters.length });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to list semesters." });
    }
  });

  app.get("/api/subjects", async (req, res) => {
    const sem = req.query.semester as string;
    if (!sem) return res.status(400).json({ error: "semester query parameter required" });
    try {
      const subjects = await listSubjects(sem);
      res.json({ semester: sem, subjects, count: subjects.length });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to list subjects." });
    }
  });

  app.get("/api/resources", async (req, res) => {
    const sem = req.query.semester as string;
    const sub = req.query.subject as string;
    if (!sem || !sub) return res.status(400).json({ error: "semester and subject parameters required" });
    try {
      const items = await listResources(sem, sub);
      res.json({ semester: sem, subject: sub, resources: items, count: items.length });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to list resources." });
    }
  });

  app.get("/api/search", async (req, res) => {
    const q = (req.query.query ?? req.query.q) as string;
    if (!q) return res.status(400).json({ error: "query parameter required" });
    try {
      const results = await searchResources(q);
      res.json({ query: q, results, count: results.length });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to search resources." });
    }
  });

  app.get("/api/pdf-url", async (req, res) => {
    const sem = req.query.semester as string;
    const sub = req.query.subject as string;
    const topic = req.query.topic as string;
    if (!sem || !sub || !topic)
      return res.status(400).json({ error: "semester, subject, and topic parameters required" });
    try {
      // Fuzzy-match topic name like the MCP tool does
      const items = await listResources(sem, sub);
      const match = items.find(
        (i) =>
          i.topic.toLowerCase() === topic.toLowerCase() ||
          i.topic.toLowerCase().includes(topic.toLowerCase()) ||
          topic.toLowerCase().includes(i.topic.toLowerCase())
      );
      const pdfUrl = match
        ? await resolvePdfUrl(match.semester, match.subject, match.topic)
        : await resolvePdfUrl(sem, sub, topic);
      res.json({ semester: sem, subject: match?.subject ?? sub, topic: match?.topic ?? topic, pdfUrl });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to resolve PDF URL." });
    }
  });

  app.get("/api/index", async (_req, res) => {
    try {
      const index = await getFullIndex();
      res.json({ totalSubjects: index.length, library: index });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to get library index." });
    }
  });

  app.get("/api/concept-explorer", async (req, res) => {
    const sem = req.query.semester as string;
    const sub = req.query.subject as string;
    const topic = req.query.topic as string;

    if (!sem || !sub || !topic) {
      return res.status(400).json({ error: "semester, subject, and topic parameters required" });
    }

    try {
      const items = await listResources(sem, sub);
      const match = items.find(
        (i) =>
          i.topic.toLowerCase() === topic.toLowerCase() ||
          i.topic.toLowerCase().includes(topic.toLowerCase())
      );

      const chapters = items.filter((i) => i.sectionType === "Chapters");
      const questionBanks = items.filter(
        (i) => i.sectionType === "Question Banks" || i.sectionType === "Important Questions"
      );
      const prevYearPapers = items.filter((i) => i.sectionType === "Previous Year Papers");

      let resolvedUrl = "";
      if (match) {
        resolvedUrl = await resolvePdfUrl(match.semester, match.subject, match.topic);
      }

      res.json({
        found: !!match,
        topic: match?.topic ?? topic,
        semester: sem,
        subject: match?.subject ?? sub,
        sectionType: match?.sectionType ?? "unknown",
        pdfUrl: resolvedUrl || null,
        relatedChapters: chapters.map((c) => c.topic),
        availableQuestionBanks: questionBanks.map((q) => ({
          topic: q.topic,
          pdfUrl: q.pdfUrl,
        })),
        previousYearPapers: prevYearPapers.map((p) => ({
          topic: p.topic,
          pdfUrl: p.pdfUrl,
        })),
      });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to explore concept." });
    }
  });

  app.get("/api/snap-search", async (req, res) => {
    const q = (req.query.query ?? req.query.q) as string;
    const sem = req.query.semester as string | undefined;
    const sub = req.query.subject as string | undefined;
    const pageRaw = req.query.page as string | undefined;
    const resultsPerPageRaw = req.query.results_per_page as string | undefined;
    const maxWordsRaw = req.query.max_words as string | undefined;

    if (!q) {
      return res.status(400).json({ error: "query parameter required" });
    }

    try {
      if (isDiagramIntent(q)) {
        return res.status(400).json({
          error:
            "Diagram requests are not allowed in SnapSearch. Use the diagram tools (GenerateDiagramFromRequest, DiagramGenerator, DiagramValidator).",
        });
      }

      const currentPage = Math.max(1, Number(pageRaw ?? 1) || 1);
      const resultsPerPage = Math.min(20, Math.max(1, Number(resultsPerPageRaw ?? 3) || 3));
      const maxWords = Math.min(500, Math.max(100, Number(maxWordsRaw ?? 350) || 350));
      const fetchCount = Math.max(currentPage * resultsPerPage, 10);
      const results = await queryVectorlessRAG(q, sem, sub, fetchCount);

      if (results.length === 0) {
        return res.json({
          query: q,
          semester: sem ?? null,
          subject: sub ?? null,
          page: currentPage,
          resultsPerPage,
          maxWords,
          results: [],
          count: 0,
          hasMore: false,
          nextPage: null,
          message:
            "No results found. Try broader terminology, a different semester/subject filter, or move to DeepThink/external lookup if needed.",
        });
      }

      const startIndex = (currentPage - 1) * resultsPerPage;
      const pageResults = results.slice(startIndex, startIndex + resultsPerPage);

      let remainingWords = maxWords;
      const items = pageResults.map((r, i) => {
        const remainingItems = pageResults.length - i;
        const available = remainingItems > 0
          ? Math.max(25, Math.floor(remainingWords / remainingItems))
          : remainingWords;
        const clipped = truncateToWordLimit(r.content, available);
        const used = Math.min(countWords(clipped), remainingWords);
        remainingWords = Math.max(0, remainingWords - used);
        return {
          index: startIndex + i + 1,
          topic: r.topic,
          subject: r.subject,
          similarity: r.similarity,
          excerpt: clipped,
        };
      });

      const hasMore = startIndex + resultsPerPage < results.length;
      const nextPage = hasMore ? currentPage + 1 : null;

      res.json({
        query: q,
        semester: sem ?? null,
        subject: sub ?? null,
        page: currentPage,
        resultsPerPage,
        maxWords,
        results: items,
        count: items.length,
        hasMore,
        nextPage,
      });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to perform snap search." });
    }
  });

  app.get("/api/deep-think", async (req, res) => {
    const q = req.query.query as string;
    const sem = req.query.semester as string;
    const sub = req.query.subject as string;

    if (!q || !sem || !sub) {
      return res.status(400).json({ error: "query, semester, and subject parameters required" });
    }

    try {
      const contexts = await queryDeepThinkRAG(q, sem, sub, 5);
      res.json({
        query: q,
        semester: sem,
        subject: sub,
        contexts,
        count: contexts.length,
      });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to perform deep think search." });
    }
  });

  app.get("/api/share-link", async (req, res) => {
    const directUrl = req.query.url as string | undefined;
    const sem = req.query.semester as string | undefined;
    const sub = req.query.subject as string | undefined;
    const topic = req.query.topic as string | undefined;

    try {
      let rawUrl = directUrl;
      if (!rawUrl) {
        if (!sem || !sub || !topic) {
          return res
            .status(400)
            .json({ error: "Provide either url, or semester + subject + topic" });
        }

        const items = await listResources(sem, sub);
        const match = items.find(
          (i) =>
            i.topic.toLowerCase() === topic.toLowerCase() ||
            i.topic.toLowerCase().includes(topic.toLowerCase())
        );

        if (match) {
          rawUrl = await resolvePdfUrl(match.semester, match.subject, match.topic);
        } else {
          rawUrl = await resolvePdfUrl(sem, sub, topic);
        }
      }

      if (!rawUrl) {
        return res.status(400).json({ error: "Could not resolve a PDF URL to generate a share link." });
      }

      const shareLink = await generateMaskedUrl(rawUrl);
      res.json({ shareLink });
    } catch (e: any) {
      res.status(500).json({ error: "Failed to generate share link." });
    }
  });

  app.get("/api/lookup-external-sources", async (req, res) => {
    const topic = req.query.topic as string;
    const useExa = String(req.query.useExa ?? req.query.use_exa ?? "").toLowerCase() === "true";
    if (!topic) return res.status(400).json({ error: "topic parameter required" });

    try {
      const result = await lookupExternalSources(topic, useExa);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: "Failed to look up external sources." });
    }
  });

  app.post("/mcp/elevated", async (req, res) => {
    try {
      const access = await authorizeMaterioAccess(req);
      res.json({
        message: "Access granted",
        accessLevel: access.accessLevel,
        user: access.user,
      });
    } catch (error) {
      if (error instanceof AuthError) {
        res.status(error.status).json({ error: error.message });
        return;
      }

      res.status(500).json({ error: "Failed to authorize Materio access." });
    }
  });

  // ── Supermemory Proxy ──
  app.use("/api/memory", async (req: express.Request, res: express.Response) => {
    try {
      const apiKey = req.headers.authorization?.replace("Bearer ", "");
      if (!apiKey) {
         res.status(401).json({ error: "Missing API Key" });
         return;
      }

      const subPath = req.url; // e.g. "/", "/list", "/search"
      const targetUrl = `https://api.supermemory.ai/v3${subPath === "/" ? "" : subPath}`;
      
      const response = await fetch(targetUrl, {
        method: req.method,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
        },
        body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body) : undefined,
      });

      const text = await response.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { message: text };
      }
      res.status(response.status).json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Database Routes ──
  app.get("/api/db/conversations", requireAuth, async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const query = req.user ? { userId: req.user.id } : { anonymousId: req.anonymousId };
      if (!query.userId && !query.anonymousId) {
        return res.json([]);
      }
      const convos = await Conversation.find(query).sort({ updatedAt: -1 }).lean();
      res.json(convos);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/db/conversations", requireAuth, async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      if (!req.user && !req.anonymousId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      const conv = req.body;
      if (req.user) conv.userId = req.user.id;
      else if (req.anonymousId) conv.anonymousId = req.anonymousId;

      const query = req.user ? { id: conv.id, userId: req.user.id } : { id: conv.id, anonymousId: req.anonymousId };
      
      const updated = await Conversation.findOneAndUpdate(query, conv, { upsert: true, new: true }).lean();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/db/conversations/:id", requireAuth, async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const query = req.user ? { id: req.params.id, userId: req.user.id } : { id: req.params.id, anonymousId: req.anonymousId };
      const convo = await Conversation.findOne(query);
      if (!convo) return res.status(404).json({ error: "Not found or unauthorized" });

      await Conversation.deleteOne(query);
      await Message.deleteMany({ conversationId: req.params.id });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/db/conversations/:id/messages", requireAuth, async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      const query = req.user ? { id: req.params.id, userId: req.user.id } : { id: req.params.id, anonymousId: req.anonymousId };
      const convo = await Conversation.findOne(query);
      if (!convo) return res.status(404).json({ error: "Not found or unauthorized" });

      const msgs = await Message.find({ conversationId: req.params.id }).sort({ timestamp: 1 }).lean();
      res.json(msgs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/db/messages", requireAuth, async (req: AuthenticatedRequest, res: express.Response) => {
    try {
      if (!req.user && !req.anonymousId) {
        return res.status(401).json({ error: "Unauthorized" });
      }
      
      const msg = req.body;
      
      // Enforce rate limiting for NEW user messages
      if (msg.role === "user" && !msg._id) {
        const isExisting = await Message.exists({ id: msg.id });
        if (!isExisting) {
          if (req.user) {
            const startOfDay = new Date();
            startOfDay.setHours(0, 0, 0, 0);
            const messageCount = await Message.countDocuments({
              userId: req.user.id,
              timestamp: { $gte: startOfDay.getTime() },
              role: "user"
            });
            
            let limit = 20;
            if (req.user.hasAdminPrivileges) limit = 70;
            else if (req.user.isPlusUser) limit = 35;
            
            if (messageCount >= limit) {
              return res.status(429).json({ error: "Daily message limit reached" });
            }
          } else if (req.anonymousId) {
            const messageCount = await Message.countDocuments({
              anonymousId: req.anonymousId,
              role: "user"
            });
            
            if (messageCount >= 3) {
              return res.status(429).json({ error: "Free trial limit reached. Please log in to continue." });
            }
          }
        }
      }

      if (req.user) msg.userId = req.user.id;
      else if (req.anonymousId) msg.anonymousId = req.anonymousId;

      const query = req.user ? { id: msg.id, userId: req.user.id } : { id: msg.id, anonymousId: req.anonymousId };
      const updated = await Message.findOneAndUpdate(query, msg, { upsert: true, new: true }).lean();
      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Start ──
  await connectDB();
  app.listen(port, () => {
    console.error(`✅ Materio MCP server running on http://localhost:${port}`);
    console.error(`   ┌─────────────────────────────────────────────────────┐`);
    console.error(`   │  MCP (JSON-RPC 2.0):  POST http://localhost:${port}/mcp  │`);
    console.error(`   │  Health:              GET  http://localhost:${port}/health │`);
    console.error(`   │  OpenAPI (ChatGPT):   GET  http://localhost:${port}/openapi.json │`);
    console.error(`   │  REST API (ChatGPT):  GET  http://localhost:${port}/api/* │`);
    console.error(`   │  Protected auth:      POST http://localhost:${port}/mcp/elevated │`);
    console.error(`   └─────────────────────────────────────────────────────┘`);
    console.error(`\n   Perplexity / Claude → POST /mcp (Streamable HTTP, JSON-RPC 2.0)`);
    console.error(`   ChatGPT Custom GPT  → GET  /api/* (REST, via openapi.json)`);
  });
}

// ──── Choose transport ────
const transport = process.env.TRANSPORT ?? "http";

if (transport === "stdio") {
  runStdio().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
} else {
  runHTTP().catch((err) => {
    console.error("Fatal:", err);
    process.exit(1);
  });
}
