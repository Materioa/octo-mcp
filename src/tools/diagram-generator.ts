import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const GenerateDiagramSchema = {
  request: z.string().describe("Natural language description of the diagram to generate (e.g., 'DFA that accepts binary strings ending in 01')"),
  format: z
    .enum(["mermaid", "dot"])
    .describe('Diagram format: "mermaid" or "dot" (Graphviz)')
    .default("mermaid"),
};

/**
 * Returns a Python sandbox script for Perplexity that uses
 * packages available in its environment (graphviz, matplotlib, networkx).
 */
function buildPerplexitySandboxExample(format: string, request: string): string {
  if (format === "dot") {
    // Perplexity sandbox has graphviz installed
    return `
import graphviz

# Build the diagram for: ${request}
dot = graphviz.Digraph(format='png')
dot.attr(rankdir='LR', bgcolor='transparent')
dot.attr('node', shape='circle', style='filled', fillcolor='#e8f4fd', color='#2196F3', fontname='Arial')
dot.attr('edge', color='#555555', fontname='Arial', fontsize='10')

# === ADD YOUR NODES AND EDGES HERE ===
# Example:
# dot.node('A', 'Start')
# dot.node('B', 'Process')
# dot.edge('A', 'B', label='input')
# =====================================

dot.render('/tmp/diagram', cleanup=True)
# Display /tmp/diagram.png
`.trim();
  }

  // For mermaid — since Perplexity doesn't have mermaid-cli,
  // instruct it to build the diagram using graphviz/networkx/matplotlib instead
  return `
import graphviz
# OR: import networkx as nx; import matplotlib.pyplot as plt

# Build the diagram for: ${request}
# Since Mermaid is not available in sandbox, use graphviz or networkx+matplotlib instead.

# Option A: graphviz (recommended for state diagrams, flowcharts, DFAs)
dot = graphviz.Digraph(format='png')
dot.attr(rankdir='LR', bgcolor='transparent')
dot.attr('node', shape='circle', style='filled', fillcolor='#e8f4fd', color='#2196F3', fontname='Arial')
dot.attr('edge', color='#555555', fontname='Arial', fontsize='10')

# === ADD YOUR NODES AND EDGES HERE ===
# Example DFA:
# dot.node('q0', 'q0')
# dot.node('q1', 'q1', shape='doublecircle')  # accept state
# dot.edge('q0', 'q1', label='0')
# =====================================

dot.render('/tmp/diagram', cleanup=True)
# Display /tmp/diagram.png
`.trim();
}

export function registerDiagramGeneratorTools(server: McpServer): void {
  server.registerTool(
    "GenerateDiagramFromRequest",
    {
      title: "Generate Diagram from Natural Language",
      description: `Accepts a natural language diagram request and returns rendering instructions for each platform.

You (the LLM) must generate the actual diagram yourself — this tool provides the rendering method.

## ChatGPT / Claude:
Generate a Mermaid or DOT spec and include it in a fenced code block (\`\`\`mermaid or \`\`\`dot). It renders natively on canvas.

## Perplexity:
You do NOT have native diagram rendering. Use your Python sandbox with the pre-installed packages (graphviz, networkx, matplotlib) to build and render the diagram. This tool returns a Python template you can adapt and execute in your sandbox.

If sandbox execution fails, pass a DOT spec to the DiagramGenerator tool for server-side SVG.

Args:
  - request: What the user wants diagrammed.
  - format: "mermaid" (default) or "dot".`,
      inputSchema: GenerateDiagramSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async ({ request, format }) => {
      try {
        format = (format || "mermaid").toLowerCase() as "mermaid" | "dot";

        const sandboxScript = buildPerplexitySandboxExample(format, request);
        const lang = format === "mermaid" ? "mermaid" : "dot";

        return {
          content: [
            {
              type: "text" as const,
              text: [
                `## Diagram Request`,
                `"${request}"`,
                ``,
                `## Your Task`,
                `Generate a diagram for the request above. Rules:`,
                `- No invented nodes or speculative states.`,
                `- For DFA/FSM: one transition per state+symbol pair. All states reachable from start.`,
                `- For flowcharts: clear directed edges with labels.`,
                ``,
                `## Rendering`,
                ``,
                `**ChatGPT / Claude** — output a fenced code block:`,
                "```" + lang,
                `<your generated spec>`,
                "```",
                `It renders natively on canvas.`,
                ``,
                `**Perplexity** — use your Python sandbox. Adapt and run this:`,
                "```python",
                sandboxScript,
                "```",
                `Fill in the nodes/edges for the request above, then execute in sandbox to produce the image.`,
                ``,
                `Fallback: use the separate **DiagramGenerator** tool to render your DOT spec into an server-side SVG.`,
              ].join("\n"),
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: `GenerateDiagramFromRequest error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
        };
      }
    }
  );
}
