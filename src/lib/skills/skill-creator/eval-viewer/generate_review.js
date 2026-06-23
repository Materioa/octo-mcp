#!/usr/bin/env node
/**
 * generate_review.js — Generate and serve a review page for eval results.
 *
 * Reads the workspace directory, discovers runs (directories with outputs/),
 * embeds all output data into a self-contained HTML page, and serves it via
 * a tiny HTTP server. Feedback auto-saves to feedback.json in the workspace.
 *
 * Usage:
 *   node generate_review.js <workspace-path> [--port PORT] [--skill-name NAME]
 *   node generate_review.js <workspace-path> --previous-workspace /path/to/old
 *   node generate_review.js <workspace-path> --static output.html
 *
 * No npm dependencies required — uses Node.js built-ins only.
 */

import { createServer } from "http";
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "fs";
import { dirname, resolve, join, relative, basename, extname } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { networkInterfaces } from "os";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Constants ─────────────────────────────────────────────────────────────────

const METADATA_FILES = new Set(["transcript.md", "user_notes.md", "metrics.json"]);

const TEXT_EXTENSIONS = new Set([
  ".txt", ".md", ".json", ".csv", ".py", ".js", ".ts", ".tsx", ".jsx",
  ".yaml", ".yml", ".xml", ".html", ".css", ".sh", ".rb", ".go", ".rs",
  ".java", ".c", ".cpp", ".h", ".hpp", ".sql", ".r", ".toml",
]);

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp"]);

const MIME_MAP = {
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".pdf":  "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".json": "application/json",
  ".html": "text/html",
  ".css":  "text/css",
  ".js":   "text/javascript",
  ".txt":  "text/plain",
  ".md":   "text/markdown",
};

function getMimeType(filePath) {
  const ext = extname(filePath).toLowerCase();
  return MIME_MAP[ext] || "application/octet-stream";
}

// ── Run discovery ─────────────────────────────────────────────────────────────

function findRuns(workspace) {
  const runs = [];
  findRunsRecursive(workspace, workspace, runs);
  runs.sort((a, b) => {
    const ai = a.eval_id !== null ? a.eval_id : Infinity;
    const bi = b.eval_id !== null ? b.eval_id : Infinity;
    if (ai !== bi) return ai - bi;
    return a.id < b.id ? -1 : 1;
  });
  return runs;
}

function findRunsRecursive(root, current, runs) {
  if (!existsSync(current) || !statSync(current).isDirectory()) return;

  const outputsDir = join(current, "outputs");
  if (existsSync(outputsDir) && statSync(outputsDir).isDirectory()) {
    const run = buildRun(root, current);
    if (run) runs.push(run);
    return;
  }

  const SKIP = new Set(["node_modules", ".git", "__pycache__", "skill", "inputs"]);
  try {
    const children = readdirSync(current).sort();
    for (const child of children) {
      const childPath = join(current, child);
      if (!statSync(childPath).isDirectory()) continue;
      if (SKIP.has(child)) continue;
      findRunsRecursive(root, childPath, runs);
    }
  } catch (_) {}
}

