/**
 * SkillsTab — Premium skills management panel.
 *
 * Features:
 * - Rich skill cards: name, description, trigger badge, version/updated
 * - Content preview: raw markdown or rendered (toggle)
 * - Add skill form: name, description, content, trigger selector
 * - Upload: .skill or .zip file (must contain SKILL.md with YAML frontmatter)
 * - Built-in skills shown separately (read-only)
 */

import { useState, useRef, useCallback } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import type { Skill } from "@/types";
import { BUILTIN_SKILLS } from "@/lib/skills";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { Eye, Code, ArrowLeft, ChevronRight, ChevronDown, Folder, FileIcon } from "lucide-react";

// ── helpers ──────────────────────────────────────────────────────────────────

function parseFrontmatter(raw: string): Record<string, string> {
  if (!raw.startsWith("---")) return {};
  const endIdx = raw.indexOf("\n---", 3);
  if (endIdx === -1) return {};
  const block = raw.slice(4, endIdx);
  const result: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let val = line.slice(colonIdx + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) val = val.slice(1, -1);
    result[key] = val;
  }
  return result;
}

function stripFrontmatter(content: string): string {
  if (!content.startsWith("---")) return content;
  const end = content.indexOf("\n---", 3);
  if (end === -1) return content;
  return content.slice(end + 4).trim();
}

function formatDate(ts?: number): string {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString(undefined, {
    month: "short", day: "numeric", year: "numeric",
  });
}

// ── Trigger badge ─────────────────────────────────────────────────────────────

function TriggerBadge({ trigger }: { trigger?: string }) {
  const map: Record<string, { label: string; color: string }> = {
    slash: { label: "/slash", color: "bg-muted text-muted-foreground border-border/50" },
    auto: { label: "Auto", color: "bg-muted text-muted-foreground border-border/50" },
    both: { label: "Auto + Slash", color: "bg-muted text-muted-foreground border-border/50" },
  };
  const t = map[trigger || "both"] ?? map["both"]!;
  return (
    <span className={cn("inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium border", t.color)}>
      {t.label}
    </span>
  );
}

// ── Skill card ────────────────────────────────────────────────────────────────

interface SkillCardProps {
  skill: Skill & { builtIn?: boolean };
  onClick: () => void;
  onDelete?: () => void;
}

