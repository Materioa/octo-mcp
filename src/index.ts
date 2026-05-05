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

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import express from "express";
import sharp from "sharp";
import { fileURLToPath } from "url";
import { registerMaterioTools } from "./tools/materio.js";
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
import { lookupGfG } from "./tools/gfg.js";

const APP_ICON_PATH = fileURLToPath(new URL("./app.png", import.meta.url));
const FAVICON_SIZES = [16, 24, 32, 48, 64, 96, 128, 180, 192, 256, 512];
const faviconCache = new Map<number, Buffer>();

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
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS, DELETE");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, mcp-session-id");
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
    res.setHeader("Link", faviconLinkHeader());
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.status(204).send();
  });

  app.get(["/app.png", "/favicon.png", "/favicon.ico"], sendFavicon);

  // ════════════════════════════════════════════════════
  //  OpenAPI spec — served for ChatGPT Actions import
  // ════════════════════════════════════════════════════
  app.get("/openapi.json", async (_req, res) => {
    try {
      const spec = await Bun.file(
        new URL("../openapi.json", import.meta.url).pathname
      ).text();
      res.type("application/json").send(spec);
    } catch {
      res.status(404).json({ error: "openapi.json not found" });
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

    if (!q) {
      return res.status(400).json({ error: "query parameter required" });
    }

    try {
      const results = await queryVectorlessRAG(q, sem, sub, 10);
      res.json({
        query: q,
        semester: sem ?? null,
        subject: sub ?? null,
        results,
        count: results.length,
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
    if (!topic) return res.status(400).json({ error: "topic parameter required" });

    try {
      const result = await lookupGfG(topic);
      res.json(result);
    } catch (e: any) {
      res.status(500).json({ error: "Failed to look up external sources." });
    }
  });

  // ── Start ──
  app.listen(port, () => {
    console.error(`✅ Materio MCP server running on http://localhost:${port}`);
    console.error(`   ┌─────────────────────────────────────────────────────┐`);
    console.error(`   │  MCP (JSON-RPC 2.0):  POST http://localhost:${port}/mcp  │`);
    console.error(`   │  Health:              GET  http://localhost:${port}/health │`);
    console.error(`   │  OpenAPI (ChatGPT):   GET  http://localhost:${port}/openapi.json │`);
    console.error(`   │  REST API (ChatGPT):  GET  http://localhost:${port}/api/* │`);
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
