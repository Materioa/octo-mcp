import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  X,
  Sparkles,
  MousePointer2,
  Square,
  Search,
  Layers,
  Type,
  Minus,
  MoveRight,
  Plus,
  HelpCircle,
  Undo2,
  Redo2,
  Download,
  Copy,
  Check,
  Code2,
  Trash2,
  Maximize2,
  Minimize2,
  Palette,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Database,
  ArrowRight,
  Share2,
  ChevronDown,
  Loader2,
  CornerDownRight,
  Split,
  Maximize,
} from "lucide-react";
import type {
  EraserDocument,
  EraserEntity,
  EraserConnection,
  PaletteToken,
  AllowedShape,
  BorderStyle,
} from "@/lib/eraser/types";
import {
  STOCK_PALETTE,
  STOCK_TINTS,
  STOCK_LAYER_BG,
  resolveColor,
  resolveTint,
  resolveLayerBg,
} from "@/lib/eraser/palette";
import { ERASER_ICONS, getIconSvgPath } from "@/lib/eraser/icons";
import { FOUR_LAYER_ARCHITECTURE_EXAMPLE, BLANK_ARCHITECTURE_TEMPLATE } from "@/lib/eraser/defaults";
import { generateOrUpdateEraserDiagram } from "@/lib/eraser/ai-generator";
import { cn } from "@/lib/utils";

interface EraserCanvasProps {
  initialDocument?: EraserDocument;
  onSave?: (doc: EraserDocument) => void;
  onClose?: () => void;
  isStandalone?: boolean;
}

type ToolMode = "select" | "shape" | "icon" | "group" | "text" | "connector" | "arrow";

