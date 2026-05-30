import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toPng } from "html-to-image";
import { DownloadIcon, Code, Eye } from "lucide-react";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";

interface WebArtifactSandboxProps {
  code: string;
  language?: "react" | "html" | "javascript" | "typescript";
  onCaptured?: (url: string) => void;
  autoCapture?: boolean;
}

const IMPORT_MAP = {
  imports: {
    "react": "https://esm.sh/react@18.2.0",
    "react-dom/client": "https://esm.sh/react-dom@18.2.0/client",
    "plotly.js": "https://esm.sh/plotly.js-dist-min@2.30.0",
    "chart.js": "https://esm.sh/chart.js@4.4.2",
    "chart.js/auto": "https://esm.sh/chart.js@4.4.2/auto",
    "chartjs-chart-3d": "https://esm.sh/chartjs-chart-3d@1.2.1?external=chart.js",
    "react-chartjs-2": "https://esm.sh/react-chartjs-2@5.2.0?external=react,react-dom,chart.js",
    "lucide-react": "https://esm.sh/lucide-react@0.359.0?external=react",
    "recharts": "https://esm.sh/recharts@2.12.3?external=react,react-dom",
    "three": "https://esm.sh/three@0.162.0",
    "@react-three/fiber": "https://esm.sh/@react-three/fiber@8.15.19?external=react,react-dom,three",
    "@react-three/drei": "https://esm.sh/@react-three/drei@9.102.6?external=react,react-dom,three,@react-three/fiber",
    "framer-motion": "https://esm.sh/framer-motion@11.0.14?external=react,react-dom",
    "clsx": "https://esm.sh/clsx@2.1.0",
    "tailwind-merge": "https://esm.sh/tailwind-merge@2.2.1",
    "echarts": "https://esm.sh/echarts@5.5.0",
    "jsnetworkx": "https://esm.sh/jsnetworkx@0.3.4",
    "frappe-gantt": "https://esm.sh/frappe-gantt@0.6.1",
    "tscircuit": "https://esm.sh/tscircuit@0.0.103",
    "@tscircuit/core": "https://esm.sh/@tscircuit/core@0.0.98",
    "react-circuit-schematics": "https://esm.sh/react-circuit-schematics@0.0.10?external=react,react-dom",
    "d3-graphviz": "https://esm.sh/d3-graphviz@5.6.0?external=d3",
    "mermaid": "https://esm.sh/mermaid@10.9.0",
    "d3": "https://esm.sh/d3@7.9.0"
  }
};

