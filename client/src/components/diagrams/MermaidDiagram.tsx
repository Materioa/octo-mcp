import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { Sparkles, Layers, Loader2 } from "lucide-react";
import { useChatStore } from "@/stores/chat";
import { generateOrUpdateEraserDiagram } from "@/lib/eraser/ai-generator";

mermaid.initialize({
  startOnLoad: false,
  theme: "dark",
  securityLevel: "loose",
  suppressErrorRendering: true,
  fontFamily: 'inherit, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
});

interface MermaidDiagramProps {
  code: string;
}

export function MermaidDiagram({ code }: MermaidDiagramProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string>("");
  const [isTransforming, setIsTransforming] = useState(false);

  const { openEraserCanvas } = useChatStore();

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

  const handleTransformToEraser = async () => {
    setIsTransforming(true);
    try {
      const doc = await generateOrUpdateEraserDiagram(code);
      openEraserCanvas(doc);
    } catch (err: any) {
      alert("Failed to transform diagram: " + (err?.message || "Check your AI API key in Settings"));
    } finally {
      setIsTransforming(false);
    }
  };

  if (error) {
    return (
      <div className="my-2 rounded-lg border border-red-500/20 bg-red-500/5 p-3 text-xs text-red-400">
        <p className="font-medium">Mermaid Error</p>
        <pre className="mt-1 whitespace-pre-wrap">{error}</pre>
        <pre className="mt-2 overflow-x-auto text-[10px] text-muted-foreground">{code}</pre>
        <button
          onClick={handleTransformToEraser}
          disabled={isTransforming}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-all"
        >
          {isTransforming ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          <span>{isTransforming ? "Transforming..." : "Transform to Eraser Canvas"}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-border bg-card shadow-sm overflow-hidden group">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-muted/40 border-b border-border text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[11px]">
          <span>mermaid</span>
        </div>

        <button
          onClick={handleTransformToEraser}
          disabled={isTransforming}
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-medium text-xs shadow-sm transition-all disabled:opacity-50"
          title="Upgrade this Mermaid diagram to an interactive Eraser diagram with icons and custom shapes"
        >
          {isTransforming ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Sparkles className="w-3.5 h-3.5" />
          )}
          <span>{isTransforming ? "Upgrading to Canvas..." : "✨ Upgrade to Interactive Canvas"}</span>
        </button>
      </div>

      {/* SVG Diagram Surface */}
      <div className="p-4 w-full flex justify-center bg-background/50 overflow-x-auto">
        {svg ? (
          <div 
            className="[&>svg]:max-w-full [&>svg]:h-auto w-full flex justify-center"
            dangerouslySetInnerHTML={{ __html: svg }} 
          />
        ) : (
          <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground w-full py-8">
            <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
            Rendering diagram...
          </div>
        )}
      </div>
    </div>
  );
}
