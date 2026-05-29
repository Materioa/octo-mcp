import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toPng } from "html-to-image";
import { DownloadIcon } from "lucide-react";

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
    "echarts": "https://esm.sh/echarts@5.5.0",
    "jsnetworkx": "https://esm.sh/jsnetworkx@0.3.4",
    "frappe-gantt": "https://esm.sh/frappe-gantt@0.6.1",
    "tscircuit": "https://esm.sh/tscircuit@0.0.103",
    "@tscircuit/core": "https://esm.sh/@tscircuit/core@0.0.98",
    "react-circuit-schematics": "https://esm.sh/react-circuit-schematics@0.0.10",
    "d3-graphviz": "https://esm.sh/d3-graphviz@5.6.0",
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
      import React from 'react';
      import { createRoot } from 'react-dom/client';
      ${normalizedCode.includes('export default') ? normalizedCode.replace(/export default\s+(function|class)\s+(\w+)/, 'const $2 = $1').replace(/export default\s+(\w+)/, 'const App = $1') : normalizedCode}
      
      // Attempt to auto-render if App component exists
      setTimeout(() => {
        if (typeof App !== 'undefined') {
          const root = createRoot(document.getElementById('root'));
          root.render(React.createElement(App));
        }
      }, 100);
    `;
  } else {
    // Pure HTML or JS
    scriptContent = normalizedCode;
  }

  const isHtml = language === "html";
  const bodyContent = isHtml ? normalizedCode : `<div id="root"></div>`;
  const scriptTag = isHtml ? "" : `<script type="text/babel" data-type="module">${scriptContent}</script>`;

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font-family: sans-serif; margin: 0; padding: 16px; background: white; }
    </style>
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
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          Artifact - {language}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 text-xs text-muted-foreground hover:text-foreground"
          onClick={downloadImage}
          disabled={isCapturing}
        >
          <DownloadIcon className="h-3.5 w-3.5" />
          {isCapturing ? "Saving..." : "Download"}
        </Button>
      </div>
      <div className="relative min-h-[300px] bg-white">
        <iframe
          ref={iframeRef}
          srcDoc={srcDoc}
          className="w-full h-full min-h-[400px] border-0"
          sandbox="allow-scripts allow-same-origin"
        />
      </div>
      {error && (
        <div className="px-3 py-2 text-xs text-red-500 border-t border-border bg-red-500/10">
          {error}
        </div>
      )}
    </div>
  );
}