export function EraserCanvas({
  initialDocument,
  onSave,
  onClose,
  isStandalone = false,
}: EraserCanvasProps) {
  // ── Document State & History ──────────────────────────────────────────────
  const [doc, setDoc] = useState<EraserDocument>(() => {
    if (initialDocument && initialDocument.entities) {
      return JSON.parse(JSON.stringify(initialDocument));
    }
    return {
      title: "Untitled Diagram",
      entities: [],
      connections: [],
    };
  });

  const [history, setHistory] = useState<EraserDocument[]>([doc]);
  const [historyIdx, setHistoryIdx] = useState(0);

  const pushHistory = useCallback(
    (newDoc: EraserDocument) => {
      setHistory((prev) => {
        const next = prev.slice(0, historyIdx + 1);
        return [...next, JSON.parse(JSON.stringify(newDoc))];
      });
      setHistoryIdx((prev) => prev + 1);
      setDoc(newDoc);
      onSave?.(newDoc);
    },
    [historyIdx, onSave]
  );

  const handleUndo = useCallback(() => {
    if (historyIdx > 0) {
      const prevDoc = history[historyIdx - 1];
      if (prevDoc) {
        setHistoryIdx(historyIdx - 1);
        setDoc(JSON.parse(JSON.stringify(prevDoc)));
        onSave?.(prevDoc);
      }
    }
  }, [history, historyIdx, onSave]);

  const handleRedo = useCallback(() => {
    if (historyIdx < history.length - 1) {
      const nextDoc = history[historyIdx + 1];
      if (nextDoc) {
        setHistoryIdx(historyIdx + 1);
        setDoc(JSON.parse(JSON.stringify(nextDoc)));
        onSave?.(nextDoc);
      }
    }
  }, [history, historyIdx, onSave]);

  // ── Canvas Interaction State ──────────────────────────────────────────────
  const [tool, setTool] = useState<ToolMode>("select");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedConnectionId, setSelectedConnectionId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(0.85);
  const [pan, setPan] = useState({ x: 40, y: 30 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });
  const [draggingEntityId, setDraggingEntityId] = useState<string | null>(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [connectingFromId, setConnectingFromId] = useState<string | null>(null);
  const [connectionPreview, setConnectionPreview] = useState<{ x: number; y: number } | null>(null);
  const [resizing, setResizing] = useState<{
    entityId: string;
    handle: string;
    startX: number;
    startY: number;
    initialWidth: number;
    initialHeight: number;
    initialX: number;
    initialY: number;
  } | null>(null);

  // Modals & Panels
  const [isAiModalOpen, setIsAiModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isAiGenerating, setIsAiGenerating] = useState(false);
  const [isCodeModalOpen, setIsCodeModalOpen] = useState(false);
  const [codeDraft, setCodeDraft] = useState("");
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isIconPickerOpen, setIsIconPickerOpen] = useState(false);
  const [iconSearch, setIconSearch] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(doc.title || "Untitled Diagram");
  const [copied, setCopied] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  // Selected item accessor
  const selectedEntity = useMemo(() => {
    return doc.entities.find((e) => e.id === selectedEntityId) || null;
  }, [doc.entities, selectedEntityId]);

  const selectedConnection = useMemo(() => {
    return doc.connections.find((c) => c.id === selectedConnectionId) || null;
  }, [doc.connections, selectedConnectionId]);

  // ── Keyboard Shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // If typing in an input or textarea, don't intercept standard hotkeys
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement).tagName)) {
        if (e.key === "Escape") {
          (e.target as HTMLElement).blur();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "j") {
        e.preventDefault();
        setIsAiModalOpen((prev) => !prev);
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
        return;
      }

      if (e.key === "Escape") {
        setSelectedEntityId(null);
        setSelectedConnectionId(null);
        setConnectingFromId(null);
        setTool("select");
        setIsAiModalOpen(false);
        setIsCodeModalOpen(false);
        setIsHelpOpen(false);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedEntityId) {
          e.preventDefault();
          deleteSelectedEntity();
        } else if (selectedConnectionId) {
          e.preventDefault();
          deleteSelectedConnection();
        }
        return;
      }

      // Single-key shortcuts
      switch (e.key.toLowerCase()) {
        case "v":
          setTool("select");
          break;
        case "r":
          setTool("shape");
          break;
        case "i":
          setTool("icon");
          setIsIconPickerOpen(true);
          break;
        case "t":
          setTool("text");
          break;
        case "a":
          setTool("arrow");
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEntityId, selectedConnectionId, handleUndo, handleRedo]);

  // ── Mouse Pan & Canvas Navigation ─────────────────────────────────────────
  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
      setZoom((prev) => Math.min(Math.max(prev * zoomFactor, 0.2), 3.0));
    } else {
      // Pan with wheel
      setPan((prev) => ({
        x: prev.x - e.deltaX,
        y: prev.y - e.deltaY,
      }));
    }
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button === 1 || e.buttons === 4 || tool === "select") {
      // Clicked on canvas background
      if ((e.target as HTMLElement).tagName === "svg" || (e.target as HTMLElement).id === "eraser-grid-bg") {
        setSelectedEntityId(null);
        setSelectedConnectionId(null);
        setConnectingFromId(null);

        setIsPanning(true);
        setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
      }
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (tool === "shape") {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.round((e.clientX - rect.left - pan.x) / zoom);
      const y = Math.round((e.clientY - rect.top - pan.y) / zoom);

      const newId = "node_" + Math.random().toString(36).substring(2, 7);
      const newEntity: EraserEntity = {
        id: newId,
        tag: "Shape",
        shape: "rectangle",
        x: Math.max(0, x - 65),
        y: Math.max(0, y - 30),
        width: 130,
        height: 60,
        color: "blue",
        texts: [{ text: "New Shape", fontSize: 13, hAlign: "center" }],
      };

      pushHistory({
        ...doc,
        entities: [...doc.entities, newEntity],
      });
      setSelectedEntityId(newId);
      setTool("select");
    } else if (tool === "group") {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.round((e.clientX - rect.left - pan.x) / zoom);
      const y = Math.round((e.clientY - rect.top - pan.y) / zoom);

      const newId = "layer_" + Math.random().toString(36).substring(2, 7);
      const newGroup: EraserEntity = {
        id: newId,
        tag: "Group",
        x: Math.max(0, x - 200),
        y: Math.max(0, y - 150),
        width: 420,
        height: 320,
        color: "blue",
        title: { text: "New Layer Group", width: "full", color: "#2866c4" },
        borderStyle: "solid",
        borderWidth: 1.5,
        isContainer: true,
      };

      pushHistory({
        ...doc,
        entities: [...doc.entities, newGroup],
      });
      setSelectedEntityId(newId);
      setTool("select");
    } else if (tool === "text") {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.round((e.clientX - rect.left - pan.x) / zoom);
      const y = Math.round((e.clientY - rect.top - pan.y) / zoom);

      const newId = "text_" + Math.random().toString(36).substring(2, 7);
      const newText: EraserEntity = {
        id: newId,
        tag: "Textbox",
        x: Math.max(0, x - 60),
        y: Math.max(0, y - 20),
        width: 140,
        height: 40,
        color: "black",
        texts: [{ text: "Text Note", fontSize: 14, hAlign: "left" }],
      };

      pushHistory({
        ...doc,
        entities: [...doc.entities, newText],
      });
      setSelectedEntityId(newId);
      setTool("select");
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isPanning) {
      setPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
      return;
    }

    if (resizing) {
      const deltaX = (e.clientX - resizing.startX) / zoom;
      const deltaY = (e.clientY - resizing.startY) / zoom;
      let newW = resizing.initialWidth;
      let newH = resizing.initialHeight;
      let newX = resizing.initialX;
      let newY = resizing.initialY;

      if (resizing.handle.includes("e")) newW = Math.max(50, resizing.initialWidth + deltaX);
      if (resizing.handle.includes("s")) newH = Math.max(40, resizing.initialHeight + deltaY);
      if (resizing.handle.includes("w")) {
        const potentialW = resizing.initialWidth - deltaX;
        if (potentialW > 50) {
          newW = potentialW;
          newX = resizing.initialX + deltaX;
        }
      }
      if (resizing.handle.includes("n")) {
        const potentialH = resizing.initialHeight - deltaY;
        if (potentialH > 40) {
          newH = potentialH;
          newY = resizing.initialY + deltaY;
        }
      }

      setDoc((prev) => ({
        ...prev,
        entities: prev.entities.map((ent) =>
          ent.id === resizing.entityId
            ? { ...ent, x: Math.round(newX), y: Math.round(newY), width: Math.round(newW), height: Math.round(newH) }
            : ent
        ),
      }));
      return;
    }

    if (draggingEntityId) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const currentX = (e.clientX - rect.left - pan.x) / zoom;
      const currentY = (e.clientY - rect.top - pan.y) / zoom;

      const targetX = Math.max(0, Math.round(currentX - dragOffset.x));
      const targetY = Math.max(0, Math.round(currentY - dragOffset.y));

      const entity = doc.entities.find((ent) => ent.id === draggingEntityId);
      if (!entity) return;

      const dx = targetX - entity.x;
      const dy = targetY - entity.y;

      setDoc((prev) => {
        // If moving a group, also move its contained children
        if (entity.tag === "Group" || entity.isContainer) {
          return {
            ...prev,
            entities: prev.entities.map((ent) => {
              if (ent.id === draggingEntityId) {
                return { ...ent, x: targetX, y: targetY };
              }
              if (ent.containerId === draggingEntityId) {
                return { ...ent, x: ent.x + dx, y: ent.y + dy };
              }
              return ent;
            }),
          };
        }

        return {
          ...prev,
          entities: prev.entities.map((ent) =>
            ent.id === draggingEntityId ? { ...ent, x: targetX, y: targetY } : ent
          ),
        };
      });
      return;
    }

    if (connectingFromId) {
      const rect = containerRef.current?.getBoundingClientRect();
      if (rect) {
        setConnectionPreview({
          x: (e.clientX - rect.left - pan.x) / zoom,
          y: (e.clientY - rect.top - pan.y) / zoom,
        });
      }
    }
  };

  const handleMouseUp = () => {
    if (isPanning) {
      setIsPanning(false);
    }
    if (resizing) {
      setResizing(null);
      pushHistory(doc);
    }
    if (draggingEntityId) {
      setDraggingEntityId(null);
      pushHistory(doc);
    }
    if (connectingFromId) {
      setConnectingFromId(null);
      setConnectionPreview(null);
    }
  };

  // ── Entity Dragging ───────────────────────────────────────────────────────
  const startDragEntity = (e: React.MouseEvent, id: string) => {
    if (tool === "arrow" || tool === "connector") {
      setConnectingFromId(id);
      return;
    }

    e.stopPropagation();
    setSelectedEntityId(id);
    setSelectedConnectionId(null);
    setDraggingEntityId(id);

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const clickCanvasX = (e.clientX - rect.left - pan.x) / zoom;
    const clickCanvasY = (e.clientY - rect.top - pan.y) / zoom;

    const ent = doc.entities.find((x) => x.id === id);
    if (ent) {
      setDragOffset({
        x: clickCanvasX - ent.x,
        y: clickCanvasY - ent.y,
      });
    }
  };

  // ── Quick Connect (+) Action ──────────────────────────────────────────────
  const handleQuickConnect = (e: React.MouseEvent, fromId: string) => {
    e.stopPropagation();
    setConnectingFromId(fromId);
    setTool("arrow");
  };

  const handleTargetNodeClick = (e: React.MouseEvent, toId: string) => {
    if (connectingFromId && connectingFromId !== toId) {
      e.stopPropagation();
      const newConn: EraserConnection = {
        id: "conn_" + Math.random().toString(36).substring(2, 7),
        from: connectingFromId,
        to: toId,
        endArrowhead: "triangle",
        color: selectedEntity?.color || "blue",
      };

      pushHistory({
        ...doc,
        connections: [...doc.connections, newConn],
      });
      setConnectingFromId(null);
      setConnectionPreview(null);
      setTool("select");
      setSelectedConnectionId(newConn.id || null);
    }
  };

  // ── Entity Mutations ──────────────────────────────────────────────────────
  const updateSelectedEntity = (updates: Partial<EraserEntity>) => {
    if (!selectedEntityId) return;
    const updatedDoc = {
      ...doc,
      entities: doc.entities.map((e) =>
        e.id === selectedEntityId ? { ...e, ...updates } : e
      ),
    };
    pushHistory(updatedDoc);
  };

  const updateSelectedConnection = (updates: Partial<EraserConnection>) => {
    if (!selectedConnectionId) return;
    const updatedDoc = {
      ...doc,
      connections: doc.connections.map((c) =>
        c.id === selectedConnectionId ? { ...c, ...updates } : c
      ),
    };
    pushHistory(updatedDoc);
  };

  const deleteSelectedEntity = () => {
    if (!selectedEntityId) return;
    const updatedDoc = {
      ...doc,
      entities: doc.entities.filter((e) => e.id !== selectedEntityId),
      connections: doc.connections.filter(
        (c) => c.from !== selectedEntityId && c.to !== selectedEntityId
      ),
    };
    setSelectedEntityId(null);
    pushHistory(updatedDoc);
  };

  const deleteSelectedConnection = () => {
    if (!selectedConnectionId) return;
    const updatedDoc = {
      ...doc,
      connections: doc.connections.filter((c) => c.id !== selectedConnectionId),
    };
    setSelectedConnectionId(null);
    pushHistory(updatedDoc);
  };

  const duplicateSelected = () => {
    if (selectedEntity) {
      const newId = "node_" + Math.random().toString(36).substring(2, 7);
      const cloned: EraserEntity = {
        ...JSON.parse(JSON.stringify(selectedEntity)),
        id: newId,
        x: selectedEntity.x + 30,
        y: selectedEntity.y + 30,
      };
      pushHistory({
        ...doc,
        entities: [...doc.entities, cloned],
      });
      setSelectedEntityId(newId);
    }
  };

  // ── AI Prompt Generation ──────────────────────────────────────────────────
  const handleAiGenerate = async () => {
    if (!aiPrompt.trim()) return;
    setIsAiGenerating(true);
    try {
      const updatedDoc = await generateOrUpdateEraserDiagram(aiPrompt, doc);
      pushHistory(updatedDoc);
      setIsAiModalOpen(false);
      setAiPrompt("");
    } catch (err: any) {
      alert("AI Generation failed: " + (err?.message || "Please check your AI API key in Settings"));
    } finally {
      setIsAiGenerating(false);
    }
  };

  // ── Code Export & Import ──────────────────────────────────────────────────
  const openCodeModal = () => {
    setCodeDraft(JSON.stringify(doc, null, 2));
    setIsCodeModalOpen(true);
  };

  const applyCodeDraft = () => {
    try {
      const parsed = JSON.parse(codeDraft);
      if (parsed.entities && parsed.connections) {
        pushHistory(parsed);
        setIsCodeModalOpen(false);
      } else {
        alert("Invalid Eraser JSON format: must contain 'entities' and 'connections' arrays.");
      }
    } catch (e: any) {
      alert("Invalid JSON: " + e.message);
    }
  };

  const exportAsPng = () => {
    const svg = svgRef.current;
    if (!svg) return;

    // Serialize SVG
    const svgData = new XMLSerializer().serializeToString(svg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const URL = window.URL || window.webkitURL || window;
    const blobURL = URL.createObjectURL(svgBlob);

    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      // High resolution scale
      const scale = 2;
      canvas.width = (svg.clientWidth || 1200) * scale;
      canvas.height = (svg.clientHeight || 900) * scale;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.scale(scale, scale);
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0);
        const pngUrl = canvas.toDataURL("image/png");

        const downloadLink = document.createElement("a");
        downloadLink.download = (doc.title?.replace(/[^a-z0-9]/gi, "_") || "diagram") + ".png";
        downloadLink.href = pngUrl;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
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
    a.download = (doc.title?.replace(/[^a-z0-9]/gi, "_") || "diagram") + ".svg";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const copyJsonToClipboard = () => {
    navigator.clipboard.writeText(JSON.stringify(doc, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // ── Calculate Connection Path (Elbow or Curved) ───────────────────────────
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

    // Anchor points on edges
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

    // Default: Orthogonal Elbow Routing
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

  // Group and layer partitioning: containers render behind child shapes
  const { containers, regularEntities } = useMemo(() => {
    const containers: EraserEntity[] = [];
    const regularEntities: EraserEntity[] = [];

    doc.entities.forEach((ent) => {
      if (ent.tag === "Group" || ent.isContainer) {
        containers.push(ent);
      } else {
        regularEntities.push(ent);
      }
    });

    return { containers, regularEntities };
  }, [doc.entities]);

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative w-full h-full select-none overflow-hidden bg-white dark:bg-[#18181b] text-neutral-900 dark:text-neutral-100 font-sans",
        isStandalone ? "fixed inset-0 z-50" : "min-h-[700px] rounded-xl border border-border shadow-xl"
      )}
      onWheel={handleWheel}
      onMouseDown={handleCanvasMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onClick={handleCanvasClick}
    >
      {/* ── TOP HEADER / WORKSPACE BAR ────────────────────────────────────── */}
      <header className="absolute top-0 left-0 right-0 h-12 bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border-b border-border/70 z-30 flex items-center justify-between px-4">
        <div className="flex items-center gap-3">
          {/* Document Title Tab */}
          <div className="flex items-center gap-2 px-3 py-1.5 bg-neutral-100 dark:bg-neutral-800 rounded-md border border-border text-sm font-medium text-foreground">
            <Layers className="w-4 h-4 text-blue-500" />
            {isEditingTitle ? (
              <input
                type="text"
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  setIsEditingTitle(false);
                  pushHistory({ ...doc, title: titleDraft });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setIsEditingTitle(false);
                    pushHistory({ ...doc, title: titleDraft });
                  }
                }}
                autoFocus
                className="bg-transparent text-sm font-semibold outline-none border-b border-blue-500 w-64"
              />
            ) : (
              <span
                onClick={() => setIsEditingTitle(true)}
                className="cursor-pointer hover:underline truncate max-w-[280px]"
                title="Click to rename"
              >
                {doc.title || "Untitled Diagram"}
              </span>
            )}
          </div>

          {/* AI Chat Tab / Quick AI Prompt Toggle */}
          <button
            onClick={() => setIsAiModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-sm transition-all"
            title="Prompt AI to generate or edit diagram (Ctrl+J)"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>AI Chat</span>
          </button>
        </div>

        {/* Center/Right Controls */}
        <div className="flex items-center gap-2">
          {/* Undo / Redo */}
          <div className="flex items-center gap-1 border-r border-border pr-2 mr-2">
            <button
              onClick={handleUndo}
              disabled={historyIdx === 0}
              className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-muted-foreground disabled:opacity-30"
              title="Undo (Ctrl+Z)"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              onClick={handleRedo}
              disabled={historyIdx >= history.length - 1}
              className="p-1.5 rounded hover:bg-neutral-100 dark:hover:bg-neutral-800 text-muted-foreground disabled:opacity-30"
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          {/* Zoom Selector (e.g. 50% dropdown like the user image) */}
          <div className="relative flex items-center">
            <button
              onClick={() => setZoom((z) => Math.max(z - 0.15, 0.25))}
              className="px-1.5 py-1 text-xs text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-l"
              title="Zoom Out"
            >
              <Minus className="w-3 h-3" />
            </button>
            <div className="px-2 py-1 text-xs font-semibold bg-neutral-100 dark:bg-neutral-800 text-foreground min-w-[54px] text-center border-x border-border">
              {Math.round(zoom * 100)}%
            </div>
            <button
              onClick={() => setZoom((z) => Math.min(z + 0.15, 2.5))}
              className="px-1.5 py-1 text-xs text-muted-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-r"
              title="Zoom In"
            >
              <Plus className="w-3 h-3" />
            </button>
            <button
              onClick={() => setZoom(1.0)}
              className="ml-1 text-[11px] px-1.5 py-1 text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded"
              title="Reset Zoom"
            >
              100%
            </button>
          </div>

          {/* Export & Code Buttons */}
          <button
            onClick={openCodeModal}
            className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md border border-border hover:bg-neutral-100 dark:hover:bg-neutral-800 text-foreground"
            title="View or edit Eraser diagram code"
          >
            <Code2 className="w-3.5 h-3.5" />
            <span>Code</span>
          </button>

          <div className="relative group">
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-neutral-100 dark:bg-neutral-800 border border-border hover:bg-neutral-200 dark:hover:bg-neutral-700 text-foreground"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export</span>
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            </button>
            <div className="absolute right-0 top-full mt-1 hidden group-hover:flex flex-col w-36 bg-card border border-border rounded-lg shadow-xl py-1 z-40 text-xs">
              <button
                onClick={exportAsPng}
                className="px-3 py-1.5 text-left hover:bg-accent text-foreground flex items-center gap-2"
              >
                <span>PNG Image</span>
              </button>
              <button
                onClick={exportAsSvg}
                className="px-3 py-1.5 text-left hover:bg-accent text-foreground flex items-center gap-2"
              >
                <span>SVG Vector</span>
              </button>
              <button
                onClick={copyJsonToClipboard}
                className="px-3 py-1.5 text-left hover:bg-accent text-foreground flex items-center gap-2"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "Copied!" : "Copy JSON"}</span>
              </button>
            </div>
          </div>

          {/* Close button if modal */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 text-muted-foreground hover:text-foreground ml-1"
              title="Close Canvas (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </header>

      {/* ── LEFT FLOATING VERTICAL TOOLBAR ────────────────────────────────── */}
      <aside className="absolute left-4 top-16 z-30 flex flex-col items-center bg-white dark:bg-neutral-900 border border-border/80 rounded-xl shadow-lg p-1.5 gap-1">
        {/* Close / Deselect */}
        <button
          onClick={() => {
            setSelectedEntityId(null);
            setSelectedConnectionId(null);
            setTool("select");
          }}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors"
          title="Deselect / Normal (Esc)"
        >
          <X className="w-4 h-4" />
          <span className="text-[9px] block text-center font-mono opacity-60">ESC</span>
        </button>

        {/* AI Generator / Editor */}
        <button
          onClick={() => setIsAiModalOpen(true)}
          className="p-2 rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors relative"
          title="AI Prompt / Edit (Ctrl+J)"
        >
          <Sparkles className="w-4 h-4" />
          <span className="text-[9px] block text-center font-mono opacity-70">^J</span>
        </button>

        <div className="w-full h-px bg-border/80 my-1" />

        {/* Select / Move Tool (V) */}
        <button
          onClick={() => setTool("select")}
          className={cn(
            "p-2 rounded-lg transition-colors",
            tool === "select"
              ? "bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800"
          )}
          title="Select & Move (V)"
        >
          <MousePointer2 className="w-4 h-4" />
          <span className="text-[9px] block text-center font-mono opacity-60">V</span>
        </button>

        {/* Shape Placement Tool (R) */}
        <button
          onClick={() => setTool("shape")}
          className={cn(
            "p-2 rounded-lg transition-colors",
            tool === "shape"
              ? "bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800"
          )}
          title="Add Shape / Block (R)"
        >
          <Square className="w-4 h-4" />
          <span className="text-[9px] block text-center font-mono opacity-60">R</span>
        </button>

        {/* Icon Placement Tool (I) */}
        <button
          onClick={() => {
            setTool("icon");
            setIsIconPickerOpen(true);
          }}
          className={cn(
            "p-2 rounded-lg transition-colors",
            tool === "icon"
              ? "bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800"
          )}
          title="Add Icon (I)"
        >
          <Search className="w-4 h-4" />
          <span className="text-[9px] block text-center font-mono opacity-60">I</span>
        </button>

        {/* Layer / Group Frame Tool */}
        <button
          onClick={() => setTool("group")}
          className={cn(
            "p-2 rounded-lg transition-colors",
            tool === "group"
              ? "bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800"
          )}
          title="Add Container / Layer Group Frame"
        >
          <Layers className="w-4 h-4" />
        </button>

        {/* Text Tool (T) */}
        <button
          onClick={() => setTool("text")}
          className={cn(
            "p-2 rounded-lg transition-colors",
            tool === "text"
              ? "bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800"
          )}
          title="Add Text Label (T)"
        >
          <Type className="w-4 h-4" />
          <span className="text-[9px] block text-center font-mono opacity-60">T</span>
        </button>

        {/* Line / Connector Tool */}
        <button
          onClick={() => setTool("connector")}
          className={cn(
            "p-2 rounded-lg transition-colors",
            tool === "connector"
              ? "bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800"
          )}
          title="Draw Line Connector"
        >
          <Minus className="w-4 h-4" />
        </button>

        {/* Arrow Tool (A) */}
        <button
          onClick={() => setTool("arrow")}
          className={cn(
            "p-2 rounded-lg transition-colors",
            tool === "arrow"
              ? "bg-blue-100 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 font-semibold"
              : "text-muted-foreground hover:text-foreground hover:bg-neutral-100 dark:hover:bg-neutral-800"
          )}
          title="Draw Arrow (A)"
        >
          <MoveRight className="w-4 h-4" />
          <span className="text-[9px] block text-center font-mono opacity-60">A</span>
        </button>
      </aside>

      {/* ── MAIN CANVAS SVG RENDERING SURFACE ─────────────────────────────── */}
      <svg
        ref={svgRef}
        id="eraser-grid-bg"
        className="w-full h-full cursor-grab active:cursor-grabbing"
        style={{ cursor: isPanning ? "grabbing" : tool !== "select" ? "crosshair" : "default" }}
      >
        <defs>
          {/* Subtle dot grid pattern */}
          <pattern id="grid-dots" width="24" height="24" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1" className="fill-neutral-300 dark:fill-neutral-800" />
          </pattern>

          {/* Arrowhead markers */}
          <marker
            id="eraser-arrow-blue"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="5"
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#2866c4" />
          </marker>
          <marker
            id="eraser-arrow-purple"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="5"
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#c43dcf" />
          </marker>
          <marker
            id="eraser-arrow-green"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="5"
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#30a050" />
          </marker>
          <marker
            id="eraser-arrow-red"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="5"
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#bd413a" />
          </marker>
          <marker
            id="eraser-arrow-orange"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="5"
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#c38424" />
          </marker>
          <marker
            id="eraser-arrow-black"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="5"
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="#242424" />
          </marker>
          <marker
            id="eraser-arrow-default"
            markerWidth="10"
            markerHeight="10"
            refX="9"
            refY="5"
            orient="auto"
          >
            <path d="M 0 1 L 9 5 L 0 9 z" fill="currentColor" />
          </marker>
        </defs>

        {/* Background Dots */}
        <rect width="100%" height="100%" fill="url(#grid-dots)" />

        {/* Scaled & Panned Scene Group */}
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* 1. RENDER CONTAINERS / LAYER GROUPS (Background) */}
          {containers.map((group) => {
            const isSelected = selectedEntityId === group.id;
            const strokeColor = resolveColor(group.color, "#2866c4");
            const bgColor = resolveLayerBg(group.color);
            const title = typeof group.title === "object" ? group.title.text : group.title || "Layer";
            const iconSvg = typeof group.title === "object" && group.title.icon ? getIconSvgPath(group.title.icon) : null;

            return (
              <g
                key={group.id}
                onMouseDown={(e) => startDragEntity(e, group.id)}
                className="cursor-pointer"
              >
                {/* Outer Group Boundary Box */}
                <rect
                  x={group.x}
                  y={group.y}
                  width={group.width || 400}
                  height={group.height || 300}
                  rx={8}
                  fill={bgColor}
                  stroke={strokeColor}
                  strokeWidth={isSelected ? 2.5 : group.borderWidth || 1.5}
                  strokeDasharray={group.borderStyle === "dashed" ? "6 5" : group.borderStyle === "dotted" ? "2 4" : "none"}
                  className="transition-all"
                />

                {/* Layer Title Bar */}
                <g transform={`translate(${group.x + 12}, ${group.y + 12})`}>
                  {iconSvg && (
                    <g
                      transform="translate(0, 0) scale(0.65)"
                      fill="none"
                      stroke={strokeColor}
                      strokeWidth="2"
                    >
                      <path d={iconSvg} />
                    </g>
                  )}
                  <text
                    x={iconSvg ? 20 : 0}
                    y={13}
                    fill={strokeColor}
                    fontSize="13"
                    fontWeight="600"
                    fontFamily="Inter, sans-serif"
                    className="select-none"
                  >
                    {title}
                  </text>
                </g>
              </g>
            );
          })}

          {/* 2. RENDER CONNECTIONS / ARROWS */}
          {doc.connections.map((conn, idx) => {
            const isSelected = selectedConnectionId === conn.id;
            const pathData = getConnectionPath(conn);
            const strokeColor = resolveColor(conn.color, "#2866c4");
            const markerId = `eraser-arrow-${conn.color || "blue"}`;
            const mid = getConnectionMidpoint(conn);

            return (
              <g
                key={conn.id || idx}
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedConnectionId(conn.id || null);
                  setSelectedEntityId(null);
                }}
                className="cursor-pointer group"
              >
                {/* Thick transparent path for easy clicking */}
                <path d={pathData} fill="none" stroke="transparent" strokeWidth="16" />

                {/* Actual visual stroke */}
                <path
                  d={pathData}
                  fill="none"
                  stroke={isSelected ? "#2563eb" : strokeColor}
                  strokeWidth={isSelected ? (conn.lineWidth || 2) + 1.5 : conn.lineWidth || 1.8}
                  strokeDasharray={conn.lineStyle === "dashed" ? "6 5" : conn.lineStyle === "dotted" ? "2 4" : "none"}
                  markerEnd={`url(#${markerId})`}
                  className="transition-all"
                />

                {/* Optional Connection Label Badge */}
                {conn.label && (
                  <g transform={`translate(${mid.x}, ${mid.y})`}>
                    <rect
                      x={-((conn.label.length * 7.5 + 16) / 2)}
                      y="-11"
                      width={conn.label.length * 7.5 + 16}
                      height="22"
                      rx="6"
                      fill="#ffffff"
                      stroke={strokeColor}
                      strokeWidth="1"
                      className="shadow-sm dark:fill-neutral-900"
                    />
                    <text
                      x="0"
                      y="4"
                      textAnchor="middle"
                      fill={strokeColor}
                      fontSize="11"
                      fontWeight="500"
                      fontFamily="Inter, sans-serif"
                      className="select-none pointer-events-none"
                    >
                      {conn.label}
                    </text>
                  </g>
                )}
              </g>
            );
          })}

          {/* Connection preview when dragging an arrow */}
          {connectingFromId && connectionPreview && (
            (() => {
              const fromEnt = doc.entities.find((e) => e.id === connectingFromId);
              if (!fromEnt) return null;
              const startX = fromEnt.x + (fromEnt.width || 120) / 2;
              const startY = fromEnt.y + (fromEnt.height || 60) / 2;
              return (
                <path
                  d={`M ${startX} ${startY} L ${connectionPreview.x} ${connectionPreview.y}`}
                  fill="none"
                  stroke="#2563eb"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                  markerEnd="url(#eraser-arrow-blue)"
                />
              );
            })()
          )}

          {/* 3. RENDER REGULAR ENTITIES & NODES */}
          {regularEntities.map((entity) => {
            const isSelected = selectedEntityId === entity.id;
            const w = entity.width || 130;
            const h = entity.height || 60;
            const color = resolveColor(entity.color, "#2866c4");
            const tint = resolveTint(entity.color, "#ffffff");
            const iconSvg = getIconSvgPath(entity.icon);
            const mainText = entity.texts?.[0]?.text || "";
            const subText = entity.texts?.[1]?.text || "";

            return (
              <g
                key={entity.id}
                transform={`translate(${entity.x}, ${entity.y})`}
                onMouseDown={(e) => startDragEntity(e, entity.id)}
                onClick={(e) => handleTargetNodeClick(e, entity.id)}
                className="cursor-pointer group"
              >
                {/* Node Shape Geometries */}
                {entity.shape === "diamond" ? (
                  // Decision Diamond
                  <polygon
                    points={`${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}`}
                    fill={tint}
                    stroke={color}
                    strokeWidth={isSelected ? 2.5 : entity.borderWidth || 1.6}
                    strokeDasharray={entity.borderStyle === "dashed" ? "5 4" : "none"}
                    className="filter drop-shadow-sm"
                  />
                ) : entity.shape === "cylinder" ? (
                  // Database Cylinder
                  <g className="filter drop-shadow-sm">
                    <path
                      d={`M 0 12 L 0 ${h - 12} A ${w / 2} 12 0 0 0 ${w} ${h - 12} L ${w} 12 A ${w / 2} 12 0 0 0 0 12`}
                      fill={tint}
                      stroke={color}
                      strokeWidth={isSelected ? 2.5 : entity.borderWidth || 1.6}
                    />
                    <ellipse
                      cx={w / 2}
                      cy="12"
                      rx={w / 2}
                      ry="12"
                      fill={tint}
                      stroke={color}
                      strokeWidth={isSelected ? 2.5 : entity.borderWidth || 1.6}
                    />
                  </g>
                ) : entity.shape === "circle" || entity.shape === "ellipse" ? (
                  // Circle / Ellipse
                  <ellipse
                    cx={w / 2}
                    cy={h / 2}
                    rx={w / 2}
                    ry={h / 2}
                    fill={tint}
                    stroke={color}
                    strokeWidth={isSelected ? 2.5 : entity.borderWidth || 1.6}
                    className="filter drop-shadow-sm"
                  />
                ) : (
                  // Default: Rounded Rectangle
                  <rect
                    width={w}
                    height={h}
                    rx={8}
                    fill={tint}
                    stroke={color}
                    strokeWidth={isSelected ? 2.5 : entity.borderWidth || 1.6}
                    strokeDasharray={entity.borderStyle === "dashed" ? "6 5" : entity.borderStyle === "dotted" ? "2 4" : "none"}
                    className="filter drop-shadow-sm"
                  />
                )}

                {/* Node Content (Icon + Text) */}
                <g className="pointer-events-none select-none">
                  {iconSvg ? (
                    <g transform={`translate(${entity.shape === "diamond" ? w / 2 - 10 : 12}, ${h / 2 - 10})`}>
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke={color}
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d={iconSvg} />
                      </svg>
                    </g>
                  ) : null}

                  {/* Multi-line or Single-line Labels */}
                  <text
                    x={iconSvg && entity.shape !== "diamond" ? 38 : w / 2}
                    y={subText ? h / 2 - 2 : h / 2 + 4}
                    textAnchor={iconSvg && entity.shape !== "diamond" ? "start" : "middle"}
                    fill="#18181b"
                    fontSize={entity.texts?.[0]?.fontSize || 12}
                    fontWeight="500"
                    fontFamily="Inter, sans-serif"
                    className="dark:fill-neutral-100"
                  >
                    {mainText.split("\n")[0]}
                  </text>

                  {/* Second line or Subtitle if any */}
                  {(subText || mainText.includes("\n")) && (
                    <text
                      x={iconSvg && entity.shape !== "diamond" ? 38 : w / 2}
                      y={h / 2 + 14}
                      textAnchor={iconSvg && entity.shape !== "diamond" ? "start" : "middle"}
                      fill="#71717a"
                      fontSize={11}
                      fontFamily="Inter, sans-serif"
                      className="dark:fill-neutral-400"
                    >
                      {subText || mainText.split("\n")[1]}
                    </text>
                  )}
                </g>

                {/* ── Selection Bounding Box & Handles ── */}
                {isSelected && (
                  <g>
                    {/* Bounding box outline */}
                    <rect
                      x={-4}
                      y={-4}
                      width={w + 8}
                      height={h + 8}
                      rx={10}
                      fill="none"
                      stroke="#2563eb"
                      strokeWidth="1.5"
                      strokeDasharray="4 4"
                    />

                    {/* Resize Handles (8 points) */}
                    {[
                      { handle: "nw", x: -7, y: -7 },
                      { handle: "ne", x: w + 1, y: -7 },
                      { handle: "se", x: w + 1, y: h + 1 },
                      { handle: "sw", x: -7, y: h + 1 },
                      { handle: "n", x: w / 2 - 3, y: -7 },
                      { handle: "s", x: w / 2 - 3, y: h + 1 },
                      { handle: "e", x: w + 1, y: h / 2 - 3 },
                      { handle: "w", x: -7, y: h / 2 - 3 },
                    ].map((pt) => (
                      <rect
                        key={pt.handle}
                        x={pt.x}
                        y={pt.y}
                        width="7"
                        height="7"
                        fill="#ffffff"
                        stroke="#2563eb"
                        strokeWidth="1.5"
                        className="cursor-nwse-resize"
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          setResizing({
                            entityId: entity.id,
                            handle: pt.handle,
                            startX: e.clientX,
                            startY: e.clientY,
                            initialWidth: w,
                            initialHeight: h,
                            initialX: entity.x,
                            initialY: entity.y,
                          });
                        }}
                      />
                    ))}

                    {/* Quick Connect Button (+) Floating right below the node */}
                    <g
                      transform={`translate(${w / 2}, ${h + 18})`}
                      onClick={(e) => handleQuickConnect(e, entity.id)}
                      className="cursor-pointer hover:scale-110 transition-transform"
                    >
                      <circle cx="0" cy="0" r="10" fill="#2563eb" className="shadow-md" />
                      <line x1="-5" y1="0" x2="5" y2="0" stroke="#ffffff" strokeWidth="2" />
                      <line x1="0" y1="-5" x2="0" y2="5" stroke="#ffffff" strokeWidth="2" />
                    </g>
                  </g>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      {/* Empty Canvas Indicator */}
      {doc.entities.length === 0 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none select-none text-muted-foreground z-10">
          <div className="p-6 rounded-2xl bg-white/90 dark:bg-neutral-900/90 border border-border/80 backdrop-blur-md shadow-xl flex flex-col items-center text-center max-w-sm">
            <div className="p-3 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400 mb-3">
              <Layers className="w-7 h-7" />
            </div>
            <h4 className="text-sm font-semibold text-foreground mb-1">Clean Canvas Ready</h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Press <span className="font-mono font-semibold bg-muted px-1.5 py-0.5 rounded text-[11px] text-foreground">Ctrl+J</span> to generate with AI, or place shapes (<span className="font-mono font-semibold text-foreground">R</span>) and layers (<span className="font-mono font-semibold text-foreground">Group</span>) using the left toolbar.
            </p>
          </div>
        </div>
      )}

      {/* ── BOTTOM FLOATING PROPERTY TOOLBAR (Matches image exactly!) ──────── */}
      <footer className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center bg-white dark:bg-neutral-900 border border-border/80 rounded-full shadow-2xl px-4 py-2 gap-3 text-sm text-foreground">
        {/* Quick Add Node (+) */}
        <button
          onClick={duplicateSelected}
          className="p-1.5 rounded-full hover:bg-neutral-100 dark:hover:bg-neutral-800 text-foreground"
          title="Add / Clone Node"
        >
          <Plus className="w-4 h-4" />
        </button>

        <div className="w-px h-5 bg-border/70" />

        {/* Edit Text Button */}
        <button
          onClick={() => {
            if (selectedEntity) {
              const current = selectedEntity.texts?.[0]?.text || "";
              const next = prompt("Edit node text:", current);
              if (next !== null) {
                updateSelectedEntity({
                  texts: [{ text: next, fontSize: selectedEntity.texts?.[0]?.fontSize || 13, hAlign: "center" }],
                });
              }
            } else if (selectedConnection) {
              const current = selectedConnection.label || "";
              const next = prompt("Edit connection label:", current);
              if (next !== null) {
                updateSelectedConnection({ label: next });
              }
            } else {
              alert("Select a shape or connection to edit its text.");
            }
          }}
          className="text-xs font-semibold px-2 py-1 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Edit text
        </button>

        <div className="w-px h-5 bg-border/70" />

        {/* Connector Routing Toggle (Elbow / Straight) */}
        <button
          onClick={() => {
            if (selectedConnection) {
              const nextStyle = selectedConnection.cornerStyle === "straight" ? "elbow" : "straight";
              updateSelectedConnection({ cornerStyle: nextStyle });
            }
          }}
          className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
          title="Toggle Orthogonal / Straight line"
        >
          <CornerDownRight className="w-4 h-4" />
        </button>

        {/* Shape Picker */}
        <div className="relative group">
          <button
            className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800 flex items-center gap-1"
            title="Change Shape"
          >
            <Square className="w-4 h-4" />
          </button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex bg-card border border-border rounded-lg shadow-xl p-1 gap-1">
            {(["rectangle", "diamond", "cylinder", "circle"] as AllowedShape[]).map((shp) => (
              <button
                key={shp}
                onClick={() => updateSelectedEntity({ shape: shp })}
                className="px-2 py-1 text-xs rounded hover:bg-accent capitalize text-foreground"
              >
                {shp}
              </button>
            ))}
          </div>
        </div>

        {/* Color Palette Picker (Eraser Stock Palette) */}
        <div className="relative group">
          <button
            className="flex items-center gap-1 p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title="Pick Color"
          >
            <span
              className="w-4 h-4 rounded-full border border-border"
              style={{ backgroundColor: resolveColor(selectedEntity?.color || selectedConnection?.color || "blue") }}
            />
          </button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex bg-card border border-border rounded-xl shadow-xl p-2 gap-1.5">
            {(Object.keys(STOCK_PALETTE) as PaletteToken[]).map((token) => (
              <button
                key={token}
                onClick={() => {
                  if (selectedEntity) updateSelectedEntity({ color: token });
                  if (selectedConnection) updateSelectedConnection({ color: token });
                }}
                className="w-5 h-5 rounded-full border border-black/20 hover:scale-125 transition-transform"
                style={{ backgroundColor: STOCK_PALETTE[token] }}
                title={token}
              />
            ))}
          </div>
        </div>

        {/* Border Style (Solid, Dashed, Dotted) */}
        <div className="relative group">
          <button
            className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800"
            title="Border / Stroke Style"
          >
            <Minus className="w-4 h-4" />
          </button>
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:flex bg-card border border-border rounded-lg shadow-xl p-1 gap-1 text-xs">
            {(["solid", "dashed", "dotted"] as BorderStyle[]).map((style) => (
              <button
                key={style}
                onClick={() => {
                  if (selectedEntity) updateSelectedEntity({ borderStyle: style });
                  if (selectedConnection) updateSelectedConnection({ lineStyle: style });
                }}
                className="px-2 py-1 rounded hover:bg-accent capitalize text-foreground"
              >
                {style}
              </button>
            ))}
          </div>
        </div>

        {/* Line Thickness (1, 2, 3) */}
        <div className="flex items-center gap-1 px-1">
          {[1, 2, 3].map((w) => (
            <button
              key={w}
              onClick={() => {
                if (selectedEntity) updateSelectedEntity({ borderWidth: w });
                if (selectedConnection) updateSelectedConnection({ lineWidth: w });
              }}
              className="w-6 h-6 rounded flex items-center justify-center hover:bg-neutral-100 dark:hover:bg-neutral-800 text-xs font-semibold"
              title={`Thickness ${w}px`}
            >
              {w}
            </button>
          ))}
        </div>

        <div className="w-px h-5 bg-border/70" />

        {/* More Actions Menu (...) */}
        <div className="relative group">
          <button className="p-1.5 rounded-md hover:bg-neutral-100 dark:hover:bg-neutral-800">
            •••
          </button>
          <div className="absolute bottom-full right-0 mb-2 hidden group-hover:flex flex-col w-32 bg-card border border-border rounded-lg shadow-xl py-1 text-xs">
            <button
              onClick={duplicateSelected}
              className="px-3 py-1.5 text-left hover:bg-accent text-foreground flex items-center gap-2"
            >
              <span>Duplicate</span>
            </button>
            <button
              onClick={() => {
                deleteSelectedEntity();
                deleteSelectedConnection();
              }}
              className="px-3 py-1.5 text-left hover:bg-red-50 dark:hover:bg-red-950 text-red-600 flex items-center gap-2"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          </div>
        </div>
      </footer>

      {/* ── BOTTOM RIGHT HELP BUTTON ───────────────────────────────────────── */}
      <button
        onClick={() => setIsHelpOpen(true)}
        className="absolute bottom-5 right-5 z-30 p-2.5 rounded-full bg-white dark:bg-neutral-900 border border-border shadow-lg text-muted-foreground hover:text-foreground hover:scale-105 transition-all"
        title="Keyboard Shortcuts & Help"
      >
        <HelpCircle className="w-5 h-5" />
      </button>

      {/* ── AI PROMPT MODAL (Ctrl+J) ────────────────────────────────────────── */}
      {isAiModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg bg-card border border-border rounded-2xl shadow-2xl p-6 relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => setIsAiModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 mb-3">
              <div className="p-2 rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">AI Diagram Generator & Editor</h3>
                <p className="text-xs text-muted-foreground">
                  Prompt the AI to modify this diagram or generate a new architecture from scratch.
                </p>
              </div>
            </div>

            <textarea
              value={aiPrompt}
              onChange={(e) => setAiPrompt(e.target.value)}
              placeholder="e.g. 'Add a Redis Cache cluster in Layer 3 between Edge Worker and Database', 'Change all Layer 4 components to purple', or 'Design a microservice payment gateway'..."
              rows={4}
              className="w-full p-3 rounded-xl border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none mb-4"
              autoFocus
            />

            <div className="flex items-center justify-between">
              <div className="text-[11px] text-muted-foreground">
                Shortcut: <span className="font-mono bg-muted px-1.5 py-0.5 rounded">Ctrl+J</span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsAiModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800 text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAiGenerate}
                  disabled={isAiGenerating || !aiPrompt.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm disabled:opacity-50 transition-all"
                >
                  {isAiGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>{isAiGenerating ? "Generating..." : "Apply Changes"}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CODE / JSON EDITOR MODAL ───────────────────────────────────────── */}
      {isCodeModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-2xl bg-card border border-border rounded-2xl shadow-2xl p-6 relative animate-in fade-in">
            <button
              onClick={() => setIsCodeModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-semibold text-foreground mb-1">Eraser Diagram Code (MDP JSON)</h3>
            <p className="text-xs text-muted-foreground mb-3">
              You can copy, paste, or modify the raw JSON specification.
            </p>

            <textarea
              value={codeDraft}
              onChange={(e) => setCodeDraft(e.target.value)}
              rows={16}
              className="w-full p-3 font-mono text-xs rounded-xl border border-border bg-neutral-900 text-neutral-100 focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none mb-4"
            />

            <div className="flex items-center justify-between">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(codeDraft);
                  alert("Copied to clipboard!");
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-border hover:bg-accent text-foreground"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>Copy Code</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsCodeModalOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg hover:bg-accent text-muted-foreground"
                >
                  Cancel
                </button>
                <button
                  onClick={applyCodeDraft}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow-sm"
                >
                  Apply to Canvas
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── SHORTCUTS & HELP MODAL ─────────────────────────────────────────── */}
      {isHelpOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 relative animate-in fade-in">
            <button
              onClick={() => setIsHelpOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-semibold text-foreground mb-3">Eraser Diagrams Keyboard Shortcuts</h3>

            <div className="space-y-2 text-xs text-muted-foreground mb-4">
              <div className="flex justify-between py-1 border-b border-border/50">
                <span>Select & Pan Tool</span>
                <span className="font-mono font-semibold text-foreground">V</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span>Place Shape Block</span>
                <span className="font-mono font-semibold text-foreground">R</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span>Place Icon</span>
                <span className="font-mono font-semibold text-foreground">I</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span>Place Text Label</span>
                <span className="font-mono font-semibold text-foreground">T</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span>Draw Arrow</span>
                <span className="font-mono font-semibold text-foreground">A</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span>AI Prompt / Modify</span>
                <span className="font-mono font-semibold text-foreground">Ctrl + J</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span>Undo / Redo</span>
                <span className="font-mono font-semibold text-foreground">Ctrl + Z / Ctrl + Shift + Z</span>
              </div>
              <div className="flex justify-between py-1 border-b border-border/50">
                <span>Delete Selected Node</span>
                <span className="font-mono font-semibold text-foreground">Backspace / Delete</span>
              </div>
              <div className="flex justify-between py-1">
                <span>Quick Connect</span>
                <span className="font-mono font-semibold text-foreground">Click (+) on selected node</span>
              </div>
            </div>

            <button
              onClick={() => setIsHelpOpen(false)}
              className="w-full py-2 text-xs font-semibold rounded-lg bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 text-foreground"
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ── ICON PICKER MODAL ──────────────────────────────────────────────── */}
      {isIconPickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-2xl p-6 relative animate-in fade-in">
            <button
              onClick={() => setIsIconPickerOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-md text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>

            <h3 className="text-base font-semibold text-foreground mb-2">Select Icon</h3>
            <input
              type="text"
              value={iconSearch}
              onChange={(e) => setIconSearch(e.target.value)}
              placeholder="Search icons (server, database, user, robot...)"
              className="w-full p-2.5 mb-4 text-xs rounded-lg border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              autoFocus
            />

            <div className="grid grid-cols-4 gap-2.5 max-h-64 overflow-y-auto p-1">
              {Object.keys(ERASER_ICONS)
                .filter((name) => name.toLowerCase().includes(iconSearch.toLowerCase()))
                .map((name) => {
                  const svgPath = ERASER_ICONS[name];
                  return (
                    <button
                      key={name}
                      onClick={() => {
                        if (selectedEntity) {
                          updateSelectedEntity({ icon: name });
                        } else {
                          // Create a new icon shape
                          const newId = "icon_" + Math.random().toString(36).substring(2, 7);
                          const newEntity: EraserEntity = {
                            id: newId,
                            tag: "Shape",
                            shape: "rectangle",
                            x: 100,
                            y: 100,
                            width: 120,
                            height: 60,
                            color: "blue",
                            icon: name,
                            texts: [{ text: name.toUpperCase(), fontSize: 12, hAlign: "center" }],
                          };
                          pushHistory({
                            ...doc,
                            entities: [...doc.entities, newEntity],
                          });
                          setSelectedEntityId(newId);
                        }
                        setIsIconPickerOpen(false);
                      }}
                      className="flex flex-col items-center justify-center p-3 rounded-xl border border-border hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/40 text-foreground transition-all"
                    >
                      <svg
                        width="24"
                        height="24"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mb-1 text-blue-500"
                      >
                        <path d={svgPath} />
                      </svg>
                      <span className="text-[11px] capitalize truncate w-full text-center">{name}</span>
                    </button>
                  );
                })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
