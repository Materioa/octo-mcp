import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import mermaid from "mermaid";
import { JSDOM } from "jsdom";
import Viz from "viz.js";
import { Module, render } from "viz.js/full.render.js";
import fs from "fs";
import sharp from "sharp";
import { fileURLToPath } from "url";

// Load bundled prompt template for accurate diagram generation.
let DIAGRAM_PROMPT = "";
try {
  const promptPath = fileURLToPath(new URL("../../prompts/diagram-generation.txt", import.meta.url));
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

/**
 * Convert SVG string to PNG using sharp
 */
async function svgToPng(svgString: string): Promise<Buffer> {
  try {
    return await sharp(Buffer.from(svgString)).png().toBuffer();
  } catch (error: any) {
    throw new Error(`SVG to PNG conversion failed: ${error.message}`);
  }
}

/**
 * Convert SVG string to base64 data URI
 */
function svgToBase64(svgString: string): string {
  const base64 = Buffer.from(svgString).toString("base64");
  return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Convert Buffer/PNG to base64 data URI
 */
function bufferToBase64(buffer: Buffer): string {
  const base64 = buffer.toString("base64");
  return `data:image/png;base64,${base64}`;
}

const DiagramSchema = {
  format: z
    .enum(["mermaid", "dot", "graphviz"])
    .describe('Diagram format: "mermaid", "dot", or "graphviz" (Graphviz)')
    .default("mermaid"),
  spec: z.string().min(1).describe("The diagram specification (Mermaid or DOT source)."),
  render: z
    .enum(["svg", "png", "base64"])
    .describe('Render output: "svg", "png" (file), or "base64" (embedded data URI)')
    .default("png"),
  title: z.string().optional().describe("Optional diagram title for metadata"),
};

export function registerDiagramTools(server: McpServer) {
  server.registerTool(
    "DiagramGenerator",
    {
      title: "Render Diagram to SVG/PNG (Mermaid/DOT)",
      description: `Server-side renderer for Mermaid and Graphviz/DOT diagrams.

## Supported Formats:
- **mermaid**: Flowcharts, state diagrams, sequence diagrams, class diagrams, ER diagrams
- **dot**: Graphviz/DOT (FSMs, directed graphs, trees) — renders as accurate PNG images
- **graphviz**: Alias for dot

## Output Modes:
- **svg**: Raw SVG markup (smaller, scalable)
- **png**: PNG image file — returns file path
- **base64**: Embedded data URI (images as base64) — can be embedded directly in responses

For Python-based diagrams (circuits, plots, Gantt, logic gates), use GenerateDiagramFromRequest to get a template that you can run in your LLM chat sandbox.

## Usage:
Pass the raw spec string (no code fences). Returns SVG/PNG/base64 output.`,
      inputSchema: DiagramSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ format, spec, render: renderOut, title }) => {
      try {
        const normalizedFormat = (format || "mermaid").toLowerCase();
        // Normalize graphviz to dot
        const fmt = normalizedFormat === "graphviz" ? "dot" : normalizedFormat;
        renderOut = (renderOut || "png").toLowerCase() as any;

        if (fmt === "mermaid" || fmt === "dot") {
          // Render Mermaid/DOT to SVG first
          let svg: string | undefined;

          if (fmt === "mermaid") {
            // Serialize Mermaid renders to avoid JSDOM global conflicts
            svg = await withMermaidLock(() => withJsdom(async () => {
              mermaid.initialize({ startOnLoad: false });
              try {
                (mermaid as any).parse(spec);
              } catch (e: any) {
                throw new Error(`Mermaid syntax error: ${e?.str ?? e?.message ?? String(e)}`);
              }

              const id = "mmd-" + Date.now();
              const result = await (mermaid as any).render(id, spec);
              return result?.svg ?? result;
            }));
          } else if (fmt === "dot") {
            // Render DOT via Viz.js
            try {
              svg = await viz.renderString(spec);
            } catch (e: any) {
              viz = createViz();
              throw new Error(`DOT render error: ${e?.message ?? String(e)}`);
            }
          }

          // Convert based on output mode
          if (!svg) {
            return { content: [{ type: "text" as const, text: `No SVG generated for format: ${fmt}` }] };
          }
          if (renderOut === "svg") {
            return {
              content: [
                { type: "text" as const, text: svg },
                { type: "text" as const, text: "format: svg" },
              ],
            };
          }

          if (renderOut === "png") {
            try {
              const pngBuffer = await svgToPng(svg);
              const filePath = `/tmp/diagram_${Date.now()}.png`;
              fs.writeFileSync(filePath, pngBuffer);
              return {
                content: [
                  { type: "text" as const, text: `Rendered PNG: ${filePath}` },
                  { type: "text" as const, text: `size: ${pngBuffer.length} bytes` },
                ],
              };
            } catch (e: any) {
              return { content: [{ type: "text" as const, text: `PNG conversion error: ${e.message}` }] };
            }
          }

          if (renderOut === "base64") {
            try {
              const pngBuffer = await svgToPng(svg);
              const dataUri = bufferToBase64(pngBuffer);
              return {
                content: [
                  { type: "text" as const, text: dataUri },
                  { type: "text" as const, text: "format: base64-data-uri" },
                ],
              };
            } catch (e: any) {
              return { content: [{ type: "text" as const, text: `Base64 conversion error: ${e.message}` }] };
            }
          }
        }

        return { content: [{ type: "text" as const, text: `Unsupported format: ${fmt}` }] };
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
        const normalizedFormat = (format || "mermaid").toLowerCase();
        // Normalize graphviz to dot
        const fmt = normalizedFormat === "graphviz" ? "dot" : normalizedFormat;

        if (fmt === "mermaid") {
          // Serialize and set up JSDOM for Mermaid parse
          return await withMermaidLock(() => withJsdom(async () => {
            try {
              mermaid.initialize({ startOnLoad: false });
              (mermaid as any).parse(spec);
              return { content: [{ type: "text" as const, text: "✓ Mermaid syntax valid." }] };
            } catch (e: any) {
              return { content: [{ type: "text" as const, text: `✗ Mermaid parse error: ${e?.str ?? e?.message ?? String(e)}` }] };
            }
          }));
        }

        if (fmt === "dot") {
          try {
            // Viz.js will throw if DOT invalid
            await viz.renderString(spec);
            return { content: [{ type: "text" as const, text: "✓ DOT syntax valid (renderable)." }] };
          } catch (e: any) {
            viz = createViz();
            return { content: [{ type: "text" as const, text: `✗ DOT parse/render error: ${e?.message ?? String(e)}` }] };
          }
        }

        return { content: [{ type: "text" as const, text: `⚠ Unknown format: ${fmt}` }] };
      } catch (error: any) {
        return { content: [{ type: "text" as const, text: `DiagramValidator error: ${error instanceof Error ? error.message : String(error)}` }] };
      }
    }
  );
}
