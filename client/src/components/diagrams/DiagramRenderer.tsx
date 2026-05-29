import { MermaidDiagram } from "./MermaidDiagram";
import { GraphvizDiagram } from "./GraphvizDiagram";
import { MarkmapDiagram } from "./MarkmapDiagram";
import { CodeSandbox } from "@/components/sandbox/CodeSandbox";
import { WebArtifactSandbox } from "@/components/sandbox/WebArtifactSandbox";

interface DiagramRendererProps {
  code: string;
  language: string;
  isStreaming?: boolean;
}

export function DiagramRenderer({ code, language, isStreaming }: DiagramRendererProps) {
  if (isStreaming) {
    return (
      <div className="my-4 rounded-lg border border-border shadow-sm overflow-hidden bg-card">
        <div className="flex items-center px-4 py-2 bg-muted/50 border-b border-border text-xs font-medium text-muted-foreground animate-pulse">
          <svg className="mr-2 h-3 w-3 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
          Generating {language} visualization...
        </div>
        <pre className="overflow-x-auto p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap max-h-[300px] overflow-y-auto">
          {code}
        </pre>
      </div>
    );
  }

  switch (language) {
    case "mermaid":
      return <MermaidDiagram code={code} />;

    case "dot":
    case "graphviz":
      return <GraphvizDiagram code={code} />;
      
    case "markmap":
    case "mindmap":
      return <MarkmapDiagram code={code} />;

    case "javascript":
    case "js":
      return <CodeSandbox code={code} language="javascript" />;
      
    case "typescript":
    case "ts":
      return <CodeSandbox code={code} language="typescript" />;
      
    case "html":
    case "react":
    case "jsx":
    case "tsx":
      return <WebArtifactSandbox code={code} language={language as any} autoCapture={true} onCaptured={(url) => {
        // You could dispatch this to the chat store to replace the artifact with an image,
        // or just leave it up to the LLM to output markdown that includes it later.
        console.log("Captured artifact URL:", url);
      }} />;

    default:
      return (
        <pre className="my-2 overflow-x-auto rounded-lg bg-background/50 p-3 text-xs">
          <code>{code}</code>
        </pre>
      );
  }
}