function buildHtmlSandbox(code: string, language: string) {
  // Strip stray markdown backticks from the start/end if LLM nested them
  let cleanCode = code.trim();
  if (cleanCode.startsWith('\`\`\`')) {
    cleanCode = cleanCode.replace(/^\`\`\`[a-z]*\n?/, '').replace(/\n?\`\`\`$/, '');
  }

  // Normalize broken CDN imports hallucinated by LLMs to use our import map
  const normalizedCode = cleanCode.replace(/https?:\/\/cdn\.jsdelivr\.net\/npm\/chart\.js[^'"]*/g, "chart.js/auto");
  
  let scriptContent = "";
  
  if (language === "react" || language === "tsx" || language === "jsx") {
    // We expect the LLM to write something like:
    // export default function App() { return <div>Hello</div>; }
    // Or just inline React code. We need to render it.
    scriptContent = `
      // Make React globally available for Babel's fallback compilation, but use an alias 
      // so if the user ALSO imports React, it just localizes the variable without crashing.
      import * as __React__ from 'react';
      window.React = __React__;
      import * as __ReactDOMClient__ from 'react-dom/client';
      window.createRoot = __ReactDOMClient__.createRoot;

      ${normalizedCode.replace(/export\s+default\s+(function\s+\w+|class\s+\w+|\w+)/, 'window.App = $1').replace(/export\s+default\s+/, 'window.App = ')}
      
      // Attempt to auto-render if App component was assigned to window.App
      setTimeout(() => {
        if (typeof window.App !== 'undefined') {
          const root = window.createRoot(document.getElementById('root'));
          root.render(__React__.createElement(window.App));
        }
      }, 100);
    `;
  } else {
    // Pure HTML or JS
    scriptContent = normalizedCode;
  }

  const isHtml = language === "html";
  const bodyContent = isHtml ? normalizedCode : `<div id="root" style="width: 100%; height: 100%;"></div>`;
  const scriptTag = isHtml ? "" : `<script type="text/babel" data-type="module">${scriptContent}</script>`;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      html, body { margin: 0; padding: 0; width: 100%; height: 100%; box-sizing: border-box; overflow: hidden; }
      body { font-family: sans-serif; background: white; }
      #root:empty { display: none; }
    </style>
    <script>
      // Suppress React DevTools warning
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = { isDisabled: true };
      
      // Suppress Babel in-browser transformer warning
      const origWarn = console.warn;
      console.warn = (...args) => {
        if (args[0] && typeof args[0] === 'string' && args[0].includes('in-browser Babel transformer')) return;
        origWarn(...args);
      };
    </script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <script type="importmap">${JSON.stringify(IMPORT_MAP)}</script>
  </head>
  <body>
    ${bodyContent}
    ${scriptTag}
  </body>
</html>`;
}

export function WebArtifactSandbox({ code, language = "react", onCaptured, autoCapture = false }: WebArtifactSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"preview" | "code">("preview");
  const [isDark, setIsDark] = useState(false);

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.attributeName === 'class') {
          setIsDark(document.documentElement.classList.contains("dark"));
        }
      }
    });
    observer.observe(document.documentElement, { attributes: true });
    return () => observer.disconnect();
  }, []);

  const srcDoc = buildHtmlSandbox(code, language);

  const downloadImage = async () => {
    if (!iframeRef.current || !iframeRef.current.contentDocument) return;
    try {
      setIsCapturing(true);
      setError(null);
      
      const body = iframeRef.current.contentDocument.body;
      const dataUrl = await toPng(body, { backgroundColor: '#ffffff', pixelRatio: 2 });
      
      const link = document.createElement('a');
      link.href = dataUrl;
      link.download = `diagram-${Date.now()}.png`;
      link.click();
      
    } catch (err: any) {
      console.error("Failed to capture artifact:", err);
      setError(err.message || "Failed to capture artifact");
    } finally {
      setIsCapturing(false);
    }
  };

  useEffect(() => {
    // autoCapture logic is removed as we no longer upload to supabase automatically
  }, [srcDoc]);

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5 bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="flex items-center bg-muted/50 rounded p-0.5 border border-border/50">
            <button
              onClick={() => setViewMode("preview")}
              title="Preview UI"
              className={cn("flex items-center justify-center p-1.5 rounded-sm text-xs font-medium transition-colors", viewMode === "preview" ? "bg-background text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground")}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode("code")}
              title="View Code"
              className={cn("flex items-center justify-center p-1.5 rounded-sm text-xs font-medium transition-colors", viewMode === "code" ? "bg-background text-foreground shadow-sm border border-border/50" : "text-muted-foreground hover:text-foreground")}
            >
              <Code className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className={cn("h-7 w-7 p-0 text-muted-foreground hover:text-foreground", isCapturing && "animate-pulse")}
          onClick={downloadImage}
          disabled={isCapturing || viewMode === "code"}
          title="Download Image"
        >
          <DownloadIcon className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="relative min-h-[300px] bg-white">
        <iframe
          ref={iframeRef}
          srcDoc={srcDoc}
          className={cn("w-full h-full min-h-[400px] border-0", viewMode === "code" && "hidden")}
          sandbox="allow-scripts allow-same-origin"
        />
        {viewMode === "code" && (
          <div className="absolute inset-0 overflow-auto bg-card text-left">
            <SyntaxHighlighter
              style={(isDark ? oneDark : oneLight) as any}
              language={language === 'react' ? 'jsx' : language}
              PreTag="div"
              customStyle={{ margin: 0, padding: "1.5rem", background: "transparent", fontSize: "0.85rem" }}
            >
              {code.trim()}
            </SyntaxHighlighter>
          </div>
        )}
      </div>
      {error && (
        <div className="px-3 py-2 text-xs text-red-500 border-t border-border bg-red-500/10">
          {error}
        </div>
      )}
    </div>
  );
}
