import { useEffect, useRef } from "react";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";
import { Toolbar } from "markmap-toolbar";
import "markmap-toolbar/dist/style.css";

interface MarkmapDiagramProps {
  code: string;
}

const transformer = new Transformer();

export function MarkmapDiagram({ code }: MarkmapDiagramProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const mmRef = useRef<Markmap | null>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    
    // Initialize markmap
    if (!mmRef.current) {
      mmRef.current = Markmap.create(svgRef.current);
      
      // Initialize toolbar
      if (toolbarRef.current) {
        const toolbar = new Toolbar();
        toolbar.attach(mmRef.current);
        toolbar.render();
        toolbarRef.current.innerHTML = '';
        toolbarRef.current.appendChild(toolbar.el);
      }
    }

    try {
      // Transform markdown
      const { root } = transformer.transform(code);
      mmRef.current.setData(root);
      mmRef.current.fit();
    } catch (err) {
      console.error("Failed to render markmap", err);
    }
  }, [code]);

  return (
    <div className="relative my-4 w-full h-[400px] border border-border rounded-lg overflow-hidden bg-card/50"
         style={{
           backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(150, 150, 150, 0.15) 1px, transparent 0)',
           backgroundSize: '24px 24px'
         }}>
      <svg ref={svgRef} className="w-full h-full" />
      <div ref={toolbarRef} className="absolute bottom-4 right-4 flex bg-background rounded shadow-sm border border-border overflow-hidden [&>div]:border-0" />
    </div>
  );
}
