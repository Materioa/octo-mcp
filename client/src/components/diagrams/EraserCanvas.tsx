import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  X,
  Minus,
  Plus,
  RotateCcw,
  Maximize2,
  Minimize2,
  Download,
  Copy,
  Check,
  ChevronDown,
} from "lucide-react";
import type {
  EraserDocument,
  EraserEntity,
  EraserConnection,
} from "@/lib/eraser/types";
import {
  resolveColor,
  resolveTint,
  resolveLayerBg,
} from "@/lib/eraser/palette";
import { getIconSvgPath } from "@/lib/eraser/icons";
import { cn } from "@/lib/utils";

export interface EraserCanvasProps {
  initialDocument?: EraserDocument;
  onSave?: (doc: EraserDocument) => void;
  onClose?: () => void;
  isStandalone?: boolean;
  isEmbedded?: boolean;
}

export function EraserCanvas({
  initialDocument,
  onClose,
  isStandalone = false,
  isEmbedded = false,
}: EraserCanvasProps) {
  const doc: EraserDocument = useMemo(() => {
    if (initialDocument && initialDocument.entities) {
      return initialDocument;
    }
    return {
      title: "System Architecture",
      entities: [],
      connections: [],
    };
  }, [initialDocument]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Compute bounding box for diagram
  const bounds = useMemo(() => {
    if (!doc.entities || doc.entities.length === 0) {
      return { minX: 0, minY: 0, maxX: 800, maxY: 500, width: 800, height: 500 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    doc.entities.forEach((e) => {
      const ex = e.x || 0;
      const ey = e.y || 0;
      const ew = e.width || 140;
      const eh = e.height || 64;
      if (ex < minX) minX = ex;
      if (ey < minY) minY = ey;
      if (ex + ew > maxX) maxX = ex + ew;
      if (ey + eh > maxY) maxY = ey + eh;
    });

    if (minX === Infinity) {
      return { minX: 0, minY: 0, maxX: 800, maxY: 500, width: 800, height: 500 };
    }

    const padding = 60;
    return {
      minX: Math.max(0, minX - padding),
      minY: Math.max(0, minY - padding),
      maxX: maxX + padding,
      maxY: maxY + padding,
      width: Math.max(700, maxX - minX + padding * 2),
      height: Math.max(450, maxY - minY + padding * 2),
    };
  }, [doc.entities]);

  // Viewport pan & zoom
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [copied, setCopied] = useState(false);
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);

  // Auto-fit on initial render or resize
  const resetView = useCallback(() => {
    if (!containerRef.current) return;
    const cw = containerRef.current.clientWidth || 800;
    const ch = containerRef.current.clientHeight || 500;
    const scaleX = (cw - 40) / bounds.width;
    const scaleY = (ch - 40) / bounds.height;
    const fitScale = Math.min(Math.max(Math.min(scaleX, scaleY), 0.4), 1.2);
    setZoom(fitScale);
    setPan({
      x: (cw - bounds.width * fitScale) / 2 - bounds.minX * fitScale,
      y: (ch - bounds.height * fitScale) / 2 - bounds.minY * fitScale,
    });
  }, [bounds]);

  useEffect(() => {
    resetView();
  }, [resetView]);

  // Mouse wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom((z) => Math.min(Math.max(z * factor, 0.3), 3));
  };

  // Pan dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsPanning(true);
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return;
    setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
  };

  const handleMouseUp = () => {
    setIsPanning(false);
  };

  // Separate container groups and regular nodes
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

  // Connection routing (orthogonal elbow)
  const getConnectionPath = (conn: EraserConnection) => {
    const fromEnt = doc.entities.find((e) => e.id === conn.from);
    const toEnt = doc.entities.find((e) => e.id === conn.to);
    if (!fromEnt || !toEnt) return "";

    const fromW = fromEnt.width || 140;
    const fromH = fromEnt.height || 64;
    const toW = toEnt.width || 140;
    const toH = toEnt.height || 64;

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

    if (conn.cornerStyle === "straight") {
      return `M ${start.x} ${start.y} L ${end.x} ${end.y}`;
    }

    const midX = Math.round((start.x + end.x) / 2);
    return `M ${start.x} ${start.y} L ${midX} ${start.y} L ${midX} ${end.y} L ${end.x} ${end.y}`;
  };

  const getConnectionMidpoint = (conn: EraserConnection) => {
    const fromEnt = doc.entities.find((e) => e.id === conn.from);
    const toEnt = doc.entities.find((e) => e.id === conn.to);
    if (!fromEnt || !toEnt) return { x: 0, y: 0 };
    const fromW = fromEnt.width || 140;
    const fromH = fromEnt.height || 64;
    const toW = toEnt.width || 140;
    const toH = toEnt.height || 64;
    return {
      x: (fromEnt.x + fromW / 2 + toEnt.x + toW / 2) / 2,
      y: (fromEnt.y + fromH / 2 + toEnt.y + toH / 2) / 2,
    };
  };

  // Export handlers
  const exportAsPng = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const URL = window.URL || window.webkitURL || window;
    const blobURL = URL.createObjectURL(svgBlob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = 2;
      canvas.width = (bounds.width || 1000) * scale;
      canvas.height = (bounds.height || 700) * scale;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(scale, scale);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const pngUrl = canvas.toDataURL("image/png");
        const link = document.createElement("a");
        link.download = (doc.title?.replace(/[^a-z0-9]/gi, "_") || "architecture_diagram") + ".png";
        link.href = pngUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      URL.revokeObjectURL(blobURL);
    };
    img.src = blobURL;
  };

  const exportAsSvg = () => {
    const svg = svgRef.current;
    if (!svg) return;
    const svgData = new XMLSerializer().serializeToString(svg);
    const blob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = (doc.title?.replace(/[^a-z0-9]/gi, "_") || "architecture_diagram") + ".svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={cn(
        "flex flex-col bg-card border border-border/70 overflow-hidden select-none",
        isEmbedded ? "rounded-xl" : "fixed inset-0 z-50 rounded-none bg-background"
      )}
    >
      {/* ── Sleek Minimal Header ── */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-muted/40 border-b border-border/60 text-xs">
        {/* Left: Diagram Title & Counts */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          <span className="font-semibold text-foreground truncate max-w-[280px]">
            {doc.title || "Architecture Diagram"}
          </span>
          <span className="hidden sm:inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-muted text-muted-foreground border border-border/50">
            {regularEntities.length} nodes • {doc.connections?.length || 0} links
          </span>
        </div>

        {/* Right: Zoom & Export Controls */}
        <div className="flex items-center gap-1.5 ml-auto">
          {/* Zoom controls */}
          <div className="flex items-center rounded-md border border-border/60 bg-background/50 overflow-hidden">
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.15, 0.3))}
              className="p-1 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Zoom Out"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 text-[11px] font-mono text-muted-foreground min-w-[42px] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.15, 2.5))}
              className="p-1 hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Zoom In"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={resetView}
              className="p-1 hover:bg-accent text-muted-foreground hover:text-foreground border-l border-border/60 transition-colors"
              title="Fit to View"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
          </div>

          {/* Copy JSON */}
          <button
            onClick={copyJson}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Copy Diagram JSON"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>

          {/* Export Menu */}
          <div className="relative group">
            <button
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-muted/60 hover:bg-accent border border-border/60 text-[11px] font-medium text-foreground transition-colors"
              title="Export Diagram"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col w-32 bg-popover border border-border rounded-lg shadow-xl py-1 z-50 text-[11px]">
              <button
                onClick={exportAsPng}
                className="px-3 py-1.5 text-left hover:bg-accent text-popover-foreground transition-colors"
              >
                PNG Image
              </button>
              <button
                onClick={exportAsSvg}
                className="px-3 py-1.5 text-left hover:bg-accent text-popover-foreground transition-colors"
              >
                SVG Vector
              </button>
            </div>
          </div>

          {/* Close if full modal */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors ml-1"
              title="Close Fullscreen"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── Interactive SVG Canvas ── */}
      <div
        ref={containerRef}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        className={cn(
          "relative flex-1 w-full overflow-hidden bg-neutral-50/50 dark:bg-neutral-950/50",
          isPanning ? "cursor-grabbing" : "cursor-grab",
          isEmbedded ? "min-h-[380px] max-h-[560px]" : "h-full"
        )}
      >
        <svg
          ref={svgRef}
          className="w-full h-full block"
          style={{
            touchAction: "none",
          }}
        >
          <defs>
            {/* Dot Grid Pattern */}
            <pattern id="dot-grid" width="24" height="24" patternUnits="userSpaceOnUse">
              <circle cx="2" cy="2" r="1" className="fill-neutral-300/80 dark:fill-neutral-800/80" />
            </pattern>

            {/* Subtle Drop Shadow */}
            <filter id="node-shadow" x="-8%" y="-8%" width="120%" height="120%">
              <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.06" />
            </filter>

            {/* Colored Arrow Markers */}
            {["blue", "purple", "green", "red", "yellow", "orange", "black", "white"].map((col) => {
              const strokeColor = resolveColor(col, "#2563eb");
              return (
                <marker
                  key={col}
                  id={`arrow-${col}`}
                  markerWidth="8"
                  markerHeight="8"
                  refX="7"
                  refY="4"
                  orient="auto"
                >
                  <path d="M 0 1 L 7 4 L 0 7 z" fill={strokeColor} />
                </marker>
              );
            })}
          </defs>

          {/* Background Grid */}
          <rect width="100%" height="100%" fill="url(#dot-grid)" />

          {/* Transformable Canvas Surface */}
          <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
            {/* 1. Group Containers (Rendered at back) */}
            {containers.map((group) => {
              const strokeColor = resolveColor(group.color, "#3b82f6");
              const bgColor = resolveLayerBg(group.color);
              const title = typeof group.title === "object" ? group.title.text : group.title || "Layer";
              const gw = group.width || 420;
              const gh = group.height || 300;

              return (
                <g key={group.id}>
                  <rect
                    x={group.x}
                    y={group.y}
                    width={gw}
                    height={gh}
                    rx={12}
                    fill={bgColor}
                    stroke={strokeColor}
                    strokeWidth="1.2"
                    strokeDasharray="4 4"
                    strokeOpacity="0.45"
                  />
                  {/* Subtle Layer Label Badge */}
                  <g transform={`translate(${group.x + 12}, ${group.y + 10})`}>
                    <rect
                      x="0"
                      y="0"
                      width={Math.max(60, title.length * 7.5 + 16)}
                      height="20"
                      rx="4"
                      fill={strokeColor}
                      fillOpacity="0.1"
                    />
                    <text
                      x="8"
                      y="14"
                      fill={strokeColor}
                      fontSize="10"
                      fontWeight="600"
                      letterSpacing="0.04em"
                      className="font-mono uppercase"
                    >
                      {title}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* 2. Connections */}
            {doc.connections?.map((conn, idx) => {
              const pathData = getConnectionPath(conn);
              const strokeColor = resolveColor(conn.color, "#2563eb");
              const mid = getConnectionMidpoint(conn);
              const markerId = `url(#arrow-${conn.color || "blue"})`;

              return (
                <g key={conn.id || idx}>
                  <path
                    d={pathData}
                    fill="none"
                    stroke={strokeColor}
                    strokeWidth="1.8"
                    strokeDasharray={conn.lineStyle === "dashed" ? "5 4" : "none"}
                    strokeOpacity="0.85"
                    markerEnd={markerId}
                  />
                  {conn.label && (
                    <g transform={`translate(${mid.x}, ${mid.y})`}>
                      <rect
                        x={-((conn.label.length * 6.5 + 14) / 2)}
                        y="-10"
                        width={conn.label.length * 6.5 + 14}
                        height="20"
                        rx="6"
                        className="fill-background stroke-border/80"
                        strokeWidth="1"
                      />
                      <text
                        x="0"
                        y="4"
                        textAnchor="middle"
                        fill={strokeColor}
                        fontSize="10"
                        fontWeight="600"
                        className="font-mono"
                      >
                        {conn.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}

            {/* 3. Regular Service Nodes */}
            {regularEntities.map((entity) => {
              const w = entity.width || 140;
              const h = entity.height || 64;
              const strokeColor = resolveColor(entity.color, "#2563eb");
              const tint = resolveTint(entity.color, "#ffffff");
              const iconSvg = getIconSvgPath(entity.icon);
              const rawTitle = typeof entity.title === "object" ? (entity.title as any)?.text : entity.title;
              const mainText = entity.texts?.[0]?.text || rawTitle || "Service";
              const subText = entity.texts?.[1]?.text || "";
              const isHovered = hoveredNodeId === entity.id;

              return (
                <g
                  key={entity.id}
                  transform={`translate(${entity.x}, ${entity.y})`}
                  onMouseEnter={() => setHoveredNodeId(entity.id)}
                  onMouseLeave={() => setHoveredNodeId(null)}
                  filter="url(#node-shadow)"
                  className="transition-transform duration-150 cursor-pointer"
                >
                  {/* Card shape */}
                  {entity.shape === "diamond" ? (
                    <polygon
                      points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`}
                      fill={tint}
                      stroke={strokeColor}
                      strokeWidth={isHovered ? "2" : "1.4"}
                    />
                  ) : entity.shape === "cylinder" ? (
                    <g>
                      <path
                        d={`M 0 10 L 0 ${h - 10} A ${w / 2} 10 0 0 0 ${w} ${h - 10} L ${w} 10 A ${w / 2} 10 0 0 0 0 10`}
                        fill={tint}
                        stroke={strokeColor}
                        strokeWidth={isHovered ? "2" : "1.4"}
                      />
                      <ellipse
                        cx={w / 2}
                        cy="10"
                        rx={w / 2}
                        ry="10"
                        fill={tint}
                        stroke={strokeColor}
                        strokeWidth={isHovered ? "2" : "1.4"}
                      />
                    </g>
                  ) : (
                    <rect
                      width={w}
                      height={h}
                      rx={8}
                      fill={tint}
                      stroke={strokeColor}
                      strokeWidth={isHovered ? "2" : "1.4"}
                    />
                  )}

                  {/* Icon badge */}
                  {iconSvg && entity.shape !== "diamond" && (
                    <g transform={`translate(10, ${h / 2 - 13})`}>
                      <rect
                        width="26"
                        height="26"
                        rx="6"
                        fill={strokeColor}
                        fillOpacity="0.12"
                      />
                      <g transform="translate(4, 4)">
                        <svg
                          width="18"
                          height="18"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke={strokeColor}
                          strokeWidth="2"
                        >
                          <path d={iconSvg} />
                        </svg>
                      </g>
                    </g>
                  )}

                  {/* Service Text Title & Subtitle */}
                  <text
                    x={iconSvg && entity.shape !== "diamond" ? 44 : w / 2}
                    y={subText ? h / 2 - 1 : h / 2 + 4}
                    textAnchor={iconSvg && entity.shape !== "diamond" ? "start" : "middle"}
                    className="fill-foreground font-semibold text-[11px]"
                  >
                    {mainText.split("\n")[0]}
                  </text>

                  {subText && (
                    <text
                      x={iconSvg && entity.shape !== "diamond" ? 44 : w / 2}
                      y={h / 2 + 13}
                      textAnchor={iconSvg && entity.shape !== "diamond" ? "start" : "middle"}
                      className="fill-muted-foreground font-mono text-[9px]"
                    >
                      {subText.split("\n")[0]}
                    </text>
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
