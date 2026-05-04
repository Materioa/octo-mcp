import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import mermaid from "mermaid";
import { JSDOM } from "jsdom";
import Viz from "viz.js";
import { Module, render } from "viz.js/full.render.js";
import fs from "fs";

// Load bundled prompt template for accurate diagram generation.
let DIAGRAM_PROMPT = "";
try {
  const promptPath = new URL("../../prompts/diagram-generation.md", import.meta.url).pathname;
  if (fs.existsSync(promptPath)) {
    DIAGRAM_PROMPT = fs.readFileSync(promptPath, "utf8");
  }
} catch (e) {
  // ignore
}

// Viz.js v2 instances can be single-use after errors; recreate on failure.
function createViz() {
  return new Viz({ Module, render });
}
let viz = createViz();

// Simple mutex to serialize Mermaid renders (JSDOM globals are not concurrency-safe)
let mermaidLock = Promise.resolve();

function withMermaidLock<T>(fn: () => Promise<T>): Promise<T> {
  const prev = mermaidLock;
  let resolve: () => void;
  mermaidLock = new Promise<void>((r) => { resolve = r; });
  return prev.then(fn).finally(() => resolve!());
}

/**
 * Set up a minimal DOM environment for Mermaid, run the callback, then clean up.
 */
async function withJsdom<T>(fn: () => Promise<T>): Promise<T> {
  const dom = new JSDOM(`<div id="container"></div>`, { pretendToBeVisual: true });
  (globalThis as any).window = dom.window;
  (globalThis as any).document = dom.window.document;
  (globalThis as any).navigator = dom.window.navigator;

  try {
    return await fn();
  } finally {
    try {
      delete (globalThis as any).window;
      delete (globalThis as any).document;
      delete (globalThis as any).navigator;
    } catch {}
  }
}

const DiagramSchema = {
  format: z
    .string()
    .describe('Diagram format: "mermaid" or "dot" (Graphviz DOT)')
    .default("mermaid"),
  spec: z.string().min(1).describe("The diagram specification (Mermaid or DOT source)."),
  render: z
    .string()
    .describe('Render output: "svg" (default)')
    .default("svg"),
};

export function registerDiagramTools(server: McpServer) {
  server.registerTool(
    "DiagramGenerator",
    {
      title: "Render Diagram to SVG (Server-Side)",
      description: `Server-side renderer: takes a Mermaid or Graphviz/DOT spec and returns SVG markup.

Use this tool when you already have a diagram spec and need it rendered to SVG.
- On Perplexity: use this if the sandbox environment is unavailable.
- On ChatGPT/Claude: you typically don't need this — just output a fenced code block and it renders natively.

Pass the raw spec string (no fences). Returns SVG text.`,
      inputSchema: DiagramSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ format, spec, render: renderOut }) => {
      try {
        format = (format || "mermaid").toLowerCase();
        renderOut = renderOut || "svg";

        if (format === "mermaid") {
          // Serialize Mermaid renders to avoid JSDOM global conflicts
          return await withMermaidLock(() => withJsdom(async () => {
            mermaid.initialize({ startOnLoad: false });
            // Validate syntax first
            try {
              (mermaid as any).parse(spec);
            } catch (e: any) {
              return {
                content: [
                  { type: "text" as const, text: `Mermaid syntax error: ${e?.str ?? e?.message ?? String(e)}` },
                ],
              };
            }

            const id = "mmd-" + Date.now();
            const result = await (mermaid as any).render(id, spec);
            const svg = result?.svg ?? result;

            return {
              content: [
                { type: "text" as const, text: svg },
                { type: "text" as const, text: "format: svg" },
              ],
            };
          }));
        }

        if (format === "dot" || format === "graphviz") {
          // Render DOT via Viz.js
          try {
            const svg = await viz.renderString(spec);
            return {
              content: [
                { type: "text" as const, text: svg },
                { type: "text" as const, text: "format: svg" },
              ],
            };
          } catch (e: any) {
            // Viz.js instances may be "used up" after an error; recreate
            viz = createViz();
            return { content: [{ type: "text" as const, text: `DOT render error: ${e?.message ?? String(e)}` }] };
          }
        }

        return { content: [{ type: "text" as const, text: `Unsupported format: ${format}` }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `DiagramGenerator error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );

  server.registerTool(
    "DiagramValidator",
    {
      title: "Validate Diagram Spec",
      description: "Quickly validate Mermaid or DOT syntax without rendering. Returns parsing errors if any. Use before DiagramGenerator to catch issues early.",
      inputSchema: DiagramSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ format, spec }) => {
      try {
        format = (format || "mermaid").toLowerCase();
        if (format === "mermaid") {
          // Serialize and set up JSDOM for Mermaid parse
          return await withMermaidLock(() => withJsdom(async () => {
            try {
              mermaid.initialize({ startOnLoad: false });
              (mermaid as any).parse(spec);
              return { content: [{ type: "text" as const, text: "OK: Mermaid syntax valid." }] };
            } catch (e: any) {
              return { content: [{ type: "text" as const, text: `Mermaid parse error: ${e?.str ?? e?.message ?? String(e)}` }] };
            }
          }));
        }

        if (format === "dot" || format === "graphviz") {
          try {
            // Viz.js will throw if DOT invalid; attempt a render to string (fast)
            await viz.renderString(spec);
            return { content: [{ type: "text" as const, text: "OK: DOT syntax valid (renderable)." }] };
          } catch (e: any) {
            viz = createViz();
            return { content: [{ type: "text" as const, text: `DOT parse/render error: ${e?.message ?? String(e)}` }] };
          }
        }

        return { content: [{ type: "text" as const, text: `Unsupported format: ${format}` }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `DiagramValidator error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
}
