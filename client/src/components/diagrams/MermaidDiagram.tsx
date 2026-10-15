import { useEffect, useRef, useState } from "react";
import mermaid from "mermaid";
import { Copy, Check, Download } from "lucide-react";

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
  const [copied, setCopied] = useState(false);

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
      document.querySelectorAll('svg[id^="dmermaid"]').forEach((el) => el.remove());
    };
  }, [code]);

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const downloadSvg = () => {
    if (!svg) return;
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "mermaid-diagram.svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

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
    <div className="my-3 rounded-xl border border-border bg-card shadow-sm overflow-hidden group">
      {/* Header bar */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-muted/40 border-b border-border text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground font-mono text-[11px]">
          <span>mermaid</span>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={copyCode}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Copy Mermaid code"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
          {svg && (
            <button
              onClick={downloadSvg}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Download SVG"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
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
