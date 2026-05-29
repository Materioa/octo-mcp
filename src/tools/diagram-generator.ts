import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type DiagramFormat = "mermaid" | "dot" | "circuit" | "plot" | "gantt" | "logic" | "markmap" | "auto";

const SANDBOX_OUTPUT_DETECT = `
def get_output_dir():
    import os
    if os.path.isdir('/mnt/data'):
        return '/mnt/data'
    elif os.path.isdir('/mnt/user-data/outputs'):
        return '/mnt/user-data/outputs'
    else:
        return 'output'
`.trim();

const SANDBOX_DOWNLOAD_SNIPPET = `
import os
output_dir = get_output_dir()
output_path = os.path.join(output_dir, 'diagram.png')
print('Saved to ' + output_path)

try:
  from PIL import Image
  import matplotlib.pyplot as plt
  img = Image.open(output_path)
  plt.imshow(img)
  plt.axis('off')
  plt.show()
except Exception:
  pass
`.trim();

function appendDownload(script: string): string {
  return `${SANDBOX_OUTPUT_DETECT}\n\n${script}\n\n${SANDBOX_DOWNLOAD_SNIPPET}`;
}

const GenerateDiagramSchema = {
  request: z.string().describe("Natural language description of the diagram to generate (e.g., 'DFA that accepts binary strings ending in 01', 'Circuit diagram of an AND gate', 'Line plot of sin(x)')"),
  format: z
    .enum(["mermaid", "dot", "circuit", "plot", "gantt", "logic", "markmap", "auto"])
    .describe('Diagram format: "mermaid" (flowcharts, state diagrams), "dot" (FSMs, graphs, trees), "circuit" (electronic schematics), "plot" (Chart.js/React visualizations), "gantt" (project timelines), "logic" (logic gate circuits), "markmap" (mindmaps), or "auto" (infer best format)')
    .default("auto"),
};

/**
 * Recommend the best format for a given request
 */
function recommendFormat(request: string): DiagramFormat {
  const lower = request.toLowerCase();
  if (lower.includes("mermaid")) {
    return "mermaid";
  }
  if (lower.includes("graphviz") || lower.includes("dot")) {
    return "dot";
  }
  if (lower.includes("dfa") || lower.includes("fsm") || lower.includes("finite state") || 
      lower.includes("automaton") || lower.includes("state machine")) {
    return "dot"; // DOT is more accurate for FSMs than Mermaid
  }
  if (lower.includes("timeline") || lower.includes("roadmap")) {
    return "mermaid";
  }
  if (lower.includes("mindmap") || lower.includes("markmap") || lower.includes("tree")) {
    return "markmap";
  }
  if (lower.includes("circuit") || lower.includes("resistor") || lower.includes("capacitor") || 
      lower.includes("diode") || lower.includes("transistor")) {
    return "circuit";
  }
  if (lower.includes("plot") || lower.includes("graph") || lower.includes("chart") || 
      lower.includes("visualization") || lower.includes("histogram") || lower.includes("scatter")) {
    return "plot";
  }
  if (lower.includes("gantt") || lower.includes("project") || 
      lower.includes("schedule")) {
    return "gantt";
  }
  if (lower.includes("logic gate") || lower.includes("boolean") || lower.includes("truth table")) {
    return "logic";
  }
  // Default to mermaid for general flowcharts and diagrams
  return "mermaid";
}


function shouldUseWebSandbox(format: DiagramFormat): boolean {
  return format !== "mermaid";
}

function buildPythonSandboxExample(format: DiagramFormat, request: string): string {
  if (format === "dot") {
    return appendDownload(`import graphviz\nfrom graphviz import Digraph\n\ndot = Digraph()\ndot.attr(rankdir='LR')\n# add nodes\ndot.render(get_output_dir() + '/diagram', format='png')`);
  }
  if (format === "circuit") {
    return appendDownload(`import schemdraw\nimport schemdraw.elements as elm\n\nwith schemdraw.Drawing() as d:\n    d += elm.Resistor().label('R1')\n    d.save(get_output_dir() + '/diagram.png')`);
  }
  if (format === "plot" || format === "logic" || format === "gantt") {
    return appendDownload(`import matplotlib.pyplot as plt\nimport numpy as np\n\nplt.plot([1,2], [3,4])\nplt.savefig(get_output_dir() + '/diagram.png')`);
  }
  return "";
}

function buildFormatExample(format: DiagramFormat, environment: string): string {
  return "";
}

function buildAccuracyRules(format: DiagramFormat, environment: string): string {
  return "- Keep the diagram clean and highly accurate based on the user's request.";
}

