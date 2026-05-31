import { useEffect, useRef } from "react";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";

interface MarkmapDiagramProps {
  code: string;
}

const transformer = new Transformer();

export function MarkmapDiagram({ code }: MarkmapDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const mmRef = useRef<Markmap | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    
    // Initialize markmap
    if (!mmRef.current) {
      mmRef.current = Markmap.create(svgRef.current, {
        autoFit: false,
        fitRatio: 0.9,
      });
    }

    let isMounted = true;
    const renderMap = async () => {
      try {
        const { root } = transformer.transform(code);
        if (isMounted) {
          await mmRef.current?.setData(root);
          await mmRef.current?.fit();
        }
      } catch (err) {
        console.error("Failed to render markmap", err);
      }
    };

    renderMap();
    return () => {
      isMounted = false;
    };
  }, [code]);

  // Handle responsive resizing safely
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !mmRef.current || !svgRef.current) return;

    let timeoutId: any;
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          // Explicitly set absolute pixel values to prevent D3 "SVGLength" relative length errors
          svgRef.current!.setAttribute('width', `${width}`);
          svgRef.current!.setAttribute('height', `${height}`);
          
          clearTimeout(timeoutId);
          timeoutId = setTimeout(() => {
            try {
              mmRef.current?.fit();
            } catch (e) {
              console.warn("Markmap fit error on resize:", e);
            }
          }, 100);
        }
      }
    });

    resizeObserver.observe(container);

    return () => {
      clearTimeout(timeoutId);
      resizeObserver.disconnect();
    };
  }, []);

  return (
    <div className="relative my-4 w-full h-[400px] border border-border rounded-lg overflow-hidden bg-card/50"
         style={{
           backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(150, 150, 150, 0.15) 1px, transparent 0)',
           backgroundSize: '24px 24px'
         }}>
      {/* Hardcoded explicit white/black logic avoiding all CSS variables and inheritance */}
      <style>{`
        /* Light mode default */
        .markmap-svg-container svg text,
        .markmap-svg-container svg foreignObject,
        .markmap-svg-container .markmap-foreign,
        .markmap-svg-container .markmap-foreign div,
        .markmap-svg-container .markmap-foreign span,
        .markmap-svg-container .markmap-foreign p,
        .markmap-svg-container .markmap-foreign a,
        .markmap-svg-container .markmap-foreign code {
          color: #000000 !important;
          fill: #000000 !important;
          font-family: "Epilogue", BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        }

        /* Dark mode override */
        html.dark .markmap-svg-container svg text,
        html.dark .markmap-svg-container svg foreignObject,
        html.dark .markmap-svg-container .markmap-foreign,
        html.dark .markmap-svg-container .markmap-foreign div,
        html.dark .markmap-svg-container .markmap-foreign span,
        html.dark .markmap-svg-container .markmap-foreign p,
        html.dark .markmap-svg-container .markmap-foreign a,
        html.dark .markmap-svg-container .markmap-foreign code {
          color: #ffffff !important;
          fill: #ffffff !important;
          font-family: "Epilogue", BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
        }
      `}</style>
      <div ref={containerRef} className="w-full h-full markmap-svg-container text-foreground flex items-center justify-center">
        <svg ref={svgRef} width="600" height="400" style={{ width: '100%', height: '100%' }} />
      </div>
      
      <div className="absolute bottom-4 right-4 flex gap-1 bg-background/80 backdrop-blur-sm rounded-md shadow-sm border border-border p-1">
        <button 
          onClick={() => { try { mmRef.current?.rescale(1.2) } catch(e) {} }}
          className="flex items-center justify-center w-8 h-8 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Zoom In"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <button 
          onClick={() => { try { mmRef.current?.rescale(0.8) } catch(e) {} }}
          className="flex items-center justify-center w-8 h-8 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Zoom Out"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        </button>
        <div className="w-px bg-border my-1 mx-0.5"></div>
        <button 
          onClick={() => { try { mmRef.current?.fit() } catch(e) {} }}
          className="flex items-center justify-center w-8 h-8 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Fit to Screen"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14v6h6"/><path d="M20 10V4h-6"/><path d="M14 20h6v-6"/><path d="M10 4H4v6"/></svg>
        </button>
      </div>
    </div>
  );
}
