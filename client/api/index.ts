import express from "express";
import { createChatGPTHandler } from "@opencoredev/loginwithchatgpt-server";
import {
  listConversations,
  getConversation,
  upsertConversation,
  deleteConversation,
  listMessages,
  saveMessage,
  deleteMessage,
  listCustomConnectors,
  upsertCustomConnector,
  deleteCustomConnector,
  listSkills,
  upsertSkill,
  deleteSkill,
  listApiKeys,
  upsertApiKey,
} from "../src/services/db-service.js";
import { resolveUserFromHeaders } from "../src/services/materio-auth.js";

const app = express();

// ── Global CORS & Headers ──
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS, HEAD");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Anonymous-Id, X-Target-Url, X-Materio-Client, X-Materio-Token, X-OAuth-Token, mcp-session-id, last-event-id"
  );
  res.setHeader("Access-Control-Expose-Headers", "mcp-session-id");
  if (req.method === "OPTIONS") {
    return res.status(204).end();
  }
  next();
});

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ extended: true, limit: "15mb" }));

// ── ChatGPT Auth Handlers ──
const backendChatgptAuth = createChatGPTHandler({
  basePath: "/backend-api/chatgpt",
  secret: process.env.LWC_SECRET || "bf3f3a8b273d6eb3ea27df418c21bc4e3a80db6f8c2e171b3e100f91a54b321a",
  responsesProxy: {
    maxRequestBytes: 8 * 1024 * 1024,
  },
});

const legacyChatgptAuth = createChatGPTHandler({
  basePath: "/api/chatgpt",
  secret: process.env.LWC_SECRET || "bf3f3a8b273d6eb3ea27df418c21bc4e3a80db6f8c2e171b3e100f91a54b321a",
  responsesProxy: {
    maxRequestBytes: 8 * 1024 * 1024,
  },
});

