import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  suppressErrorRendering: true,
});

interface MermaidDiagramProps {
  code: string;
}

export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg: renderedSvg } = await mermaid.render(id, code);
        if (!cancelled) {
          setSvg(renderedSvg);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message ?? "Failed to render diagram");
        }
      }
    };
    render();
    return () => {
      cancelled = true;
      // Clean up any stray error SVGs that Mermaid might inject into the body
      document.querySelectorAll('svg[id^="dmermaid"]').forEach(el => el.remove());
    };
  }, [code]);

  if (error) {
    return (
      <div className="my-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400">
        <p className="font-medium">Mermaid Error</p>
        <pre className="mt-1 whitespace-pre-wrap">{error}</pre>
        <pre className="mt-2 overflow-x-auto text-[10px] text-muted-foreground">{code}</pre>
      </div>
    );
  }

  return (
    <div className="my-2 overflow-x-auto rounded-lg bg-background/50 p-4">
      {svg ? (
        <div dangerouslySetInnerHTML={{ __html: svg }} />
      ) : (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
          Rendering diagram...
        </div>
      )}
    </div>
  );
}