function buildRun(root, runDir) {
  let prompt = "";
  let evalId = null;

  // Try eval_metadata.json (in run dir or parent)
  for (const candidate of [
    join(runDir, "eval_metadata.json"),
    join(dirname(runDir), "eval_metadata.json"),
  ]) {
    if (existsSync(candidate)) {
      try {
        const meta = JSON.parse(readFileSync(candidate, "utf8"));
        prompt = meta.prompt || "";
        evalId = meta.eval_id ?? null;
      } catch (_) {}
      if (prompt) break;
    }
  }

  // Fall back to transcript.md
  if (!prompt) {
    for (const candidate of [
      join(runDir, "transcript.md"),
      join(runDir, "outputs", "transcript.md"),
    ]) {
      if (existsSync(candidate)) {
        try {
          const text = readFileSync(candidate, "utf8");
          const m = text.match(/## Eval Prompt\n\n([\s\S]*?)(?=\n##|$)/);
          if (m) prompt = m[1].trim();
        } catch (_) {}
        if (prompt) break;
      }
    }
  }

  if (!prompt) prompt = "(No prompt found)";

  const runId = relative(root, runDir).replace(/[\\/]/g, "-");

  // Collect output files
  const outputsDir = join(runDir, "outputs");
  const outputFiles = [];
  if (existsSync(outputsDir) && statSync(outputsDir).isDirectory()) {
    let files;
    try { files = readdirSync(outputsDir).sort(); } catch (_) { files = []; }
    for (const f of files) {
      const fp = join(outputsDir, f);
      if (!statSync(fp).isFile()) continue;
      if (METADATA_FILES.has(f)) continue;
      outputFiles.push(embedFile(fp));
    }
  }

  // Load grading
  let grading = null;
  for (const candidate of [
    join(runDir, "grading.json"),
    join(dirname(runDir), "grading.json"),
  ]) {
    if (existsSync(candidate)) {
      try { grading = JSON.parse(readFileSync(candidate, "utf8")); } catch (_) {}
      if (grading) break;
    }
  }

  return { id: runId, prompt, eval_id: evalId, outputs: outputFiles, grading };
}

// ── File embedding ─────────────────────────────────────────────────────────────

function embedFile(filePath) {
  const ext = extname(filePath).toLowerCase();
  const name = basename(filePath);
  const mime = getMimeType(filePath);

  if (TEXT_EXTENSIONS.has(ext)) {
    let content;
    try { content = readFileSync(filePath, "utf8"); } catch (_) { content = "(Error reading file)"; }
    return { name, type: "text", content };
  }

  if (IMAGE_EXTENSIONS.has(ext)) {
    try {
      const b64 = readFileSync(filePath).toString("base64");
      return { name, type: "image", mime, data_uri: `data:${mime};base64,${b64}` };
    } catch (_) {
      return { name, type: "error", content: "(Error reading file)" };
    }
  }

  if (ext === ".pdf") {
    try {
      const b64 = readFileSync(filePath).toString("base64");
      return { name, type: "pdf", data_uri: `data:${mime};base64,${b64}` };
    } catch (_) {
      return { name, type: "error", content: "(Error reading file)" };
    }
  }

  if (ext === ".xlsx") {
    try {
      const b64 = readFileSync(filePath).toString("base64");
      return { name, type: "xlsx", data_b64: b64 };
    } catch (_) {
      return { name, type: "error", content: "(Error reading file)" };
    }
  }

  // Binary / unknown
  try {
    const b64 = readFileSync(filePath).toString("base64");
    return { name, type: "binary", mime, data_uri: `data:${mime};base64,${b64}` };
  } catch (_) {
    return { name, type: "error", content: "(Error reading file)" };
  }
}

// ── Previous iteration loader ─────────────────────────────────────────────────

function loadPreviousIteration(workspace) {
  const result = {};

  // Load feedback map
  const feedbackMap = {};
  const feedbackPath = join(workspace, "feedback.json");
  if (existsSync(feedbackPath)) {
    try {
      const data = JSON.parse(readFileSync(feedbackPath, "utf8"));
      for (const r of data.reviews || []) {
        if (r.feedback && r.feedback.trim()) feedbackMap[r.run_id] = r.feedback;
      }
    } catch (_) {}
  }

  // Load runs
  const prevRuns = findRuns(workspace);
  for (const run of prevRuns) {
    result[run.id] = {
      feedback: feedbackMap[run.id] || "",
      outputs: run.outputs || [],
    };
  }

  // Add feedback for run_ids without a matching run
  for (const [runId, fb] of Object.entries(feedbackMap)) {
    if (!(runId in result)) result[runId] = { feedback: fb, outputs: [] };
  }

  return result;
}

// ── HTML generation ───────────────────────────────────────────────────────────

function generateHtml(runs, skillName, previous = null, benchmark = null) {
  const templatePath = join(__dirname, "viewer.html");
  const template = readFileSync(templatePath, "utf8");

  const previousFeedback = {};
  const previousOutputs = {};
  if (previous) {
    for (const [runId, data] of Object.entries(previous)) {
      if (data.feedback) previousFeedback[runId] = data.feedback;
      if (data.outputs && data.outputs.length) previousOutputs[runId] = data.outputs;
    }
  }

  const embedded = { skill_name: skillName, runs, previous_feedback: previousFeedback, previous_outputs: previousOutputs };
  if (benchmark) embedded.benchmark = benchmark;

  const dataJson = JSON.stringify(embedded);
  return template.replace("/*__EMBEDDED_DATA__*/", `const EMBEDDED_DATA = ${dataJson};`);
}

// ── Port helpers ──────────────────────────────────────────────────────────────

function killPort(port) {
  try {
    // Windows: netstat approach
    const out = execSync(`netstat -ano | findstr :${port}`, { timeout: 5000 }).toString();
    const pids = new Set();
    for (const line of out.split("\n")) {
      const parts = line.trim().split(/\s+/);
      const lastPart = parts[parts.length - 1];
      if (/^\d+$/.test(lastPart)) pids.add(lastPart);
    }
    for (const pid of pids) {
      try { execSync(`taskkill /PID ${pid} /F`, { stdio: "ignore" }); } catch (_) {}
    }
  } catch (_) {
    // Try Unix lsof if Windows approach fails (cross-platform fallback)
    try {
      const out = execSync(`lsof -ti :${port}`, { timeout: 5000 }).toString();
      for (const pid of out.trim().split("\n")) {
        if (/^\d+$/.test(pid.trim())) {
          try { process.kill(parseInt(pid.trim()), "SIGTERM"); } catch (_) {}
        }
      }
    } catch (_) {}
  }
}

function findFreePort(preferred) {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.listen(preferred, "127.0.0.1", () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on("error", () => {
      const srv2 = createServer();
      srv2.listen(0, "127.0.0.1", () => {
        const port = srv2.address().port;
        srv2.close(() => resolve(port));
      });
    });
  });
}