function SkillCard({ skill, onClick, onDelete }: SkillCardProps) {
  const fm = parseFrontmatter(skill.content);
  const description = skill.description || fm.description || "";

  return (
    <div 
      className={cn(
        "group relative rounded-xl border bg-card shadow-sm transition-all duration-200 cursor-pointer",
        "hover:border-primary/30 hover:shadow-md",
        skill.builtIn ? "border-border/50 opacity-90" : "border-border"
      )}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h5 className="font-semibold text-sm text-foreground truncate">{skill.name}</h5>
            {skill.builtIn && (
              <span className="inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-medium border bg-muted text-muted-foreground border-border/50">
                Built-in
              </span>
            )}
            <TriggerBadge trigger={skill.trigger} />
          </div>
          {description && (
            <p className="mt-1 text-xs text-muted-foreground line-clamp-2 leading-relaxed">
              {description}
            </p>
          )}
          <p className="mt-1.5 text-[10px] text-muted-foreground/60">
            Updated {formatDate(skill.updatedAt || skill.createdAt)}
          </p>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {!skill.builtIn && onDelete && (
            <button
              className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
              title="Delete skill"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── File Tree ────────────────────────────────────────────────────────────────

type FileNode = {
  name: string;
  path: string;
  isDirectory: boolean;
  children: Record<string, FileNode>;
};

function buildFileTree(files: { path: string }[]): FileNode {
  const root: FileNode = { name: "root", path: "", isDirectory: true, children: {} };
  for (const f of files) {
    const parts = f.path.split('/');
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (!part) continue;
      if (!current.children[part]) {
        current.children[part] = {
          name: part,
          path: parts.slice(0, i + 1).join('/'),
          isDirectory: i < parts.length - 1,
          children: {}
        };
      }
      current = current.children[part];
    }
  }
  return root;
}

function FileTreeView({ node, activeFile, onSelect }: { node: FileNode, activeFile: string | null, onSelect: (path: string) => void }) {
  const [expanded, setExpanded] = useState(true);

  if (node.name === "root") {
    return (
      <div className="space-y-0.5">
        {Object.values(node.children)
          .sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1))
          .map(child => <FileTreeView key={child.path} node={child} activeFile={activeFile} onSelect={onSelect} />)}
      </div>
    );
  }

  if (node.isDirectory) {
    return (
      <div className="space-y-0.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-foreground rounded-md transition-colors"
        >
          {expanded ? <ChevronDown className="w-3.5 h-3.5 shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 shrink-0" />}
          <Folder className="w-3.5 h-3.5 shrink-0 text-blue-400" />
          <span className="truncate">{node.name}</span>
        </button>
        {expanded && (
          <div className="ml-3 pl-2 border-l border-border/50 space-y-0.5">
            {Object.values(node.children)
              .sort((a, b) => (a.isDirectory === b.isDirectory ? a.name.localeCompare(b.name) : a.isDirectory ? -1 : 1))
              .map(child => <FileTreeView key={child.path} node={child} activeFile={activeFile} onSelect={onSelect} />)}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => onSelect(node.path)}
      className={cn(
        "w-full flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md transition-colors truncate",
        activeFile === node.path ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <FileIcon className="w-3.5 h-3.5 shrink-0 opacity-70" />
      <span className="truncate">{node.name}</span>
    </button>
  );
}

function SkillDetailsView({ skill, onBack }: { skill: Skill & { builtIn?: boolean }, onBack: () => void }) {
  const [previewMode, setPreviewMode] = useState<"raw" | "formatted">("formatted");
  const [activeFile, setActiveFile] = useState<string | null>(null);

  const rawContent = activeFile 
    ? (skill.files?.find(f => f.path === activeFile)?.content || "")
    : skill.content;
    
  // Always strip frontmatter for both raw and formatted mode
  const displayBody = stripFrontmatter(rawContent);

  const fm = parseFrontmatter(skill.content);
  const description = skill.description || fm.description || "";

  return (
    <div className="flex flex-col h-[600px] border border-border rounded-xl bg-card overflow-hidden animate-in fade-in zoom-in-95 duration-200">
      {/* Header */}
      <div className="flex items-start gap-3 p-3 border-b border-border bg-muted/20 shrink-0">
        <button onClick={onBack} className="p-1.5 mt-0.5 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground truncate">{skill.name}</h3>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg mt-0.5">
          <button
            onClick={() => setPreviewMode("formatted")}
            title="Formatted"
            className={cn(
              "flex items-center justify-center p-1.5 rounded-md text-xs font-medium transition-colors",
              previewMode === "formatted" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Eye className="w-4 h-4" />
          </button>
          <button
            onClick={() => setPreviewMode("raw")}
            title="Raw MD"
            className={cn(
              "flex items-center justify-center p-1.5 rounded-md text-xs font-medium transition-colors",
              previewMode === "raw" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            <Code className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar (Left) */}
        <div className="w-56 border-r border-border bg-muted/10 shrink-0 flex flex-col">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground border-b border-border/50 shrink-0">
            Files
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            <button
              onClick={() => setActiveFile(null)}
              className={cn("w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs truncate transition-colors", activeFile === null ? "bg-accent text-accent-foreground font-medium" : "text-muted-foreground hover:bg-muted")}
            >
              <FileIcon className="w-3.5 h-3.5 shrink-0 opacity-70" />
              <span>SKILL.md</span>
            </button>
            {skill.files && skill.files.length > 0 && (
              <FileTreeView 
                node={buildFileTree(skill.files)} 
                activeFile={activeFile} 
                onSelect={setActiveFile} 
              />
            )}
          </div>
        </div>

        {/* Content Area (Right) */}
        <div className="flex-1 overflow-y-auto p-5">
          {previewMode === "raw" ? (
            <pre className="text-xs font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">{displayBody}</pre>
          ) : (
            <div className="prose prose-sm dark:prose-invert max-w-none prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border">
              <ReactMarkdown>{displayBody}</ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Add Skill Form ────────────────────────────────────────────────────────────

interface AddSkillFormProps {
  onSave: (skill: Omit<Skill, "id" | "createdAt">) => void;
  onCancel: () => void;
}

function AddSkillForm({ onSave, onCancel }: AddSkillFormProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [content, setContent] = useState("");
  const [trigger, setTrigger] = useState<"slash" | "auto" | "both">("both");

  const handleSave = () => {
    if (!name.trim() || !content.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      content: content.trim(),
      trigger,
    });
  };

  return (
    <div className="space-y-4 rounded-xl border border-border p-5 bg-muted/10 animate-in fade-in slide-in-from-top-2 duration-200">
      <div className="space-y-1">
        <h4 className="text-sm font-semibold">Create New Skill</h4>
        <p className="text-xs text-muted-foreground">Skills are read by the AI as context. Use SKILL.md format for best results.</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="text-xs font-medium text-foreground mb-1.5 block">Skill Name</label>
          <Input
            placeholder="e.g. react-expert, data-analyst"
            value={name}
            onChange={e => setName(e.target.value)}
            className="bg-background"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-foreground mb-1.5 block">
            Description <span className="text-muted-foreground font-normal">(used for auto-detection)</span>
          </label>
          <Input
            placeholder="Briefly describe when this skill should trigger…"
            value={description}
            onChange={e => setDescription(e.target.value)}
            className="bg-background"
          />
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-foreground mb-1.5 block">Trigger Mode</label>
          <div className="flex gap-2">
            {(["slash", "auto", "both"] as const).map(t => (
              <button
                key={t}
                type="button"
                onClick={() => setTrigger(t)}
                className={cn(
                  "flex-1 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                  trigger === t
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:border-primary/30"
                )}
              >
                {t === "slash" ? "/slash" : t === "auto" ? "auto" : "/slash + auto"}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">
            Slash = type /skillname to activate &nbsp;·&nbsp; Auto = AI detects from your message &nbsp;·&nbsp; Both = either
          </p>
        </div>
        <div className="col-span-2">
          <label className="text-xs font-medium text-foreground mb-1.5 block">Skill Content (SKILL.md)</label>
          <Textarea
            placeholder={"# My Skill\n\nInstructions for the AI..."}
            value={content}
            onChange={e => setContent(e.target.value)}
            className="min-h-[220px] font-mono text-xs bg-background leading-relaxed"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-1">
        <Button variant="ghost" size="sm" onClick={onCancel}>Cancel</Button>
        <Button
          size="sm"
          disabled={!name.trim() || !content.trim()}
          onClick={handleSave}
        >
          Save Skill
        </Button>
      </div>
    </div>
  );
}

// ── Upload Zone ───────────────────────────────────────────────────────────────

interface UploadZoneProps {
  onSkillLoaded: (skill: Omit<Skill, "id" | "createdAt">) => void;
}

function UploadZone({ onSkillLoaded }: UploadZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const processFile = useCallback(async (file: File) => {
    setError(null);
    const name = file.name.toLowerCase();

    if (name.endsWith(".md")) {
      // Single .md file — validate frontmatter
      const text = await file.text();
      const fm = parseFrontmatter(text);
      if (!fm.name) { setError("SKILL.md must have a 'name' field in its YAML frontmatter."); return; }
      if (!fm.description) { setError("SKILL.md must have a 'description' field in its YAML frontmatter."); return; }
      onSkillLoaded({ name: fm.name, description: fm.description, content: text, trigger: "both" });
    } else if (name.endsWith(".zip") || name.endsWith(".skill")) {
      // ZIP — extract all files using minimal zip reader
      try {
        const buf = await file.arrayBuffer();
        const extracted = extractAllSkillFiles(buf);
        if (!extracted) { setError("Archive must contain a SKILL.md file."); return; }
        const fm = parseFrontmatter(extracted.content);
        if (!fm.name) { setError("SKILL.md must have a 'name' field in its YAML frontmatter."); return; }
        if (!fm.description) { setError("SKILL.md must have a 'description' field in its YAML frontmatter."); return; }
        onSkillLoaded({ name: fm.name, description: fm.description, content: extracted.content, files: extracted.files, trigger: "both" });
      } catch (e: any) {
        setError(`Failed to read archive: ${e.message}`);
      }
    } else {
      setError("Unsupported file type. Please upload a .md, .zip, or .skill file.");
    }
  }, [onSkillLoaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  }, [processFile]);

  return (
    <div>
      <div
        className={cn(
          "relative rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer group",
          isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/20"
        )}
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".md,.zip,.skill"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) processFile(f); e.target.value = ""; }}
        />
        <div className="flex flex-col items-center gap-2 py-8 px-4 text-center">
          <div className="rounded-xl bg-muted/50 group-hover:bg-primary/10 p-3 transition-colors">
            <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground group-hover:text-primary transition-colors">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="17 8 12 3 7 8"/>
              <line x1="12" x2="12" y1="3" y2="15"/>
            </svg>
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">Drop skill file here or <span className="text-primary">browse</span></p>
            <p className="text-xs text-muted-foreground mt-0.5">Supports .md, .zip, and .skill files</p>
          </div>
        </div>
      </div>

      {/* File requirements */}
      <div className="mt-3 rounded-lg bg-muted/30 border border-border/50 px-4 py-3 space-y-1.5">
        <p className="text-xs font-semibold text-foreground">File requirements</p>
        <ul className="space-y-1">
          <li className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="text-primary font-bold mt-0.5">·</span>
            <span><code className="font-mono">.md</code> file must contain <code className="font-mono">name</code> and <code className="font-mono">description</code> formatted in YAML</span>
          </li>
          <li className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="text-primary font-bold mt-0.5">·</span>
            <span><code className="font-mono">.zip</code> or <code className="font-mono">.skill</code> file must include a <code className="font-mono">SKILL.md</code> file</span>
          </li>
        </ul>
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/20 px-3 py-2.5 text-xs text-destructive animate-in fade-in">
          <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
          {error}
        </div>
      )}
    </div>
  );
}

// ── Minimal ZIP reader (extract all files from a zip buffer) ─────────────────

function extractAllSkillFiles(buf: ArrayBuffer): { content: string, files: { path: string, content: string }[] } | null {
  const view = new DataView(buf);
  const bytes = new Uint8Array(buf);
  let offset = 0;
  
  let mainContent: string | null = null;
  const files: { path: string, content: string }[] = [];

  while (offset < bytes.length - 4) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) { offset++; continue; }

    const fnLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameBytes = bytes.slice(offset + 30, offset + 30 + fnLen);
    const fileName = new TextDecoder().decode(nameBytes);
    const compMethod = view.getUint16(offset + 8, true);
    const compSize = view.getUint32(offset + 18, true);
    const dataOffset = offset + 30 + fnLen + extraLen;

    const baseName = fileName.split("/").pop() || "";
    
    // Check if file is a directory (name ends with slash or compSize is 0)
    if (fileName.endsWith("/") || compSize === 0) {
      offset = dataOffset + compSize;
      continue;
    }

    if (compMethod === 0) {
      // STORE — no compression
      const fileBytes = bytes.slice(dataOffset, dataOffset + compSize);
      const text = new TextDecoder().decode(fileBytes);
      
      if (baseName === "SKILL.md" && !fileName.includes("/")) {
        mainContent = text;
      } else {
        files.push({ path: fileName, content: text });
      }
    } else {
      console.warn(`Skipping ${fileName}: compressed with method ${compMethod}. Currently only STORE (0) is supported by this minimal zip parser.`);
    }

    offset = dataOffset + compSize;
  }
  
  if (!mainContent) return null;
  return { content: mainContent, files };
}

// ── Main SkillsTab ─────────────────────────────────────────────────────────────

interface SettingsState {
  skills: Skill[];
  addSkill: (skill: Omit<Skill, "id" | "createdAt">) => void;
  updateSkill: (id: string, updates: Partial<Skill>) => void;
  deleteSkill: (id: string) => void;
}

interface SkillsTabProps {
  settings: SettingsState;
}

export function SkillsTab({ settings }: SkillsTabProps) {
  const [mode, setMode] = useState<"list" | "add" | "upload">("list");
  const [selectedSkill, setSelectedSkill] = useState<any>(null);

  const handleAddSkill = (skill: Omit<Skill, "id" | "createdAt">) => {
    settings.addSkill(skill as any);
    setMode("list");
  };

  const handleUploadedSkill = (skill: Omit<Skill, "id" | "createdAt">) => {
    settings.addSkill(skill as any);
    setMode("list");
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h4 className="text-sm font-semibold">Skills</h4>
          <p className="text-xs text-muted-foreground mt-0.5">
            Skills inject specialized context into the AI. They can trigger automatically or via /command.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMode(m => m === "upload" ? "list" : "upload")}
            className="gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
            Upload
          </Button>
          <Button
            size="sm"
            onClick={() => setMode(m => m === "add" ? "list" : "add")}
            className="gap-1.5"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" x2="12" y1="5" y2="19"/><line x1="5" x2="19" y1="12" y2="12"/></svg>
            {mode === "add" ? "Cancel" : "New Skill"}
          </Button>
        </div>
      </div>

      {/* Add form */}
      {mode === "add" && (
        <AddSkillForm onSave={handleAddSkill} onCancel={() => setMode("list")} />
      )}

      {/* Upload zone */}
      {mode === "upload" && (
        <div className="space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
          <UploadZone onSkillLoaded={skill => { handleUploadedSkill(skill); }} />
        </div>
      )}

      {/* Combined Skills List */}
      {mode === "list" && !selectedSkill && (
        <div className="space-y-3">
          {([...BUILTIN_SKILLS.map(s => ({ ...s, trigger: "auto", builtIn: true })), ...settings.skills]).map(skill => (
            <SkillCard
              key={skill.id}
              skill={skill as any}
              onClick={() => setSelectedSkill(skill)}
              onDelete={(skill as any).builtIn ? undefined : () => settings.deleteSkill(skill.id)}
            />
          ))}
          {settings.skills.length === 0 && BUILTIN_SKILLS.length === 0 && (
            <div className="py-12 text-center rounded-xl border border-dashed border-border bg-muted/5">
              <div className="flex flex-col items-center gap-3">
                <div className="rounded-xl bg-muted/50 p-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                    <path d="M12 2v20"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-foreground">No skills yet</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Create a skill or ask the AI to build one for you in chat</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setMode("add")}>
                  Create your first skill
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Details View */}
      {mode === "list" && selectedSkill && (
        <SkillDetailsView 
          skill={selectedSkill} 
          onBack={() => setSelectedSkill(null)} 
        />
      )}
    </div>
  );
}
