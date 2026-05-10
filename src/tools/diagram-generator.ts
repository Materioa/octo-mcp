import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

type DiagramFormat = "mermaid" | "dot" | "circuit" | "plot" | "gantt" | "logic" | "auto";

const SANDBOX_DOWNLOAD_SNIPPET = `
try:
  import matplotlib.pyplot as plt
  plt.show()
except Exception:
  pass

import base64
with open('/tmp/diagram.png', 'rb') as f:
  b64 = base64.b64encode(f.read()).decode('utf-8')
print('DOWNLOAD_DATA_URI=data:image/png;base64,' + b64)
`.trim();

const GenerateDiagramSchema = {
  request: z.string().describe("Natural language description of the diagram to generate (e.g., 'DFA that accepts binary strings ending in 01', 'Circuit diagram of an AND gate', 'Line plot of sin(x)')"),
  format: z
    .enum(["mermaid", "dot", "circuit", "plot", "gantt", "logic", "auto"])
    .describe('Diagram format: "mermaid" (flowcharts, state diagrams), "dot" (FSMs, graphs, trees), "circuit" (electronic schematics), "plot" (matplotlib/plotly visualizations), "gantt" (project timelines), "logic" (logic gate circuits), or "auto" (infer best format)')
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

/**
 * Returns a Python sandbox script for LLM web interfaces that have
 * graphviz, matplotlib, networkx, schemdraw, and similar packages installed.
 */
function buildWebSandboxExample(format: DiagramFormat, request: string): string {
  const appendDownload = (script: string) => `${script}\n\n${SANDBOX_DOWNLOAD_SNIPPET}`.trim();
  if (format === "dot") {
    return appendDownload(`
import sys
import subprocess

try:
    import graphviz
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "graphviz"])
    import graphviz

# Build the diagram for: ${request}
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
# Output saved to /tmp/diagram.png
`.trim());
  }

  if (format === "circuit") {
    return appendDownload(`
import sys
import subprocess

try:
    import schemdraw
    import schemdraw.elements as elm
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "schemdraw"])
    import schemdraw
    import schemdraw.elements as elm

# Build circuit for: ${request}
with schemdraw.Drawing() as d:
    d += (R1 := elm.Resistor().label('R1'))
    d += elm.Line().right(0.5)
    d += elm.Gap().label(['+5V', '-'])
    d.push()
    d += elm.Line().down(0.5)
    d += elm.Line().left(1)
    d += (C1 := elm.Capacitor().label('C1'))
    
    # === ADD MORE COMPONENTS HERE ===
    
    d.save('/tmp/diagram.png')
`.trim());
  }

  if (format === "plot") {
    return appendDownload(`
import sys
import subprocess

try:
    import matplotlib.pyplot as plt
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "matplotlib"])
    import matplotlib.pyplot as plt

try:
    import numpy as np
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "numpy"])
    import numpy as np

# Create visualization for: ${request}
x = np.linspace(0, 2*np.pi, 100)
y = np.sin(x)

plt.figure(figsize=(10, 6))
plt.plot(x, y, linewidth=2)
plt.grid(True, alpha=0.3)
plt.title('${request}')
plt.xlabel('X')
plt.ylabel('Y')

plt.savefig('/tmp/diagram.png', dpi=150, bbox_inches='tight', transparent=True)
`.trim());
  }

  if (format === "gantt") {
    return appendDownload(`
  import sys
  import subprocess

  def pip_install(package_name):
    subprocess.check_call([sys.executable, "-m", "pip", "install", package_name])

  try:
    import plotly.express as px
  except ImportError:
    pip_install("plotly")
    import plotly.express as px

  try:
    import kaleido  # noqa: F401
  except Exception:
    pip_install("kaleido")

  tasks = [
    {"Task": "Task 1", "Start": "2026-01-01", "Finish": "2026-01-03"},
    {"Task": "Task 2", "Start": "2026-01-03", "Finish": "2026-01-06"},
    {"Task": "Task 3", "Start": "2026-01-06", "Finish": "2026-01-07"},
  ]
  fig = px.timeline(tasks, x_start="Start", x_end="Finish", y="Task", title="${request}")
  fig.update_yaxes(autorange="reversed")
  fig.write_image("/tmp/diagram.png", scale=2)
  `.trim());
  }

  if (format === "logic") {
    return appendDownload(`
import sys
import subprocess

try:
    import matplotlib.pyplot as plt
    import matplotlib.patches as patches
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "matplotlib"])
    import matplotlib.pyplot as plt
    import matplotlib.patches as patches

# Create logic gate diagram for: ${request}
fig, ax = plt.subplots(figsize=(10, 6))
ax.set_xlim(0, 10)
ax.set_ylim(0, 10)
ax.axis('off')

# Example AND gate
def draw_and_gate(ax, x, y):
    # Inputs
    ax.plot([x-1, x], [y+0.3, y+0.3], 'k-', linewidth=2)
    ax.plot([x-1, x], [y-0.3, y-0.3], 'k-', linewidth=2)
    # Gate (curved D-shape)
    gate = patches.Arc((x+0.5, y), 1, 0.8, angle=0, theta1=-90, theta2=90, linewidth=2, color='black')
    ax.add_patch(gate)
    # Output
    ax.plot([x+1, x+2], [y, y], 'k-', linewidth=2)
    ax.text(x+0.5, y, 'AND', ha='center', va='center')

draw_and_gate(ax, 5, 5)
ax.set_title('${request}')
plt.savefig('/tmp/diagram.png', dpi=150, bbox_inches='tight', transparent=True)
`.trim());
  }

  // Default to mermaid guidance
  return `
# Mermaid diagram for: ${request}
# Use your platform's native Mermaid rendering or convert to image
# See instructions below
`.trim();
}

/**
 */
function shouldUseWebSandbox(format: DiagramFormat): boolean {
  return format !== "mermaid";
}

function buildAccuracyRules(format: DiagramFormat): string {
  const sharedRules = [
    "- Read the request twice before drawing so labels, counts, directions, and constraints match exactly.",
    "- Do not invent nodes, tasks, gates, components, datasets, or transitions that were not requested or logically required.",
    "- Before finalizing, perform a self-check that every label in the diagram can be traced back to the request or validated source material.",
    "- If a package import fails in the web sandbox, install it with `pip install <package>` and rerun the script.",
    "- If the diagram still feels ambiguous, revise the structure rather than decorating an incorrect layout.",
  ];

  const formatRules: Record<DiagramFormat, string[]> = {
    mermaid: [
      "- Keep Mermaid syntax minimal and valid; avoid unsupported constructs when a simpler layout works.",
      "- Double-check arrow direction, branching labels, and section nesting before returning the diagram.",
    ],
    dot: [
      "- Ensure one transition per (state, input) pair for DFA/FSM-style diagrams.",
      "- Confirm all states are reachable from the initial state unless the request explicitly allows otherwise.",
      "- Use `shape=doublecircle` only for accept states and verify every edge label is meaningful.",
      "- Review the graph once as logic and once as syntax before rendering.",
    ],
    circuit: [
      "- Verify current flow, node joins, grounding, and component order before drawing.",
      "- Use standard component symbols and label values clearly so the circuit can be read without guessing.",
    ],
    plot: [
      "- Verify axes, units, legends, and dataset mappings against the request before exporting.",
      "- Do not fabricate data trends; if the data is missing, generate only from provided formulas or clearly stated sample values.",
    ],
    gantt: [
      "- Double-check task names, ordering, start dates, durations, and overlaps before rendering.",
      "- Ensure dependencies and timeline progression make chronological sense.",
      "- Prefer `plotly` or a dedicated Gantt-capable package when schedule precision matters; fall back only if needed.",
    ],
    logic: [
      "- Verify each gate type, input line, output line, and truth relationship before exporting the image.",
      "- For compound logic, trace the signal path manually once from inputs to outputs to catch wiring mistakes.",
    ],
    auto: [],
  };

  return [...sharedRules, ...(formatRules[format] || [])].join("\n");
}

function buildFormatExample(format: DiagramFormat): string {
  if (format === "mermaid") {
    return `### Mermaid Syntax
\`\`\`mermaid
<your complete mermaid diagram here>
\`\`\``;
  }

  if (format === "dot") {
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
  }

  if (format === "plot") {
    return `### Matplotlib/Plotly Visualization
\`\`\`python
import matplotlib.pyplot as plt
import numpy as np

# Your visualization code here
plt.savefig('/tmp/diagram.png', dpi=150, bbox_inches='tight', transparent=True)
\`\`\``;
  }

  if (format === "gantt") {
    return `### Gantt Chart
\`\`\`python
import plotly.express as px

# Preferred: use plotly timeline or python-gantt style packages when available
# Fallback: use matplotlib if the preferred package is unavailable
\`\`\``;
  }

  if (format === "logic") {
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
      description: `Generate diagrams in multiple formats using LLM web-interface sandboxes for accurate rendering.

## Supported Diagram Types:
1. **dot** (Graphviz) — FSMs, state diagrams, directed graphs, trees (most accurate for FSMs)
2. **mermaid** — Flowcharts, sequence diagrams, state diagrams, class diagrams (native renderer is fine for simple cases)
3. **circuit** — Electronic schematics (resistors, capacitors, transistors, etc.)
4. **plot** — Line, bar, scatter, heatmaps, histograms (matplotlib/plotly)
5. **gantt** — Project timelines and schedules
6. **logic** — Logic gates, Boolean algebra circuits

## Workflow:
1. I generate the appropriate spec/code for your request
2. Use the LLM web-interface Python sandbox (ChatGPT, Claude, Perplexity) for complex formats (dot, circuit, plot, gantt, logic)
3. Use native renderer for simple Mermaid or when you already render SVG in HTML

This avoids limitations with native renderers (e.g., Mermaid not supporting accurate FSMs in DOT).

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
        // Auto-detect if format is "auto" and normalize safely to DiagramFormat
        let chosenFormat: DiagramFormat = (format && format !== "auto") ? (format as DiagramFormat) : recommendFormat(request);
        const normalizedFormat = chosenFormat.toLowerCase() as DiagramFormat;

        const useSandbox = shouldUseWebSandbox(normalizedFormat);
        const sandboxScript = buildWebSandboxExample(normalizedFormat, request);

        const responseText = [
          `## Diagram Generation`,
          `**Request:** ${request}`,
          `**Recommended Format:** ${normalizedFormat.toUpperCase()}`,
          ``,
          `## Your Task`,
          `Generate a complete, valid ${normalizedFormat === "dot" ? "Graphviz DOT" : normalizedFormat.toUpperCase()} spec for the above request.`,
          useSandbox ? `Use the web-interface Python sandbox for rendering (ChatGPT, Claude, Perplexity).` : `Use the native renderer (Mermaid or your SVG pipeline).`,
          useSandbox ? `Do not truncate or summarize the spec. Run the sandbox script and return the rendered image with a download link.` : `If SVG is produced, render it natively (HTML artifact).`,
          ``,
          buildFormatExample(normalizedFormat),
          ``,
          `## Rules for Accuracy`,
          buildAccuracyRules(normalizedFormat),
          useSandbox ? `## Web Sandbox Script
\`\`\`python
${sandboxScript}
\`\`\`` : ``,
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