// ── HTTP server ───────────────────────────────────────────────────────────────

function createReviewServer(workspace, skillName, feedbackPath, previous, benchmarkPath) {
  return createServer((req, res) => {
    const url = req.url || "/";

    if (req.method === "GET" && (url === "/" || url === "/index.html")) {
      const runs = findRuns(workspace);
      let benchmark = null;
      if (benchmarkPath && existsSync(benchmarkPath)) {
        try { benchmark = JSON.parse(readFileSync(benchmarkPath, "utf8")); } catch (_) {}
      }
      const html = generateHtml(runs, skillName, previous, benchmark);
      const body = Buffer.from(html, "utf8");
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Content-Length": body.length });
      res.end(body);
      return;
    }

    if (req.method === "GET" && url === "/api/feedback") {
      let data = Buffer.from("{}");
      if (existsSync(feedbackPath)) {
        try { data = readFileSync(feedbackPath); } catch (_) {}
      }
      res.writeHead(200, { "Content-Type": "application/json", "Content-Length": data.length });
      res.end(data);
      return;
    }

    if (req.method === "POST" && url === "/api/feedback") {
      const chunks = [];
      req.on("data", (c) => chunks.push(c));
      req.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString("utf8");
          const parsed = JSON.parse(body);
          if (typeof parsed !== "object" || !Array.isArray(parsed.reviews)) {
            throw new Error("Expected JSON object with 'reviews' array");
          }
          writeFileSync(feedbackPath, JSON.stringify(parsed, null, 2) + "\n", "utf8");
          const resp = Buffer.from('{"ok":true}');
          res.writeHead(200, { "Content-Type": "application/json", "Content-Length": resp.length });
          res.end(resp);
        } catch (err) {
          const resp = Buffer.from(JSON.stringify({ error: err.message }));
          res.writeHead(500, { "Content-Type": "application/json", "Content-Length": resp.length });
          res.end(resp);
        }
      });
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found");
  });
}

