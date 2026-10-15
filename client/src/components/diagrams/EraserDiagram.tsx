import React, { useState, useMemo } from "react";
import { Maximize2, Minimize2 } from "lucide-react";
import type { EraserDocument } from "@/lib/eraser/types";
import { EraserCanvas } from "./EraserCanvas";

interface EraserDiagramProps {
  code: string;
}

export function EraserDiagram({ code }: EraserDiagramProps) {
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Parse diagram JSON from tool calls or markdown code blocks
  const doc: EraserDocument = useMemo(() => {
    try {
      let clean = code.trim();
      if (clean.startsWith("```")) {
        clean = clean.replace(/^```(?:json|eraser|eraser-diagram)?\s*/i, "").replace(/\s*```$/, "");
      }
      const parsed = JSON.parse(clean);
      if (parsed && (parsed.entities || parsed.connections)) {
        return {
          title: parsed.title || "Architecture Diagram",
          description: parsed.description || "",
          entities: Array.isArray(parsed.entities) ? parsed.entities : [],
          connections: Array.isArray(parsed.connections) ? parsed.connections : [],
        };
      }
    } catch (e) {
      console.error("Failed to parse Eraser diagram code:", e);
    }
    return {
      title: "Architecture Diagram",
      entities: [],
      connections: [],
    };
  }, [code]);

  return (
    <div className="my-3 rounded-xl border border-border/80 bg-card shadow-sm overflow-hidden group">
      {/* Embedded Canvas */}
      <div className="relative">
        <EraserCanvas
          initialDocument={doc}
          isEmbedded={true}
        />
        {/* Fullscreen Expand Button in top-right */}
        <button
          onClick={() => setIsFullScreen(true)}
          className="absolute top-2 right-12 p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors z-10"
          title="Open Fullscreen"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Fullscreen Modal View */}
      {isFullScreen && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col">
          <EraserCanvas
            initialDocument={doc}
            isStandalone={true}
            isEmbedded={false}
            onClose={() => setIsFullScreen(false)}
          />
        </div>
      )}
    </div>
  );
}
