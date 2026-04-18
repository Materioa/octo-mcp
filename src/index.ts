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
import { registerMaterioTools } from "./tools/materio.js";
import {
  listSemesters,
  listSubjects,
  listResources,
  searchResources,
  resolvePdfUrl,
  getFullIndex,
} from "./services/resources.js";

// ──── Create MCP server ────
const server = new McpServer({
  name: "materio-mcp-server",
  version: "1.0.0",
});

// ──── Register all tools ────
registerMaterioTools(server);

// ──── Transport: stdio (for Claude Desktop) ────
async function runStdio(): Promise<void> {
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
  // ════════════════════════════════════════════════════
  app.post("/mcp", async (req, res) => {
    try {
      // Stateless: new transport per request (no session collisions)
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
    res.setHeader("Link", [
      '</app.png>; rel="icon"; sizes="16x16"',
      '</app.png>; rel="icon"; sizes="24x24"',
      '</app.png>; rel="icon"; sizes="32x32"',
      '</app.png>; rel="icon"; sizes="48x48"',
      '</app.png>; rel="icon"; sizes="64x64"',
      '</app.png>; rel="icon"; sizes="128x128"',
      '</app.png>; rel="icon"; sizes="256x256"',
      '</app.png>; rel="icon"; sizes="512x512"'
    ].join(", "));
    res.status(200).send("");
  });

  app.get("/app.png", async (_req, res) => {
    try {
      const file = Bun.file(new URL("./app.png", import.meta.url).pathname);
      if (await file.exists()) {
        res.type("image/png").send(await file.arrayBuffer());
      } else {
        res.status(404).send("Not found");
      }
    } catch {
      res.status(404).send("Not found");
    }
  });

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
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/subjects", async (req, res) => {
    const sem = req.query.semester as string;
    if (!sem) return res.status(400).json({ error: "semester query parameter required" });
    try {
      const subjects = await listSubjects(sem);
      res.json({ semester: sem, subjects, count: subjects.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
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
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/search", async (req, res) => {
    const q = (req.query.query ?? req.query.q) as string;
    if (!q) return res.status(400).json({ error: "query parameter required" });
    try {
      const results = await searchResources(q);
      res.json({ query: q, results, count: results.length });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/pdf-url", async (req, res) => {
    const sem = req.query.semester as string;
    const sub = req.query.subject as string;
    const topic = req.query.topic as string;
    if (!sem || !sub || !topic)
      return res.status(400).json({ error: "semester, subject, and topic parameters required" });
    try {
      const pdfUrl = await resolvePdfUrl(sem, sub, topic);
      res.json({ semester: sem, subject: sub, topic, pdfUrl });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get("/api/index", async (_req, res) => {
    try {
      const index = await getFullIndex();
      res.json({ totalSubjects: index.length, library: index });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
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