// ── CLI ───────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = { workspace: null, port: 3117, skillName: null, previousWorkspace: null, benchmark: null, static: null };
  const positional = [];

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--port" || a === "-p") { args.port = parseInt(argv[++i], 10); }
    else if (a === "--skill-name" || a === "-n") { args.skillName = argv[++i]; }
    else if (a === "--previous-workspace") { args.previousWorkspace = argv[++i]; }
    else if (a === "--benchmark") { args.benchmark = argv[++i]; }
    else if (a === "--static" || a === "-s") { args.static = argv[++i]; }
    else if (!a.startsWith("-")) { positional.push(a); }
  }

  args.workspace = positional[0] || null;
  return args;
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.workspace) {
    console.error("Usage: node generate_review.js <workspace-path> [options]");
    console.error("\nOptions:");
    console.error("  --port, -p <n>            Server port (default: 3117)");
    console.error("  --skill-name, -n <name>   Skill name for header");
    console.error("  --previous-workspace <p>  Previous iteration workspace path");
    console.error("  --benchmark <path>        Path to benchmark.json");
    console.error("  --static, -s <path>       Write static HTML instead of starting server");
    process.exit(1);
  }

  const workspace = resolve(args.workspace);
  if (!existsSync(workspace) || !statSync(workspace).isDirectory()) {
    console.error(`Error: ${workspace} is not a directory`);
    process.exit(1);
  }

  const runs = findRuns(workspace);
  if (!runs.length) {
    console.error(`No runs found in ${workspace}`);
    process.exit(1);
  }

  const skillName = args.skillName || basename(workspace).replace(/-workspace$/, "");
  const feedbackPath = join(workspace, "feedback.json");

  let previous = {};
  if (args.previousWorkspace) {
    previous = loadPreviousIteration(resolve(args.previousWorkspace));
  }

  const benchmarkPath = args.benchmark ? resolve(args.benchmark) : null;
  let benchmark = null;
  if (benchmarkPath && existsSync(benchmarkPath)) {
    try { benchmark = JSON.parse(readFileSync(benchmarkPath, "utf8")); } catch (_) {}
  }

  // Static mode
  if (args.static) {
    const html = generateHtml(runs, skillName, previous, benchmark);
    const outPath = resolve(args.static);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html, "utf8");
    console.log(`\n  Static viewer written to: ${outPath}\n`);
    return;
  }

  // Server mode
  const port = await findFreePort(args.port);
  const server = createReviewServer(workspace, skillName, feedbackPath, previous, benchmarkPath);

  server.listen(port, "127.0.0.1", async () => {
    const url = `http://localhost:${port}`;
    console.log(`\n  Eval Viewer`);
    console.log(`  ─────────────────────────────────`);
    console.log(`  URL:       ${url}`);
    console.log(`  Workspace: ${workspace}`);
    console.log(`  Feedback:  ${feedbackPath}`);
    if (Object.keys(previous).length) {
      console.log(`  Previous:  ${args.previousWorkspace} (${Object.keys(previous).length} runs)`);
    }
    if (benchmarkPath) console.log(`  Benchmark: ${benchmarkPath}`);
    console.log(`\n  Press Ctrl+C to stop.\n`);

    // Open browser
    const openCmd =
      process.platform === "win32" ? `start "" "${url}"` :
      process.platform === "darwin" ? `open "${url}"` :
      `xdg-open "${url}"`;
    try { execSync(openCmd, { stdio: "ignore" }); } catch (_) {}
  });

  process.on("SIGINT", () => {
    console.log("\nStopped.");
    server.close();
    process.exit(0);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
