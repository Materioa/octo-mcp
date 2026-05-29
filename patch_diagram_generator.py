import re

with open('src/tools/diagram-generator.ts', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace('function buildWebSandboxExample(', 'function buildPythonSandboxExample(')
content = content.replace('const sandboxScript = buildWebSandboxExample(normalizedFormat, request);', 'const sandboxScript = environment === "web" ? buildWebSandboxExample(normalizedFormat, request) : buildPythonSandboxExample(normalizedFormat, request);')

web_sandbox_code = """
function buildWebSandboxExample(format: DiagramFormat, request: string): string {
  if (format === "dot") {
    return `
<!DOCTYPE html>
<html>
<body>
  <div id="graph" style="text-align: center;"></div>
  <script type="module">
    import { graphviz } from 'd3-graphviz';
    graphviz("#graph").renderDot(\\\`
digraph {
  rankdir=LR;
  node [shape=circle, style=filled, fillcolor="#e8f4fd", color="#2196F3"];
  // Add nodes and edges for: ${request}
  q0 -> q1 [label="0"];
}
    \\\`);
  </script>
</body>
</html>
`.trim();
  }

  if (format === "circuit") {
    return `
import React from 'react';
import { createCircuit } from '@tscircuit/core';

// Build circuit for: ${request}
export default function Circuit() {
  // Use react-circuit-schematics or tscircuit React components here
  return (
    <div style={{ width: '100%', height: '400px', background: 'white' }}>
      <h2>Circuit: ${request}</h2>
      {/* Circuit components */}
    </div>
  );
}
`.trim();
  }

  if (format === "plot") {
    return `
<!DOCTYPE html>
<html>
<body>
  <canvas id="myChart" width="400" height="300"></canvas>
  <script type="module">
    import Chart from 'chart.js/auto';
    
    // Create visualization for: ${request}
    const ctx = document.getElementById('myChart');
    new Chart(ctx, {
      type: 'line', // or bar, scatter, etc.
      data: {
        labels: ['A', 'B', 'C', 'D'],
        datasets: [{
          label: '${request}',
          data: [12, 19, 3, 5],
          borderColor: '#2196F3',
          tension: 0.1
        }]
      }
    });
  </script>
</body>
</html>
`.trim();
  }

  if (format === "gantt") {
    return `
<!DOCTYPE html>
<html>
<body>
  <div id="gantt"></div>
  <script type="module">
    import Gantt from 'frappe-gantt';
    
    // Gantt chart for: ${request}
    var tasks = [
      { id: 'Task 1', name: 'Task 1', start: '2026-01-01', end: '2026-01-03', progress: 100 },
      { id: 'Task 2', name: 'Task 2', start: '2026-01-03', end: '2026-01-06', progress: 50, dependencies: 'Task 1' }
    ];
    var gantt = new Gantt("#gantt", tasks, {
      view_mode: 'Day'
    });
  </script>
</body>
</html>
`.trim();
  }

  if (format === "logic") {
    return `
import React from 'react';

// Create logic gate diagram for: ${request}
export default function LogicGates() {
  return (
    <div style={{ padding: 20 }}>
      <h3>${request}</h3>
      {/* Use SVG or a suitable React library to draw logic gates */}
      <svg width="400" height="200">
        <path d="M 50 50 Q 100 50 100 100 Q 100 150 50 150 Q 80 100 50 50" fill="none" stroke="black" strokeWidth="2" />
        <text x="60" y="105">AND</text>
      </svg>
    </div>
  );
}
`.trim();
  }

  // Default to mermaid guidance
  return `
# Mermaid diagram for: ${request}
# Use your platform's native Mermaid rendering or convert to image
# See instructions below
`.trim();
}
"""

content = content.replace('function buildPythonSandboxExample(', web_sandbox_code + '\nfunction buildPythonSandboxExample(')

schema_patch = """  request: z.string().describe("Natural language description of the diagram to generate (e.g., 'DFA that accepts binary strings ending in 01', 'Circuit diagram of an AND gate', 'Line plot of sin(x)')"),
  environment: z.enum(["python", "web"]).default("python").describe('Execution environment for diagrams. "python" for standard LLM Python sandboxes (ChatGPT, Claude, Perplexity), or "web" for the Custom Web Client (React/HTML).'),"""
content = content.replace('  request: z.string().describe("Natural language description of the diagram to generate (e.g., \'DFA that accepts binary strings ending in 01\', \'Circuit diagram of an AND gate\', \'Line plot of sin(x)\')"),', schema_patch)

content = content.replace('function buildAccuracyRules(format: DiagramFormat): string {', 'function buildAccuracyRules(format: DiagramFormat, environment: "python" | "web" = "python"): string {')

accuracy_rules_patch = """  const sharedRules = environment === "web" ? [
    "- Read the request twice before drawing so labels, counts, directions, and constraints match exactly.",
    "- Do not invent nodes, tasks, gates, components, datasets, or transitions that were not requested or logically required.",
    "- Ensure your HTML/React code renders visually in the browser so the WebArtifactSandbox can capture it.",
    "- Use provided JS libraries (chart.js, d3-graphviz, tscircuit, frappe-gantt, etc.) via ESM imports.",
    "- For HTML blocks, wrap in standard <html><body> and use <script type=\\"module\\">.",
    "- For React blocks, write standard React components and export them as default."
  ] : [
    "- Read the request twice before drawing so labels, counts, directions, and constraints match exactly.",
    "- Do not invent nodes, tasks, gates, components, datasets, or transitions that were not requested or logically required.",
    "- Before finalizing, perform a self-check that every label in the diagram can be traced back to the request or validated source material.",
    "- If a package import fails in the web sandbox, install it with `pip install <package>` and rerun the script.",
    "- If the diagram still feels ambiguous, revise the structure rather than decorating an incorrect layout.",
  ];"""

content = re.sub(r'  const sharedRules = \[.*?\];', accuracy_rules_patch, content, flags=re.DOTALL)

content = content.replace('function buildFormatExample(format: DiagramFormat): string {', 'function buildFormatExample(format: DiagramFormat, environment: "python" | "web" = "python"): string {')

format_example_patch = """  if (format === "dot") {
    if (environment === "web") {
      return `### Graphviz DOT Syntax via d3-graphviz
\\\`\\\`\\\`html
<!-- Render graphviz using d3-graphviz -->
<div id="graph"></div>
<script type="module">
  import { graphviz } from 'd3-graphviz';
  graphviz("#graph").renderDot(\\\`digraph { ... }\\\`);
</script>
\\\`\\\`\\\``;
    }
    return `### Graphviz DOT Syntax (Most Accurate for FSMs)
\\\`\\\`\\\`dot
digraph {
  rankdir=LR;
  node [shape=circle, style=filled, fillcolor="#e8f4fd", color="#2196F3"];
  edge [color="#555555"];
  
  # Add your states and transitions here
  q0 [label="q0"];
  q1 [label="q1", shape=doublecircle];  // accept state
  q0 -> q1 [label="0"];
}
\\\`\\\`\\\``;
  }

  if (format === "circuit") {
    if (environment === "web") {
      return `### Circuit Diagram
\\\`\\\`\\\`react
import React from 'react';
// import { ... } from '@tscircuit/core';
export default function Circuit() {
  return <div>...</div>;
}
\\\`\\\`\\\``;
    }
    return `### Circuit Diagram (schemdraw)
\\\`\\\`\\\`python
import schemdraw
import schemdraw.elements as elm

with schemdraw.Drawing() as d:
    d += elm.Resistor().label('R1')
    d += elm.Line().right(0.5)
    d += elm.Gap().label(['+5V', '-'])
    # Add your circuit components
    d.save('/tmp/diagram.png')
\\\`\\\`\\\``;
  }

  if (format === "plot") {
    if (environment === "web") {
      return `### Chart.js or Plotly.js Visualization
\\\`\\\`\\\`html
<canvas id="myChart"></canvas>
<script type="module">
  import Chart from 'chart.js/auto';
  // ...
</script>
\\\`\\\`\\\``;
    }
    return `### Matplotlib/Plotly Visualization
\\\`\\\`\\\`python
import matplotlib.pyplot as plt
import numpy as np

# Your visualization code here
plt.savefig('/tmp/diagram.png', dpi=150, bbox_inches='tight', transparent=True)
\\\`\\\`\\\``;
  }

  if (format === "gantt") {
    if (environment === "web") {
      return `### Gantt Chart via frappe-gantt
\\\`\\\`\\\`html
<div id="gantt"></div>
<script type="module">
  import Gantt from 'frappe-gantt';
  // ...
</script>
\\\`\\\`\\\``;
    }
    return `### Gantt Chart
\\\`\\\`\\\`python
import plotly.express as px

# Preferred: use plotly timeline or python-gantt style packages when available
# Fallback: use matplotlib if the preferred package is unavailable
\\\`\\\`\\\``;
  }

  if (format === "logic") {
    if (environment === "web") {
      return `### Logic Gates
\\\`\\\`\\\`react
import React from 'react';
export default function LogicGates() {
  return <svg>...</svg>;
}
\\\`\\\`\\\``;
    }
    return `### Logic Gates
\\\`\\\`\\\`python
import matplotlib.pyplot as plt

# Draw logic gates (AND, OR, NOT, XOR, NAND, NOR)
# Use patches and lines to create gate shapes
plt.savefig('/tmp/diagram.png', dpi=150, bbox_inches='tight', transparent=True)
\\\`\\\`\\\``;
  }"""

content = re.sub(r'  if \(format === "dot"\) \{.*?(?=  return `### Format Notes)', format_example_patch + '\n\n  ', content, flags=re.DOTALL)

description_patch = """      description: `Generate diagrams in multiple formats using LLM web-interface sandboxes for accurate rendering.

## Supported Diagram Types:
1. **dot** (Graphviz) — FSMs, state diagrams, directed graphs, trees (most accurate for FSMs)
2. **mermaid** — Flowcharts, sequence diagrams, state diagrams, class diagrams (native renderer is fine for simple cases)
3. **circuit** — Electronic schematics (resistors, capacitors, transistors, etc.)
4. **plot** — Line, bar, scatter, heatmaps, histograms (matplotlib/plotly)
5. **gantt** — Project timelines and schedules
6. **logic** — Logic gates, Boolean algebra circuits

## Workflow:
1. I generate the appropriate spec/code for your request
2. If environment='python': Use the LLM web-interface Python sandbox (ChatGPT, Claude, Perplexity) for complex formats (dot, circuit, plot, gantt, logic).
3. If environment='web': Generate HTML or React code that uses frontend visualization libraries (chart.js, d3-graphviz, tscircuit, frappe-gantt). The WebArtifactSandbox will automatically capture the visual output and upload it.
4. Use native renderer for simple Mermaid or when you already render SVG in HTML

This avoids limitations with native renderers (e.g., Mermaid not supporting accurate FSMs in DOT).

Args:
  - request: What you want diagrammed
  - format: Auto-detects best format, or specify one
  - environment: 'python' for ChatGPT/Claude/Perplexity, 'web' for Custom Web Client`,
"""
content = re.sub(r'      description: `Generate diagrams in multiple formats.*?`,\n', description_patch, content, flags=re.DOTALL)

content = content.replace('async ({ request, format }) => {', 'async ({ request, format, environment = "python" }) => {')

response_text_patch = """        const responseText = [
          `## Diagram Generation`,
          `**Request:** ${request}`,
          `**Recommended Format:** ${normalizedFormat.toUpperCase()}`,
          ``,
          `## Your Task`,
          environment === "web" ? `Generate a complete, valid ${normalizedFormat.toUpperCase()} web artifact for the above request.` : `Generate a complete, valid ${normalizedFormat === "dot" ? "Graphviz DOT" : normalizedFormat.toUpperCase()} spec for the above request.`,
          useSandbox ? (environment === "web" ? `Write HTML or React code using JS visualization libraries. The WebArtifactSandbox will execute and capture it.` : `Use the web-interface Python sandbox for rendering (ChatGPT, Claude, Perplexity).`) : `Use the native renderer (Mermaid or your SVG pipeline).`,
          useSandbox ? (environment === "web" ? `Return the code block tagged with \\\`\\\`\\\`html or \\\`\\\`\\\`react. The environment supports imports from esm.sh.` : `Do not truncate or summarize the spec. Run the sandbox script and return the rendered image with a download link.`) : `If SVG is produced, render it natively (HTML artifact).`,
          ``,
          buildFormatExample(normalizedFormat, environment as any),
          ``,
          `## Rules for Accuracy`,
          buildAccuracyRules(normalizedFormat, environment as any),
          useSandbox ? (environment === "web" ? `## Web Artifact Example\n\\\`\\\`\\\`\n${sandboxScript}\n\\\`\\\`\\\`` : `## Web Sandbox Script\n\\\`\\\`\\\`python\n${sandboxScript}\n\\\`\\\`\\\``) : ``,
        ];"""

content = re.sub(r'        const responseText = \[.*?\];', response_text_patch, content, flags=re.DOTALL)

with open('src/tools/diagram-generator.ts', 'w', encoding='utf-8') as f:
    f.write(content)