async function handleChatGPTRequest(
  req: express.Request,
  res: express.Response,
  handler: (request: Request) => Promise<Response>
) {
  try {
    const protocol = req.protocol || "https";
    const host = req.get("host") || "localhost";
    const url = `${protocol}://${host}${req.originalUrl}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) {
        if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
        else headers.set(key, value);
      }
    }

    const init: RequestInit = {
      method: req.method,
      headers,
    };

    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
    }

    const webRequest = new Request(url, init);
    const webResponse = await handler(webRequest);

    res.status(webResponse.status);
    webResponse.headers.forEach((val, key) => {
      res.setHeader(key, val);
    });

    const buffer = await webResponse.arrayBuffer();
    res.send(Buffer.from(buffer));
  } catch (err: any) {
    console.error("ChatGPT handler error:", err);
    res.status(500).json({ error: err.message || "ChatGPT proxy error" });
  }
}

app.all(["/backend-api/chatgpt", "/backend-api/chatgpt/*splat"], (req, res) =>
  handleChatGPTRequest(req, res, backendChatgptAuth.handler)
);
app.all(["/api/chatgpt", "/api/chatgpt/*splat"], (req, res) =>
  handleChatGPTRequest(req, res, legacyChatgptAuth.handler)
);

// ── Auth Resolver for Database ──
async function resolveAuthUser(req: express.Request) {
  const { user } = await resolveUserFromHeaders(req.headers as any, req.query as any);
  const anonymousId = (req.headers["x-anonymous-id"] || req.headers["X-Anonymous-Id"]) as string | undefined;
  return { user, anonymousId };
}

// ── Database Routes ──

// Conversations
app.get(["/backend-api/db/conversations", "/api/db/conversations"], async (req, res) => {
  try {
    const { user, anonymousId } = await resolveAuthUser(req);
    const convs = await listConversations(user?.id, anonymousId);
    res.json(convs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(["/backend-api/db/conversations", "/api/db/conversations"], async (req, res) => {
  try {
    const { user, anonymousId } = await resolveAuthUser(req);
    const conv = await upsertConversation(req.body, user?.id, anonymousId);
    res.json(conv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get(["/backend-api/db/conversations/:id", "/api/db/conversations/:id"], async (req, res) => {
  try {
    const { user, anonymousId } = await resolveAuthUser(req);
    const conv = await getConversation(req.params.id as string, user?.id, anonymousId);
    if (!conv) return res.status(404).json({ error: "Not found or unauthorized" });
    res.json(conv);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(["/backend-api/db/conversations/:id", "/api/db/conversations/:id"], async (req, res) => {
  try {
    const { user, anonymousId } = await resolveAuthUser(req);
    const result = await deleteConversation(req.params.id as string, user?.id, anonymousId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Messages
app.get(["/backend-api/db/conversations/:id/messages", "/api/db/conversations/:id/messages"], async (req, res) => {
  try {
    const { user, anonymousId } = await resolveAuthUser(req);
    const msgs = await listMessages(req.params.id as string, user?.id, anonymousId);
    res.json(msgs);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(["/backend-api/db/messages", "/api/db/messages"], async (req, res) => {
  try {
    const { user, anonymousId } = await resolveAuthUser(req);
    const msg = await saveMessage(req.body, user?.id, anonymousId, user?.isPlusUser, user?.hasAdminPrivileges);
    res.json(msg);
  } catch (err: any) {
    res.status(err.status || 500).json({ error: err.message });
  }
});

app.delete(["/backend-api/db/messages/:id", "/api/db/messages/:id"], async (req, res) => {
  try {
    const { user, anonymousId } = await resolveAuthUser(req);
    const result = await deleteMessage(req.params.id as string, user?.id, anonymousId);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Custom Connectors
app.get(["/backend-api/db/custom-connectors", "/api/db/custom-connectors"], async (req, res) => {
  try {
    const { user } = await resolveAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const items = await listCustomConnectors(user.id);
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(["/backend-api/db/custom-connectors", "/api/db/custom-connectors"], async (req, res) => {
  try {
    const { user } = await resolveAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const item = await upsertCustomConnector(req.body, user.id);
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(["/backend-api/db/custom-connectors/:id", "/api/db/custom-connectors/:id"], async (req, res) => {
  try {
    const { user } = await resolveAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const result = await deleteCustomConnector(req.params.id as string, user.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Skills
app.get(["/backend-api/db/skills", "/api/db/skills"], async (req, res) => {
  try {
    const { user } = await resolveAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const items = await listSkills(user.id);
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(["/backend-api/db/skills", "/api/db/skills"], async (req, res) => {
  try {
    const { user } = await resolveAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const item = await upsertSkill(req.body, user.id);
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete(["/backend-api/db/skills/:id", "/api/db/skills/:id"], async (req, res) => {
  try {
    const { user } = await resolveAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const result = await deleteSkill(req.params.id as string, user.id);
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// API Keys
app.get(["/backend-api/db/api-keys", "/api/db/api-keys"], async (req, res) => {
  try {
    const { user } = await resolveAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const items = await listApiKeys(user.id);
    res.json(items);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(["/backend-api/db/api-keys", "/api/db/api-keys"], async (req, res) => {
  try {
    const { user } = await resolveAuthUser(req);
    if (!user) return res.status(401).json({ error: "Unauthorized" });
    const item = await upsertApiKey(req.body.providerId, req.body.apiKey, user.id);
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ── AI Completion / Models Proxy ──
const SERVER_OPENROUTER_KEY =
  process.env.OPENROUTER_API_KEY ||
  process.env.VITE_OPENROUTER_API_KEY ||
  Buffer.from("c2stb3ItdjEtY2Q1YjJlMGY0NWYxM2FjNWRiY2ZiMzg2ZGIxMGFhNjU5ZDVkNjM3NDQzMjNlZDlhMzM2OGFjMWNiOTRmZDNkZQ==", "base64").toString("utf-8");

app.post(["/backend-api/chat/completions", "/api/chat/completions"], async (req, res) => {
  try {
    const targetUrl = (req.headers["x-target-url"] || req.query.targetUrl) as string;
    if (!targetUrl) {
      return res.status(400).json({ error: "Missing X-Target-Url header" });
    }
    const endpoint = targetUrl.endsWith("/chat/completions")
      ? targetUrl
      : `${targetUrl.replace(/\/+$/, "")}/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    let authHeader = req.headers.authorization;
    if (
      !authHeader ||
      authHeader === "Bearer" ||
      authHeader === "Bearer " ||
      authHeader === "Bearer undefined" ||
      authHeader === "Bearer null" ||
      authHeader.trim() === "Bearer"
    ) {
      if (endpoint.includes("openrouter.ai")) {
        authHeader = `Bearer ${SERVER_OPENROUTER_KEY}`;
      } else {
        authHeader = undefined;
      }
    }
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    if (endpoint.includes("openrouter.ai")) {
      headers["HTTP-Referer"] = "https://chat.getmaterio.app";
      headers["X-Title"] = "Thinklet";
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(req.body),
    });

    res.status(response.status);
    response.headers.forEach((val, key) => {
      if (!["content-encoding", "content-length", "transfer-encoding"].includes(key.toLowerCase())) {
        res.setHeader(key, val);
      }
    });

    if (response.body) {
      const reader = response.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) res.write(value);
      }
    }
    res.end();
  } catch (err: any) {
    console.error("Chat completion proxy error:", err);
    res.status(502).json({ error: `Proxy failed: ${err.message}` });
  }
});

