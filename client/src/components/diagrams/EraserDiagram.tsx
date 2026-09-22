import React, { useState, useMemo } from "react";
import { Maximize2, Download, Copy, Check, Sparkles, Layers } from "lucide-react";
import type { EraserDocument, EraserEntity, EraserConnection } from "@/lib/eraser/types";
import { resolveColor, resolveTint, resolveLayerBg } from "@/lib/eraser/palette";
import { getIconSvgPath } from "@/lib/eraser/icons";
import { useChatStore } from "@/stores/chat";
import { EraserCanvas } from "./EraserCanvas";

interface EraserDiagramProps {
  code: string;
}

export function EraserDiagram({ code }: EraserDiagramProps) {
  const [copied, setCopied] = useState(false);
  const [isFullScreen, setIsFullScreen] = useState(false);

  // Parse diagram JSON
  const doc: EraserDocument = useMemo(() => {
    try {
      let clean = code.trim();
      if (clean.startsWith("```")) {
        clean = clean.replace(/^```(?:json|eraser|eraser-diagram)?\s*/i, "").replace(/\s*```$/, "");
      }
      const parsed = JSON.parse(clean);
      if (parsed.entities && parsed.connections) {
        return parsed;
      }
    } catch (e) {
      console.error("Failed to parse Eraser diagram code:", e);
    }
    return {
      title: "Diagram",
      entities: [],
      connections: [],
    };
  }, [code]);

  const { openEraserCanvas } = useChatStore();

  // Compute bounding box for diagram SVG viewbox
  const viewBox = useMemo(() => {
    if (!doc.entities || doc.entities.length === 0) return "0 0 800 500";
    let maxX = 800;
    let maxY = 500;
    doc.entities.forEach((e) => {
      const right = (e.x || 0) + (e.width || 140);
      const bottom = (e.y || 0) + (e.height || 70);
      if (right > maxX) maxX = right;
      if (bottom > maxY) maxY = bottom;
    });
    return `0 0 ${maxX + 50} ${maxY + 50}`;
  }, [doc.entities]);

  const copyCode = () => {
    navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const { containers, regularEntities } = useMemo(() => {
    const containers: EraserEntity[] = [];
    const regularEntities: EraserEntity[] = [];
    doc.entities?.forEach((ent) => {
      if (ent.tag === "Group" || ent.isContainer) {
        containers.push(ent);
      } else {
        regularEntities.push(ent);
      }
    });
    return { containers, regularEntities };
  }, [doc.entities]);

  const getConnectionPath = (conn: EraserConnection) => {
    const fromEnt = doc.entities.find((e) => e.id === conn.from);
    const toEnt = doc.entities.find((e) => e.id === conn.to);
    if (!fromEnt || !toEnt) return "";

    const fromW = fromEnt.width || 120;
    const fromH = fromEnt.height || 60;
    const toW = toEnt.width || 120;
    const toH = toEnt.height || 60;

    const fromCenter = { x: fromEnt.x + fromW / 2, y: fromEnt.y + fromH / 2 };
    const toCenter = { x: toEnt.x + toW / 2, y: toEnt.y + toH / 2 };

    const dx = toCenter.x - fromCenter.x;
    const dy = toCenter.y - fromCenter.y;

    let start = { x: fromCenter.x, y: fromCenter.y };
    let end = { x: toCenter.x, y: toCenter.y };

    if (Math.abs(dx) > Math.abs(dy)) {
      if (dx > 0) {
        start = { x: fromEnt.x + fromW, y: fromCenter.y };
        end = { x: toEnt.x, y: toCenter.y };
      } else {
        start = { x: fromEnt.x, y: fromCenter.y };
        end = { x: toEnt.x + toW, y: toCenter.y };
      }
    } else {
      if (dy > 0) {
        start = { x: fromCenter.x, y: fromEnt.y + fromH };
        end = { x: toCenter.x, y: toEnt.y };
      } else {
        start = { x: fromCenter.x, y: fromEnt.y };
        end = { x: toCenter.x, y: toEnt.y + toH };
      }
    }

    const midX = Math.round((start.x + end.x) / 2);
    return `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
  };

  const getConnectionMidpoint = (conn: EraserConnection) => {
    const fromEnt = doc.entities.find((e) => e.id === conn.from);
    const toEnt = doc.entities.find((e) => e.id === conn.to);
    if (!fromEnt || !toEnt) return { x: 0, y: 0 };
    const fromW = fromEnt.width || 120;
    const fromH = fromEnt.height || 60;
    const toW = toEnt.width || 120;
    const toH = toEnt.height || 60;
    return {
      x: (fromEnt.x + fromW / 2 + toEnt.x + toW / 2) / 2,
      y: (fromEnt.y + fromH / 2 + toEnt.y + toH / 2) / 2,
    };
  };

  return (
    <div className="my-4 rounded-xl border border-border bg-card shadow-sm overflow-hidden group">
      {/* Header Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border text-xs">
        <div className="flex items-center gap-2 font-medium text-foreground">
          <Layers className="w-4 h-4 text-blue-500" />
          <span>{doc.title || "Eraser Architecture Diagram"}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            onClick={() => {
              if (openEraserCanvas) {
                openEraserCanvas(doc);
              } else {
                setIsFullScreen(true);
              }
            }}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-600 hover:bg-blue-700 text-white font-medium shadow-sm transition-all"
            title="Open Interactive Canvas (Full visual editor)"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>Open in Interactive Canvas</span>
          </button>

          <button
            onClick={copyCode}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            title="Copy Eraser JSON"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* SVG Canvas Preview */}
      <div
        onClick={() => {
          if (openEraserCanvas) {
            openEraserCanvas(doc);
          } else {
            setIsFullScreen(true);
          }
        }}
        className="relative overflow-x-auto p-4 bg-white dark:bg-neutral-950 flex items-center justify-center cursor-pointer min-h-[320px] max-h-[550px]"
        title="Click to edit diagram in interactive canvas"
      >
        <svg viewBox={viewBox} className="w-full h-auto max-h-[500px]">
          <defs>
            <marker id="pv-arrow-blue" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M 0 1 L 7 4 L 0 7 z" fill="#2866c4" />
            </marker>
            <marker id="pv-arrow-purple" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M 0 1 L 7 4 L 0 7 z" fill="#c43dcf" />
            </marker>
            <marker id="pv-arrow-green" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M 0 1 L 7 4 L 0 7 z" fill="#30a050" />
            </marker>
            <marker id="pv-arrow-red" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
              <path d="M 0 1 L 7 4 L 0 7 z" fill="#bd413a" />
            </marker>
          </defs>

          {/* Group Layers */}
          {containers.map((group) => {
            const strokeColor = resolveColor(group.color, "#2866c4");
            const bgColor = resolveLayerBg(group.color);
            const title = typeof group.title === "object" ? group.title.text : group.title || "Layer";
            return (
              <g key={group.id}>
                <rect
                  x={group.x}
                  y={group.y}
                  width={group.width || 400}
                  height={group.height || 300}
                  rx={8}
                  fill={bgColor}
                  stroke={strokeColor}
                  strokeWidth="1.5"
                />
                <text x={group.x + 12} y={group.y + 20} fill={strokeColor} fontSize="13" fontWeight="600">
                  {title}
                </text>
              </g>
            );
          })}

          {/* Connections */}
          {doc.connections?.map((conn, idx) => {
            const pathData = getConnectionPath(conn);
            const strokeColor = resolveColor(conn.color, "#2866c4");
            const mid = getConnectionMidpoint(conn);
            return (
              <g key={conn.id || idx}>
                <path
                  d={pathData}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth="1.8"
                  strokeDasharray={conn.lineStyle === "dashed" ? "5 4" : "none"}
                  markerEnd="url(#pv-arrow-blue)"
                />
                {conn.label && (
                  <g transform={`translate(${mid.x}, ${mid.y})`}>
                    <rect
                      x={-((conn.label.length * 7 + 12) / 2)}
                      y="-9"
                      width={conn.label.length * 7 + 12}
                      height="18"
                      rx="5"
                      fill="#ffffff"
                      stroke={strokeColor}
                      strokeWidth="0.8"
                    />
                    <text x="0" y="4" textAnchor="middle" fill={strokeColor} fontSize="10" fontWeight="500">
                      {conn.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Regular Entities */}
          {regularEntities.map((entity) => {
            const w = entity.width || 120;
            const h = entity.height || 56;
            const color = resolveColor(entity.color, "#2866c4");
            const tint = resolveTint(entity.color, "#ffffff");
            const iconSvg = getIconSvgPath(entity.icon);
            const mainText = entity.texts?.[0]?.text || "";

            return (
              <g key={entity.id} transform={`translate(${entity.x}, ${entity.y})`}>
                {entity.shape === "diamond" ? (
                  <polygon points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`} fill={tint} stroke={color} strokeWidth="1.5" />
                ) : entity.shape === "cylinder" ? (
                  <g>
                    <path
                      d={`M 0 10 L 0 ${h - 10} A ${w / 2} 10 0 0 0 ${w} ${h - 10} L ${w} 10 A ${w / 2} 10 0 0 0 0 10`}
                      fill={tint}
                      stroke={color}
                      strokeWidth="1.5"
                    />
                    <ellipse cx={w / 2} cy="10" rx={w / 2} ry="10" fill={tint} stroke={color} strokeWidth="1.5" />
                  </g>
                ) : (
                  <rect width={w} height={h} rx={6} fill={tint} stroke={color} strokeWidth="1.5" />
                )}

                {iconSvg && entity.shape !== "diamond" && (
                  <g transform={`translate(10, ${h / 2 - 9})`}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2">
                      <path d={iconSvg} />
                    </svg>
                  </g>
                )}

                <text
                  x={iconSvg && entity.shape !== "diamond" ? 34 : w / 2}
                  y={h / 2 + 4}
                  textAnchor={iconSvg && entity.shape !== "diamond" ? "start" : "middle"}
                  fill="#18181b"
                  fontSize="12"
                  fontWeight="500"
                >
                  {mainText.split("\n")[0]}
                </text>
              </g>
            );
          })}
        </svg>

        {/* Hover overlay hint */}
        <div className="absolute inset-0 bg-blue-600/0 group-hover:bg-blue-600/5 transition-colors flex items-center justify-center pointer-events-none">
          <span className="opacity-0 group-hover:opacity-100 transition-opacity px-3 py-1.5 bg-neutral-900/80 text-white rounded-lg text-xs font-medium backdrop-blur-sm shadow-md">
            Click to open in interactive canvas
          </span>
        </div>
      </div>

      {/* Standalone Fullscreen Modal */}
      {isFullScreen && (
        <div className="fixed inset-0 z-50 bg-background">
          <EraserCanvas
            initialDocument={doc}
            onClose={() => setIsFullScreen(false)}
            isStandalone={true}
          />
        </div>
      )}
    </div>
  );
}
