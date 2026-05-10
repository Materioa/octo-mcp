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
  const prevWindow = (globalThis as any).window;
  const prevDocument = (globalThis as any).document;
  const prevNavigator = (globalThis as any).navigator;

  // Some runtimes expose read-only navigator; define safely instead of assignment.
  const defineGlobal = (key: "window" | "document" | "navigator", value: any) => {
    try {
      Object.defineProperty(globalThis, key, {
        value,
        configurable: true,
        writable: true,
      });
    } catch {
      (globalThis as any)[key] = value;
    }
  };

  defineGlobal("window", dom.window);
  defineGlobal("document", dom.window.document);
  defineGlobal("navigator", dom.window.navigator);

  try {
    return await fn();
  } finally {
    try {
      if (prevWindow === undefined) {
        delete (globalThis as any).window;
      } else {
        defineGlobal("window", prevWindow);
      }

      if (prevDocument === undefined) {
        delete (globalThis as any).document;
      } else {
        defineGlobal("document", prevDocument);
      }

      if (prevNavigator === undefined) {
        delete (globalThis as any).navigator;
      } else {
        defineGlobal("navigator", prevNavigator);
      }
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

function buildDotSandboxScript(spec: string): string {
  const specBase64 = Buffer.from(spec, "utf8").toString("base64");
  return [
    "import base64",
    "import sys",
    "import subprocess",
    "",
    "try:",
    "    import graphviz",
    "except ImportError:",
    "    subprocess.check_call([sys.executable, '-m', 'pip', 'install', 'graphviz'])",
    "    import graphviz",
    "",
    `dot_source = base64.b64decode('${specBase64}').decode('utf-8')`,
    "graph = graphviz.Source(dot_source, format='png')",
    "graph.render('/tmp/diagram', cleanup=True)",
    "# Output: /tmp/diagram.png",
    "with open('/tmp/diagram.png', 'rb') as f:",
    "    b64 = base64.b64encode(f.read()).decode('utf-8')",
    "print('DOWNLOAD_DATA_URI=data:image/png;base64,' + b64)",
  ].join("\n");
}

function buildSandboxPayload(format: string, spec: string): string {
  const script = format === "dot" ? buildDotSandboxScript(spec) : "";
  return [
    "SANDBOX_RENDER_REQUIRED",
    `format: ${format}`,
    "spec:",
    "```dot",
    spec,
    "```",
    "python:",
    "```python",
    script,
    "```",
    "RETURN_DOWNLOAD_LINK: Use DOWNLOAD_DATA_URI as a markdown link for the image.",
  ].join("\n");
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
      description: `Server-side renderer for Mermaid diagrams. DOT requests return a sandbox render payload (Python + full spec) that prints DOWNLOAD_DATA_URI for a markdown download link.

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

        if (fmt === "dot") {
          return {
            content: [
              {
                type: "text" as const,
                text: buildSandboxPayload("dot", spec),
              },
            ],
          };
        }

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
