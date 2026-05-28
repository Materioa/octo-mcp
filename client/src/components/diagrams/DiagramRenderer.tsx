import { MermaidDiagram } from "./MermaidDiagram";
import { GraphvizDiagram } from "./GraphvizDiagram";
import { CodeSandbox } from "@/components/sandbox/CodeSandbox";

interface DiagramRendererProps {
  code: string;
  language: string;
}

export function DiagramRenderer({ code, language }: DiagramRendererProps) {
  switch (language) {
    case "mermaid":
      return <MermaidDiagram code={code} />;

    case "dot":
    case "graphviz":
      return <GraphvizDiagram code={code} />;

    case "python":
    case "javascript":
    case "js":
    case "typescript":
    case "ts":
      return <CodeSandbox code={code} language={language === "python" ? "javascript" : language === "ts" ? "typescript" : "javascript"} />;

    default:
      return (
        <pre className="my-2 overflow-x-auto rounded-lg bg-background/50 p-3 text-xs">
          <code>{code}</code>
        </pre>
      );
  }
}