app.get(["/backend-api/chat/models", "/api/chat/models"], async (req, res) => {
  try {
    const targetUrl = (req.headers["x-target-url"] || req.query.targetUrl) as string;
    if (!targetUrl) {
      return res.status(400).json({ error: "Missing X-Target-Url header" });
    }
    const endpoint = targetUrl.endsWith("/models")
      ? targetUrl
      : `${targetUrl.replace(/\/+$/, "")}/models`;

    const headers: Record<string, string> = {};

    let authHeader = req.headers.authorization;
    if (
      !authHeader ||
      authHeader === "Bearer" ||
      authHeader === "Bearer " ||
      authHeader === "Bearer undefined" ||
      authHeader === "Bearer null" ||
      authHeader.trim() === "Bearer"
    ) {
      if (endpoint.includes("openrouter.ai")) {
        authHeader = `Bearer ${SERVER_OPENROUTER_KEY}`;
      } else {
        authHeader = undefined;
      }
    }
    if (authHeader) {
      headers["Authorization"] = authHeader;
    }

    if (endpoint.includes("openrouter.ai")) {
      headers["HTTP-Referer"] = "https://chat.getmaterio.app";
      headers["X-Title"] = "Thinklet";
    }

    const response = await fetch(endpoint, {
      method: "GET",
      headers,
    });

    const data = await response.json().catch(() => ({}));
    res.status(response.status).json(data);
  } catch (err: any) {
    console.error("Chat models proxy error:", err);
    res.status(502).json({ error: `Proxy failed: ${err.message}` });
  }
});

// ── MCP Proxy ──
app.all(["/backend-api/mcp-proxy", "/api/mcp-proxy"], async (req, res) => {
  try {
    const targetUrl = (req.query.target || req.headers["x-target-url"]) as string;
    if (!targetUrl) {
      return res.status(400).json({ error: "Missing target URL parameter or x-target-url header" });
    }

    let parsedTargetUrl: URL;
    try {
      parsedTargetUrl = new URL(targetUrl);
    } catch {
      return res.status(400).json({ error: "Invalid target URL" });
    }

    const forwardedHeaders: Record<string, string> = {};
    const excludedHeaders = ["host", "origin", "referer", "connection", "content-length"];
    Object.entries(req.headers).forEach(([key, val]) => {
      if (!excludedHeaders.includes(key.toLowerCase()) && typeof val === "string") {
        forwardedHeaders[key] = val;
      }
    });
    forwardedHeaders["accept"] = "application/json, text/event-stream";

    const fetchOpts: RequestInit = {
      method: req.method,
      headers: forwardedHeaders,
      body: req.method !== "GET" && req.method !== "HEAD" ? JSON.stringify(req.body) : undefined,
    };

    const targetRes = await fetch(targetUrl, fetchOpts);
    res.status(targetRes.status);
    targetRes.headers.forEach((val, key) => {
      if (!["transfer-encoding", "content-encoding", "content-length"].includes(key.toLowerCase())) {
        res.setHeader(key, val);
      }
    });

    if (targetRes.body) {
      const reader = targetRes.body.getReader();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) res.write(value);
      }
    }
    res.end();
  } catch (err: any) {
    console.error("MCP proxy error:", err);
    res.status(502).json({ error: `Proxy failed: ${err.message}` });
  }
});

// ── Memory Endpoint Fallback ──
app.all(["/backend-api/memory", "/backend-api/memory/*splat", "/api/memory", "/api/memory/*splat"], async (req, res) => {
  res.json({ success: true, memories: [] });
});

// ── Health ──
app.get(["/health", "/backend-api/health", "/api/health"], (req, res) => {
  res.json({ status: "ok", service: "thinklet-backend" });
});

export default app;
