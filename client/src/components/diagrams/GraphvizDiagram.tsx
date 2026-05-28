import { useEffect, useState } from "react";
import { instance as Viz } from "@viz-js/viz";

interface GraphvizDiagramProps {
  code: string;
}

export function GraphvizDiagram({ code }: GraphvizDiagramProps) {
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const viz = await Viz();
        const result = viz.renderSVGElement(code);
        if (!cancelled) {
          setSvg(result.outerHTML);
          setError(null);
        }
      } catch (err: any) {
        if (!cancelled) {
          setError(err.message ?? "Failed to render Graphviz diagram");
        }
      }
    };
    render();
    return () => {
      cancelled = true;
    };
  }, [code]);

  if (error) {
    return (
      <div className="my-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400">
        <p className="font-medium">Graphviz Error</p>
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
          Rendering graph...
        </div>
      )}
    </div>
  );
}
