import { useState, useRef, useCallback, useEffect } from "react";
import { useSettingsStore } from "@/stores/settings";
import { BUILTIN_SKILLS } from "@/lib/skills";
import { parseFileContent, generatePdfPreview } from "@/lib/file-parser";
import { uploadFileToSupabase } from "@/lib/supabase";
import { getModelCounterpart, getAvailableModels } from "@/lib/providers/presets";
import { Loader, X, FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore, cleanDocumentTitle } from "@/stores/chat";
import { useAuthStore } from "@/stores/auth";
import { saveDraftAttachment, getDraftAttachments, deleteDraftAttachment, clearDraftAttachments } from "@/lib/draftsDb";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ModelSelector } from "@/components/ui/ModelSelector";

interface ChatInputProps {
  onSend: (message: string, attachments?: any[]) => void;
  onStop: () => void;
  disabled?: boolean;
  isSending?: boolean;
  initialValue?: string;
  isIncognito?: boolean;
  mcpConnected?: boolean;
}

interface Attachment {
  id: string;
  file: File;
  previewUrl: string | null;
  extractedText: string;
  extension: string;
  status: 'idle' | 'uploading' | 'error';
}

export function ChatInput({ onSend, onStop, disabled, isSending, initialValue, isIncognito, mcpConnected }: ChatInputProps) {
  const [value, setValue] = useState(initialValue || "");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isComposing, setIsComposing] = useState(false);
  const [pendingSkills, setPendingSkills] = useState<{id: string; name: string; content: string}[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const settings = useSettingsStore();

  // Mentions / Slash Commands autocomplete state
  const [allPrompts, setAllPrompts] = useState<any[]>([]);
  const [suggestionType, setSuggestionType] = useState<"mcp" | "prompt" | null>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const activeConversation = useChatStore(s => 
    s.conversations.find(c => c.id === s.activeConversationId)
  );
  const currentPdf = useChatStore(s => s.currentPdf);
  const pinnedMcpId = activeConversation?.pinnedMcpId;
  const draftPinnedMcpId = useChatStore(s => s.draftPinnedMcpId);
  const effectivePinnedMcpId = pinnedMcpId || draftPinnedMcpId;

  const pinnedMcp = (() => {
    if (!effectivePinnedMcpId) return null;
    if (effectivePinnedMcpId === "main") return { id: "main", name: "Materio", icon: "/app.png" };
    const conn = settings.customConnectors?.find(c => c.id === effectivePinnedMcpId);
    if (conn) return { id: conn.id, name: conn.name, icon: conn.icon };
    return null;
  })();

  const handleUnpinMcp = () => {
    useChatStore.getState().setPinnedMcpId(undefined);
  };

  // Fetch prompts when component mounts, when customConnectors change, or when connection status changes
  useEffect(() => {
    let active = true;
    import("@/lib/mcp-client").then(({ mcpClient }) => {
      if (mcpClient.isConnected() || mcpConnected) {
        const fetchPrompts = async () => {
          try {
            const prompts = await mcpClient.listPrompts();
            if (active) {
              setAllPrompts(prompts);
            }
          } catch (e) {
            console.error(e);
          }
        };
        fetchPrompts();
        const t = setTimeout(fetchPrompts, 1000);
        return () => clearTimeout(t);
      }
    });
    return () => { active = false; };
  }, [settings.customConnectors, mcpConnected]);

  // Monitor value and cursor to update suggestions
  useEffect(() => {
    if (!textareaRef.current) return;
    const text = value;
    const caretPos = textareaRef.current.selectionStart || 0;
    const textBeforeCaret = text.slice(0, caretPos);

    // 1. Check for @ mention
    const atMatch = textBeforeCaret.match(/@(\w*)$/);
    if (atMatch) {
      const q = (atMatch[1] || "").toLowerCase();
      // Exclude Materio from the suggestions list (first party MCP)
      const servers = (settings.customConnectors || []).map(c => ({ id: c.id, name: c.name, icon: c.icon }));
      const filtered = servers.filter(s => s.name.toLowerCase().includes(q));
      setSuggestionType("mcp");
      setSuggestions(filtered);
      setHighlightedIndex(0);
      return;
    }

    // 2. Check for / command anywhere in the input (skills list)
    const slashMatch = textBeforeCaret.match(/\/(\w*)$/);
    if (slashMatch) {
      const allSkills = [...BUILTIN_SKILLS, ...(settings.skills || [])];
      if (allSkills.length > 0) {
        const q = (slashMatch[1] || "").toLowerCase();
        const filtered = allSkills.filter(s => s.name.toLowerCase().includes(q));
        if (filtered.length > 0) {
          setSuggestionType("prompt");
          setSuggestions(filtered);
          setHighlightedIndex(0);
          return;
        }
      }
    }

    setSuggestionType(null);
    setSuggestions([]);
  }, [value, settings.customConnectors, allPrompts]);

  const handleSelectSuggestion = (item: any) => {
    if (!textareaRef.current) return;
    const text = value;
    const caretPos = textareaRef.current.selectionStart || 0;
    const textBeforeCaret = text.slice(0, caretPos);
    const textAfterCaret = text.slice(caretPos);

    if (suggestionType === "mcp") {
      const atIndex = textBeforeCaret.lastIndexOf("@");
      if (atIndex !== -1) {
        // Pin the selected MCP server
        useChatStore.getState().setPinnedMcpId(item.id);
        
        // Remove the @query part
        const newText = textBeforeCaret.slice(0, atIndex) + textAfterCaret;
        setValue(newText);
        
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(atIndex, atIndex);
          }
        }, 50);
      }
    } else if (suggestionType === "prompt") {
      const slashIndex = textBeforeCaret.lastIndexOf("/");
      if (slashIndex !== -1) {
        // Remove the /command from the input and attach skill as a pill
        const newText = textBeforeCaret.slice(0, slashIndex) + textAfterCaret;
        setValue(newText);
        // Add to pending skills (deduplicate by id)
        setPendingSkills(prev => {
          if (prev.find(s => s.id === item.id)) return prev;
          return [...prev, { id: item.id, name: item.name, content: item.content }];
        });
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus();
            textareaRef.current.setSelectionRange(slashIndex, slashIndex);
          }
        }, 50);
      }
    }
    
    setSuggestionType(null);
    setSuggestions([]);
  };
  const currentProviderId = settings.aiProvider.providerId;
  const currentModel = settings.aiProvider.model;

  const currentSizeLevel = (() => {
    const m = currentModel.toLowerCase();
    if (m.includes("8b") || m.includes("small") || m.includes("nemo")) return "low";
    if (m.includes("70b") || m.includes("medium")) return "medium";
    if (m.includes("340b") || m.includes("405b") || m.includes("large") || m.includes("max")) return "high";
    return "high";
  })();

  const availableModels = getAvailableModels(currentProviderId, settings);
  const lowModel = getModelCounterpart(currentModel, "low").slug;
  const mediumModel = getModelCounterpart(currentModel, "medium").slug;
  const highModel = getModelCounterpart(currentModel, "high").slug;

  const hasLow = lowModel !== currentModel && availableModels.includes(lowModel);
  const hasMedium = mediumModel !== currentModel && availableModels.includes(mediumModel);
  const hasHigh = highModel !== currentModel && availableModels.includes(highModel);

  const hasVariants = hasLow || hasMedium || hasHigh;

  const activeLevels = [
    { level: 'low', exist: hasLow || currentSizeLevel === 'low', slug: lowModel },
    { level: 'medium', exist: hasMedium || currentSizeLevel === 'medium', slug: mediumModel },
    { level: 'high', exist: hasHigh || currentSizeLevel === 'high', slug: highModel }
  ].filter(item => item.exist);

  const [isParsing, setIsParsing] = useState(false);
  const activeConversationId = useChatStore(s => s.activeConversationId) || 'new';
  const isTestUser = useAuthStore(s => s.token === "test_token" || s.user?.id === "test-user-id");
  const rawRateLimitResetTime = useChatStore(s => s.rateLimitResetTime);
  const rateLimitResetTime = isTestUser ? null : rawRateLimitResetTime;

  useEffect(() => {
    getDraftAttachments(activeConversationId).then(drafts => {
      if (drafts.length > 0) setAttachments(drafts);
      else setAttachments([]); // clear if no drafts for this convo
    });
  }, [activeConversationId]);

  useEffect(() => {
    if (initialValue) {
      setValue(initialValue);
    }
  }, [initialValue]);

  const onSendRef = useRef(onSend);
  useEffect(() => {
    onSendRef.current = onSend;
  }, [onSend]);

  useEffect(() => {
    const handleSetQuery = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        if (typeof customEvent.detail === 'string') {
          setValue(customEvent.detail);
        } else {
          const { query, autoSubmit } = customEvent.detail;
          if (query) {
            setValue(query);
            if (autoSubmit) {
              onSendRef.current(query);
              setValue("");
            }
          }
        }
      }
    };
    window.addEventListener("materio-set-query", handleSetQuery);
    return () => window.removeEventListener("materio-set-query", handleSetQuery);
  }, []);

  const handleSend = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed && attachments.length === 0) return;
    if (disabled) return;

    // Build final message content: inject any pending skills as XML blocks
    let finalContent = trimmed;
    if (pendingSkills.length > 0) {
      const skillBlocks = pendingSkills
        .map(s => `<skill name="${s.name}">\n${s.content}\n</skill>`)
        .join("\n");
      finalContent = `${skillBlocks}\n\n${trimmed}`;
    }

    let uploadedAttachments = undefined;

    if (attachments.length > 0) {
      setAttachments(prev => prev.map(a => ({ ...a, status: 'uploading' })));
      uploadedAttachments = [];

      for (const att of attachments) {
        try {
          const url = await uploadFileToSupabase(att.file);
          uploadedAttachments.push({
            id: att.id,
            name: att.file.name,
            url,
            previewUrl: att.previewUrl || undefined,
            extractedText: att.extractedText,
            extension: att.extension
          });
        } catch (e: any) {
          alert(`Failed to upload ${att.file.name}: ${e.message}`);
          setAttachments(prev => prev.map(a => a.id === att.id ? { ...a, status: 'error' } : a));
          return;
        }
      }
    }

    onSend(finalContent, uploadedAttachments);
    setValue("");
    setPendingSkills([]);
    setAttachments([]);
    clearDraftAttachments(activeConversationId);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, attachments, pendingSkills, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestionType && suggestions.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setHighlightedIndex(prev => (prev + 1) % suggestions.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setHighlightedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        handleSelectSuggestion(suggestions[highlightedIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSuggestionType(null);
        setSuggestions([]);
        return;
      }
    }

    if (e.key === "Enter" && !e.shiftKey && !isComposing) {
      // Allow enter to be newline on mobile devices
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      if (isMobile) {
        return;
      }
      e.preventDefault();
      handleSend();
    }
  };

  const processFile = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    const id = Math.random().toString(36).substring(7);

    const newAtt: Attachment = {
      id,
      file,
      previewUrl: null,
      extractedText: '',
      extension,
      status: 'idle'
    };

    setAttachments(prev => [...prev, newAtt]);

    try {
      if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(extension)) {
        newAtt.previewUrl = URL.createObjectURL(file);
        
        // Auto-route to vision model if current model isn't one
        const m = settings.aiProvider.model;
        const nonVisionModels = [
          "meta-llama/llama-3.3-70b-instruct:free",
          "deepseek/deepseek-v4-flash:free",
          "z-ai/glm-4.5-air:free",
          "moonshotai/kimi-k2.6:free",
          "nvidia/nemotron-3-nano-30b-a3b:free",
          "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
          "minimax/minimax-m2.5:free"
        ];
        if (nonVisionModels.includes(m)) {
          settings.setAIProvider({ ...settings.aiProvider, model: "openrouter/free" });
          import("@/stores/alert").then(mod => mod.useAlertStore.getState().addAlert("Switched to a vision-capable model to read your image.", "info"));
        }
      } else if (extension === 'pdf') {
        try {
          newAtt.previewUrl = await generatePdfPreview(file);
        } catch (e) {
          console.error("PDF preview failed", e);
        }
      }

      const content = await parseFileContent(file);
      newAtt.extractedText = content;

      setAttachments(prev => prev.map(a => a.id === id ? newAtt : a));
      saveDraftAttachment(activeConversationId, newAtt);
    } catch (err: any) {
      alert(`Failed to parse file: ${err.message}`);
      setAttachments(prev => prev.filter(a => a.id !== id));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await processFile(file);
  };

  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item) continue;
      if (item.type.indexOf('image') !== -1 || item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          let finalFile = file;
          if (file.name === 'image.png' || !file.name.includes('.')) {
            const ext = file.type.split('/')[1] || 'png';
            finalFile = new File([file], `pasted-image-${Date.now()}.${ext}`, { type: file.type });
          }
          await processFile(finalFile);
        }
      }
    }
  };

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [value]);

  return (
    <div className="bg-transparent px-2 sm:px-4 pb-4 pt-2">
      <div className="mx-auto max-w-3xl w-full flex flex-col">
        {rateLimitResetTime && (
          <div className="bg-[#a3a3a3] dark:bg-[#4a4a4a] text-black dark:text-white/80 text-[13px] px-5 py-2.5 rounded-t-xl border border-b-0 border-input font-medium flex items-center">
            You're out of messages for today, come back tomorrow at {rateLimitResetTime}.
          </div>
        )}
        <div className={cn("border border-input bg-input-bg shadow-sm relative", rateLimitResetTime ? "rounded-b-2xl" : "rounded-[24px]", isIncognito && "border-dotted border-[2px]")}>
          {/* Autocomplete Suggestions Menu */}
          {suggestionType && suggestions.length > 0 && (
            <div className="absolute bottom-full left-0 mb-2 w-80 sm:w-96 max-h-56 overflow-y-auto bg-popover text-popover-foreground border border-border rounded-xl shadow-xl z-40 p-1 flex flex-col gap-0.5">
              {suggestions.map((item, idx) => {
                const highlighted = idx === highlightedIndex;
                return (
                  <button
                    key={item.id || item.name}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      handleSelectSuggestion(item);
                    }}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-colors font-medium",
                      highlighted 
                        ? "bg-accent text-accent-foreground" 
                        : "hover:bg-accent/40 text-foreground"
                    )}
                  >
                    {suggestionType === "mcp" ? (
                      <>
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-muted overflow-hidden">
                          {item.icon ? (
                            <img src={item.icon} alt={item.name} className="h-full w-full object-cover" />
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>
                          )}
                        </div>
                        <span className="flex-1 truncate">{item.name}</span>
                      </>
                    ) : (
                      <>
                        <span className="text-primary font-bold">/{item.name}</span>
                        {item.description && (
                          <span className="text-muted-foreground text-xs truncate flex-1 ml-2">
                            {item.description}
                          </span>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Thumbnails Row */}
          {attachments.length > 0 && (
            <div className="flex flex-wrap gap-2 px-4 pt-4 pb-1">
              {attachments.map((att) => (
                <div key={att.id} className="relative h-16 w-16 shrink-0 rounded-xl border border-border bg-muted overflow-hidden group shadow-sm">
                  {att.previewUrl ? (
                    <img src={att.previewUrl} alt="Preview" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs font-bold uppercase text-muted-foreground">
                      {att.extension}
                    </div>
                  )}

                  {att.status === 'uploading' && (
                    <div className="absolute inset-0 bg-background/50 flex items-center justify-center backdrop-blur-[1px]">
                      <Loader className="h-4 w-4 animate-spin text-primary" />
                    </div>
                  )}

                  {att.status !== 'uploading' && (
                    <button
                      onClick={() => {
                        setAttachments(prev => prev.filter(a => a.id !== att.id));
                        deleteDraftAttachment(att.id);
                      }}
                      className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Active PDF from Oread */}
          {currentPdf && (() => {
            const pdfTitle = cleanDocumentTitle(currentPdf.title, currentPdf.url);
            return (
              <div className="flex items-center gap-1.5 px-4 pt-3 pb-1 text-xs">
                <div className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 rounded-full bg-secondary text-secondary-foreground border border-border/50 max-w-full">
                  <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate max-w-[240px] sm:max-w-[360px] font-medium" title={pdfTitle}>
                    {pdfTitle}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      useChatStore.getState().dismissPdfContext();
                    }}
                    className="p-0.5 rounded-full hover:bg-muted-foreground/20 text-muted-foreground hover:text-foreground transition-colors ml-0.5"
                    title="Remove document context"
                    aria-label="Remove document context"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Textarea row */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={
              currentPdf
                ? `Ask anything about "${cleanDocumentTitle(currentPdf.title, currentPdf.url)}"…`
                : "Write a message…"
            }
            disabled={disabled}
            rows={1}
            className={`w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[15px] leading-relaxed placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${value.length === 0 ? 'select-none' : 'select-text'}`}
            style={{ minHeight: "44px", maxHeight: "160px" }}
          />

          {/* Bottom action row */}
          <div className="flex items-center justify-between px-3 pb-3">
            {/* Left: attach / plus */}
            <div className="flex items-center gap-2">
              <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={`flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${isParsing ? 'animate-pulse' : ''}`}
                  title="Tools & Attachments"
                  disabled={isParsing}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56" sideOffset={8}>
                <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>
                  Add files
                </DropdownMenuItem>

                <DropdownMenuSeparator />

                <DropdownMenuItem
                  onClick={(e) => {
                    e.preventDefault();
                    settings.setExaSearchEnabled(!settings.exaSearchEnabled);
                  }}
                  className="flex items-center justify-between"
                >
                  <div className="flex items-center">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></svg>
                    Web search
                  </div>
                  <div className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${settings.exaSearchEnabled ? 'bg-brand' : 'bg-muted-foreground/30'}`}>
                    <div className={`w-3 h-3 rounded-full bg-background transition-transform ${settings.exaSearchEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </DropdownMenuItem>

                {([...BUILTIN_SKILLS, ...(settings.skills || [])]).length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                        Load Skill
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {([...BUILTIN_SKILLS, ...(settings.skills || [])]).map((skill) => (
                          <DropdownMenuItem
                            key={skill.id}
                            onClick={() => {
                              setPendingSkills(prev => {
                                if (prev.find(s => s.id === skill.id)) return prev;
                                return [...prev, { id: skill.id, name: skill.name, content: skill.content }];
                              });
                              setTimeout(() => textareaRef.current?.focus(), 50);
                            }}
                          >
                            <span className="flex-1">{skill.name}</span>
                            {pendingSkills.find(s => s.id === skill.id) && (
                              <span className="ml-2 text-xs text-primary font-semibold">Active</span>
                            )}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}

                {allPrompts.length > 0 && (() => {
                  const promptsByServer = allPrompts.reduce<Record<string, any[]>>((acc, p) => {
                    const sid = (p as any).serverId || "main";
                    if (!acc[sid]) acc[sid] = [];
                    acc[sid].push(p);
                    return acc;
                  }, {});

                  return (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuSub>
                        <DropdownMenuSubTrigger>
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>
                          Connectors
                        </DropdownMenuSubTrigger>
                        <DropdownMenuSubContent className="z-[110] max-h-[300px] overflow-y-auto">
                          {Object.entries(promptsByServer).map(([sid, prompts]: [string, any[]]) => {
                            const connectorName = sid === "main" ? "Materio" : (settings.customConnectors?.find(c => c.id === sid)?.name || `Connector (${sid.slice(0, 4)})`);
                            return (
                              <DropdownMenuSub key={sid}>
                                <DropdownMenuSubTrigger>
                                  <span>{connectorName}</span>
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="z-[120] max-h-[300px] overflow-y-auto">
                                  {prompts.map((p: any) => (
                                    <DropdownMenuItem
                                      key={p.name}
                                      onClick={() => {
                                        setValue(prev => prev + (prev.trim() ? ' ' : '') + `/${p.name} `);
                                        setTimeout(() => textareaRef.current?.focus(), 50);
                                      }}
                                    >
                                      {p.name}
                                    </DropdownMenuItem>
                                  ))}
                                </DropdownMenuSubContent>
                              </DropdownMenuSub>
                            );
                          })}
                        </DropdownMenuSubContent>
                      </DropdownMenuSub>
                    </>
                  );
                })()}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Pending Skill Pills */}
            {pendingSkills.length > 0 && pendingSkills.map(skill => (
              <div key={skill.id} className="flex items-center gap-1.5 bg-muted text-foreground text-xs font-medium px-2.5 py-1 rounded-md border border-border shadow-sm animate-in fade-in zoom-in-95 duration-200">
                <span>{skill.name}</span>
                <button
                  type="button"
                  onClick={() => setPendingSkills(prev => prev.filter(s => s.id !== skill.id))}
                  className="hover:bg-destructive/10 rounded-sm p-0.5 text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            {/* Pinned MCP Pill */}
            {pinnedMcp && (
              <div className="flex items-center gap-1.5 bg-accent/70 hover:bg-accent text-foreground text-xs font-semibold px-2.5 py-1 rounded-full border border-border shadow-sm animate-in fade-in zoom-in-95 duration-200">
                <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-sm overflow-hidden bg-muted">
                  {pinnedMcp.icon ? (
                    <img src={pinnedMcp.icon} alt={pinnedMcp.name} className="h-full w-full object-cover" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>
                  )}
                </div>
                <span>{pinnedMcp.name}</span>
                <button 
                  type="button" 
                  onClick={handleUnpinMcp}
                  className="hover:bg-destructive/20 rounded-full p-0.5 text-muted-foreground hover:text-destructive transition-colors ml-0.5"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            )}
          </div>

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileUpload}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.json,.md,.js,.ts,.tsx,.jsx,image/*,audio/*,video/*"
            />

            <div className="flex items-center gap-1.5">
              <ModelSelector placement="top" />

              {currentProviderId === "nvidia" && hasVariants && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground capitalize cursor-pointer"
                    >
                      {currentSizeLevel}
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><path d="m6 9 6 6 6-6" /></svg>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-32 bg-popover text-popover-foreground shadow-md p-1 z-[110]" sideOffset={8}>
                    {activeLevels.map(({ level, slug }) => {
                      const active = currentSizeLevel === level;
                      return (
                        <DropdownMenuItem
                          key={level}
                          onSelect={() => {
                            if (slug) {
                              settings.setAIProvider({
                                ...settings.aiProvider,
                                model: slug
                              });
                            }
                          }}
                          className={`flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium cursor-pointer capitalize ${active ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}
                        >
                          <span>{level}</span>
                          {active && (
                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground"><path d="M20 6 9 17l-5-5" /></svg>
                          )}
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}

              {/* Send / Stop button */}
              {isSending ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-destructive text-white transition-colors hover:opacity-90"
                  title="Stop generating"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect x="6" y="6" width="12" height="12" rx="2" ry="2" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  disabled={disabled || !value.trim()}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                  title="Send"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="m5 12 7-7 7 7" />
                    <path d="M12 19V5" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