function buildWebSandboxExample(format: DiagramFormat, request: string, environment: string): string {
  if (format === "dot") {
    if (environment === "web") {
      return `### Graphviz DOT Syntax via d3-graphviz
\`\`\`html
<!-- Render graphviz using d3-graphviz -->
<div id="graph"></div>
<script type="module">
  import { graphviz } from 'd3-graphviz';
  graphviz("#graph").renderDot(\`digraph { ... }\`);
</script>
\`\`\``;
    }
    return `### Graphviz DOT Syntax (Most Accurate for FSMs)
\`\`\`dot
digraph {
  rankdir=LR;
  node [shape=circle, style=filled, fillcolor="#e8f4fd", color="#2196F3"];
  edge [color="#555555"];
  
  # Add your states and transitions here
  q0 [label="q0"];
  q1 [label="q1", shape=doublecircle];  // accept state
  q0 -> q1 [label="0"];
}
\`\`\``;
  }

  if (format === "circuit") {
    if (environment === "web") {
      return `### Circuit Diagram
\`\`\`react
import React from 'react';
// import { ... } from '@tscircuit/core';
export default function Circuit() {
  return <div>...</div>;
}
\`\`\``;
    }
    return `### Circuit Diagram (schemdraw)
\`\`\`python
import schemdraw
import schemdraw.elements as elm

with schemdraw.Drawing() as d:
    d += elm.Resistor().label('R1')
    d += elm.Line().right(0.5)
    d += elm.Gap().label(['+5V', '-'])
    # Add your circuit components
    d.save('/tmp/diagram.png')
\`\`\``;
    return `### Mindmap using Markmap
\`\`\`markmap
# Root
## Child 1
- Grandchild A
- Grandchild B
## Child 2
- Grandchild C
\`\`\``;
  }

  if (format === "plot") {
    if (environment === "web") {
      return `### Chart.js or Plotly.js Visualization
\`\`\`html
<canvas id="myChart"></canvas>
<script type="module">
  import Chart from 'chart.js/auto';
  // ...
</script>
\`\`\``;
    }
    return `### Matplotlib/Plotly Visualization
\`\`\`python
import matplotlib.pyplot as plt
import numpy as np

# Your visualization code here
plt.savefig('/tmp/diagram.png', dpi=150, bbox_inches='tight', transparent=True)
\`\`\``;
  }

  if (format === "gantt") {
    if (environment === "web") {
      return `### Gantt Chart via frappe-gantt
\`\`\`html
<div id="gantt"></div>
<script type="module">
  import Gantt from 'frappe-gantt';
  // ...
</script>
\`\`\``;
    }
    return `### Gantt Chart
\`\`\`python
import plotly.express as px

# Preferred: use plotly timeline or python-gantt style packages when available
# Fallback: use matplotlib if the preferred package is unavailable
\`\`\``;
  }

  if (format === "logic") {
    if (environment === "web") {
      return `### Logic Gates
\`\`\`react
import React from 'react';
export default function LogicGates() {
  return <svg>...</svg>;
}
\`\`\``;
    }
    return `### Logic Gates
\`\`\`python
import matplotlib.pyplot as plt

# Draw logic gates (AND, OR, NOT, XOR, NAND, NOR)
# Use patches and lines to create gate shapes
plt.savefig('/tmp/diagram.png', dpi=150, bbox_inches='tight', transparent=True)
\`\`\``;
  }

    return `### Format Notes
\`\`\`text
Use the recommended format and keep the result faithful to the request.
\`\`\``;
}

export function registerDiagramGeneratorTools(server: McpServer): void {
  server.registerTool(
    "GenerateDiagramFromRequest",
    {
      title: "Generate Diagram from Natural Language (Multi-Format)",
      description: `Generate diagrams in multiple formats for the Custom Web Client.

## Supported Diagram Types & Workflows:
1. **mermaid / dot**: Directly output the code block wrapped in \`\`\`mermaid or \`\`\`dot. The client natively renders these formats inline!
   - Note: For Finite State Machines (FSM) or state diagrams, prefer using **dot** (Graphviz) instead of mermaid for better routing and layout.
2. **markmap**: Directly output the code block wrapped in \`\`\`markmap. Use standard markdown headings (#, ##) and lists (-, *) to represent the mindmap tree.
3. **plot / circuit / gantt / logic**: The client features an advanced JS/React WebArtifactSandbox. Output the visualization code (using Chart.js, Recharts, basic HTML/SVG, etc.) inside \`\`\`react, \`\`\`html, or \`\`\`javascript blocks. The client will render these components inline.

NOTE: This system DOES NOT have a Python sandbox. Do NOT attempt to output Python or matplotlib code. If a complex visualization is needed, use standard web technologies (React/JS/SVG).
IMPORTANT: The WebArtifactSandbox has an import map configured for esm.sh. Use bare imports (e.g. \`import Chart from 'chart.js/auto';\`) rather than absolute CDN URLs like jsdelivr or unpkg.

Args:
  - request: What you want diagrammed
  - format: Auto-detects best format, or specify one`,
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
        let chosenFormat: DiagramFormat = (format && format !== "auto") ? (format as DiagramFormat) : recommendFormat(request);
        const normalizedFormat = chosenFormat.toLowerCase() as DiagramFormat;

        const useSandbox = shouldUseWebSandbox(normalizedFormat);
        const sandboxScript = buildWebSandboxExample(normalizedFormat, request, "web");

        const responseText = [
          `## Diagram Generation`,
          `**Request:** ${request}`,
          `**Recommended Format:** ${normalizedFormat.toUpperCase()}`,
          ``,
          `## Your Task`,
          useSandbox 
            ? `Write HTML or React code using JS visualization libraries (like Chart.js, Recharts, etc.) to satisfy the request. Return the code block tagged with \`\`\`html or \`\`\`react. ALWAYS use bare module imports (e.g. \`import Chart from 'chart.js/auto';\`), the sandbox has an import map.`
            : `Write the diagram using ${normalizedFormat.toUpperCase()} syntax. Return the code block tagged with \`\`\`${normalizedFormat}. The client will natively render it.`,
          ``,
          `## Rules for Accuracy`,
          buildAccuracyRules(normalizedFormat, "web"),
          useSandbox ? `\n## Web Artifact Example\n\`\`\`\n${sandboxScript}\n\`\`\`` : ``,
        ];

        return {
          content: [
            {
              type: "text" as const,
              text: responseText.join("\n"),
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
