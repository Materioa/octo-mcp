import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

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
function recommendFormat(request: string): string {
  const lower = request.toLowerCase();
  if (lower.includes("dfa") || lower.includes("fsm") || lower.includes("finite state") || 
      lower.includes("automaton") || lower.includes("state machine")) {
    return "dot"; // DOT is more accurate for FSMs than Mermaid
  }
  if (lower.includes("circuit") || lower.includes("resistor") || lower.includes("capacitor") || 
      lower.includes("diode") || lower.includes("transistor")) {
    return "circuit";
  }
  if (lower.includes("plot") || lower.includes("graph") || lower.includes("chart") || 
      lower.includes("visualization") || lower.includes("histogram") || lower.includes("scatter")) {
    return "plot";
  }
  if (lower.includes("gantt") || lower.includes("timeline") || lower.includes("project") || 
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
 * Returns a Python sandbox script for Perplexity that uses
 * packages available in its environment (graphviz, matplotlib, networkx, schemdraw).
 */
function buildPerplexitySandboxExample(format: string, request: string): string {
  if (format === "dot") {
    return `
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
`.trim();
  }

  if (format === "circuit") {
    return `
import schemdraw
import schemdraw.elements as elm

# Build circuit for: ${request}
with schemdraw.Drawing() as d:
    d += (R1 := elm.Resistor().label('R1'))
    d += elm.Line().right(0.5)
    d += elm.Gap().label(['+5V', '−'])
    d.push()
    d += elm.Line().down(0.5)
    d += elm.Line().left(1)
    d += (C1 := elm.Capacitor().label('C1'))
    
    # === ADD MORE COMPONENTS HERE ===
    
    d.save('/tmp/diagram.png')
`.trim();
  }

  if (format === "plot") {
    return `
import matplotlib.pyplot as plt
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
`.trim();
  }

  if (format === "gantt") {
    return `
import matplotlib.pyplot as plt
from datetime import datetime, timedelta

# Create Gantt chart for: ${request}
tasks = [
    {'name': 'Task 1', 'start': 0, 'duration': 2},
    {'name': 'Task 2', 'start': 2, 'duration': 3},
    {'name': 'Task 3', 'start': 5, 'duration': 1},
]

fig, ax = plt.subplots(figsize=(10, 4))
for i, task in enumerate(tasks):
    ax.barh(i, task['duration'], left=task['start'], height=0.6, label=task['name'])

ax.set_yticks(range(len(tasks)))
ax.set_yticklabels([t['name'] for t in tasks])
ax.set_xlabel('Time (days)')
ax.set_title('${request}')
ax.grid(True, alpha=0.3, axis='x')

plt.tight_layout()
plt.savefig('/tmp/diagram.png', dpi=150, bbox_inches='tight', transparent=True)
`.trim();
  }

  if (format === "logic") {
    return `
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
`.trim();
  }

  // Default to mermaid guidance
  return `
# Mermaid diagram for: ${request}
# Use your platform's native Mermaid rendering or convert to image
# See instructions below
`.trim();
}

/**
 * Build server-side rendering instructions
 */
function buildServerRenderingInstructions(format: string): string[] {
  return [
    ``,
    `## Now render with DiagramGenerator`,
    ``,
    `Use the **DiagramGenerator** tool with your ${format} spec:`,
    `- **format**: "${format}"`,
    `- **spec**: Your complete ${format} code/spec above`,
    `- **render**: "png" (to get image) or "base64" (for HTML embedding)`,
    ``,
    `This will generate an accurate PNG image that displays correctly everywhere.`,
  ];
}

export function registerDiagramGeneratorTools(server: McpServer): void {
  server.registerTool(
    "GenerateDiagramFromRequest",
    {
      title: "Generate Diagram from Natural Language (Multi-Format)",
      description: `Generate diagrams in multiple formats with server-side rendering as PNG images.

## Supported Diagram Types:
1. **dot** (Graphviz) — FSMs, state diagrams, directed graphs, trees (most accurate for FSMs)
2. **mermaid** — Flowcharts, sequence diagrams, state diagrams, class diagrams
3. **circuit** — Electronic schematics (resistors, capacitors, transistors, etc.)
4. **plot** — Line, bar, scatter, heatmaps, histograms (matplotlib/plotly)
5. **gantt** — Project timelines and schedules
6. **logic** — Logic gates, Boolean algebra circuits

## Workflow:
1. I generate the appropriate spec/code for your request
2. You use **DiagramGenerator** to render it as a PNG image
3. The image displays perfectly in all clients (ChatGPT, Claude, Perplexity)

This avoids limitations with native renderers (e.g., ChatGPT Mermaid not supporting accurate FSMs in DOT).

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
        // Auto-detect if format is "auto"
        if (!format || format === "auto") {
          format = recommendFormat(request);
        }
        format = format.toLowerCase();

        const sandboxScript = buildPerplexitySandboxExample(format, request);
        const serverInstructions = buildServerRenderingInstructions(format);

        const responseText = [
          `## Diagram Generation`,
          `**Request:** ${request}`,
          `**Recommended Format:** ${format.toUpperCase()}`,
          ``,
          `## Your Task`,
          `Generate a complete, valid ${format === "dot" ? "Graphviz DOT" : format.toUpperCase()} spec for the above request.`,
          ``,
          format === "mermaid" ? `### Mermaid Syntax
\`\`\`mermaid
<your complete mermaid diagram here>
\`\`\`` :
          format === "dot" ? `### Graphviz DOT Syntax (Most Accurate for FSMs)
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
\`\`\`` :
          format === "circuit" ? `### Circuit Diagram (schemdraw)
\`\`\`python
import schemdraw
import schemdraw.elements as elm

with schemdraw.Drawing() as d:
    d += elm.Resistor().label('R1')
    d += elm.Line().right(0.5)
    d += elm.Gap().label(['+5V', '−'])
    # Add your circuit components
    d.save('/tmp/diagram.png')
\`\`\`` :
          format === "plot" ? `### Matplotlib/Plotly Visualization
\`\`\`python
import matplotlib.pyplot as plt
import numpy as np

# Your visualization code here
plt.savefig('/tmp/diagram.png', dpi=150, bbox_inches='tight', transparent=True)
\`\`\`` :
          format === "gantt" ? `### Gantt Chart
\`\`\`python
import matplotlib.pyplot as plt

# Create Gantt chart
fig, ax = plt.subplots(figsize=(10, 4))
# Add tasks with ax.barh()
plt.savefig('/tmp/diagram.png', dpi=150, bbox_inches='tight', transparent=True)
\`\`\`` :
          `### Logic Gates
\`\`\`python
import matplotlib.pyplot as plt

# Draw logic gates (AND, OR, NOT, XOR, NAND, NOR)
# Use patches and lines to create gate shapes
plt.savefig('/tmp/diagram.png', dpi=150, bbox_inches='tight', transparent=True)
\`\`\``,
          ``,
          `## Rules for Accuracy`,
          format === "dot" ? `
- One transition per (state, input) pair
- All states must be reachable from the initial state
- Use \`shape=doublecircle\` for accept states
- Label edges clearly with input symbols
- Minimize cycles; use rankdir=LR for left-to-right flow
` : ``,
          ...serverInstructions,
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
