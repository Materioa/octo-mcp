import { useState, useRef, useCallback, useEffect } from "react";
import { useSettingsStore } from "@/stores/settings";
import { getPreset } from "@/lib/providers/presets";
import { parseFileContent, generatePdfPreview } from "@/lib/file-parser";
import { uploadFileToSupabase } from "@/lib/supabase";
import { Loader, X } from "lucide-react";
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

interface ChatInputProps {
  onSend: (message: string, attachments?: any[]) => void;
  onStop: () => void;
  disabled?: boolean;
  isSending?: boolean;
  initialValue?: string;
}

interface Attachment {
  id: string;
  file: File;
  previewUrl: string | null;
  extractedText: string;
  extension: string;
  status: 'idle' | 'uploading' | 'error';
}

export function ChatInput({ onSend, onStop, disabled, isSending, initialValue }: ChatInputProps) {
  const [value, setValue] = useState(initialValue || "");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [modelSelectorMounted, setModelSelectorMounted] = useState(false);
  const [modelSelectorClosing, setModelSelectorClosing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const settings = useSettingsStore();
  const preset = getPreset(settings.aiProvider.providerId ?? "openrouter");
  const [isParsing, setIsParsing] = useState(false);

  useEffect(() => {
    if (initialValue) {
      setValue(initialValue);
    }
  }, [initialValue]);

  useEffect(() => {
    const handleSetQuery = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail) {
        setValue(customEvent.detail);
      }
    };
    window.addEventListener("materio-set-query", handleSetQuery);
    return () => window.removeEventListener("materio-set-query", handleSetQuery);
  }, []);

  const closeModelSelector = useCallback(() => {
    setModelSelectorClosing(true);
    setModelSelectorOpen(false);
    setTimeout(() => {
      setModelSelectorMounted(false);
      setModelSelectorClosing(false);
    }, 200);
  }, []);

  const toggleModelSelector = useCallback(() => {
    if (modelSelectorOpen) {
      closeModelSelector();
    } else {
      setModelSelectorMounted(true);
      setModelSelectorOpen(true);
    }
  }, [modelSelectorOpen, closeModelSelector]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        if (modelSelectorOpen) closeModelSelector();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [modelSelectorOpen, closeModelSelector]);

  /** Derive a short display name from the model string */
  const modelDisplay = (() => {
    const m = settings.aiProvider.model;
    // Strip provider prefix (e.g. "anthropic/claude-sonnet-4" → "claude-sonnet-4")
    const short = m.includes("/") ? m.split("/").pop()! : m;
    // Prettify common patterns
    return short
      .replace(/-instruct$/i, "")
      .replace(/-20\d{6}$/, "")
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  })();

  const handleSend = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed && attachments.length === 0) return;
    if (disabled) return;

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

    onSend(trimmed, uploadedAttachments);
    setValue("");
    setAttachments([]);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, attachments, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

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
    } catch (err: any) {
      alert(`Failed to parse file: ${err.message}`);
      setAttachments(prev => prev.filter(a => a.id !== id));
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
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
    <div className="bg-background px-4 pb-4 pt-2">
      <div className="mx-auto max-w-3xl">
        <div className="rounded-2xl border border-input bg-input-bg shadow-sm">
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
                      onClick={() => setAttachments(prev => prev.filter(a => a.id !== att.id))}
                      className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/80"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Textarea row */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Write a message…"
            disabled={disabled}
            rows={1}
            className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[15px] leading-relaxed placeholder:text-muted-foreground focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
            style={{ minHeight: "44px", maxHeight: "160px" }}
          />

          {/* Bottom action row */}
          <div className="flex items-center justify-between px-3 pb-3">
            {/* Left: attach / plus */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={`flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground ${isParsing ? 'animate-pulse' : ''}`}
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
                  <div className={`w-8 h-4 rounded-full transition-colors flex items-center px-0.5 ${settings.exaSearchEnabled ? 'bg-orange-500' : 'bg-muted-foreground/30'}`}>
                    <div className={`w-3 h-3 rounded-full bg-background transition-transform ${settings.exaSearchEnabled ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </DropdownMenuItem>

                {settings.skills.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M12 2v20" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
                        Load Skill
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        {settings.skills.map((skill) => (
                          <DropdownMenuItem
                            key={skill.id}
                            onClick={() => setValue(prev => prev + (prev.trim() ? '\n\n' : '') + `<skill name="${skill.name}">\n${skill.content}\n</skill>\n`)}
                          >
                            {skill.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              onChange={handleFileUpload}
              accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.json,.md,.js,.ts,.tsx,.jsx,image/*,audio/*,video/*"
            />

            <div className="flex items-center gap-1.5">
              {/* Custom Model selector */}
              <div className="relative" ref={dropdownRef}>
                <button
                  type="button"
                  onClick={toggleModelSelector}
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                >
                  {(() => {
                    const m = settings.aiProvider.model;
                    if (m === "openai/gpt-oss-120b:free") return "GPT OSS";
                    if (m === "google/gemma-4-31b-it:free") return "Gemma 4";
                    if (m === "meta-llama/llama-3.3-70b-instruct:free") return "Llama 3.3";
                    if (m === "z-ai/glm-4.5-air:free") return "GLM 4.5 Air";
                    if (m === "deepseek/deepseek-v4-flash:free") return "DeepSeek v4";
                    if (m === "minimax/minimax-m2.5:free") return "MiniMax M2.5";
                    if (m === "nvidia/nemotron-3-nano-30b-a3b:free" || m === "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free") return "Nemotron 3 Nano";
                    if (m === "moonshotai/kimi-k2.6:free") return "Kimi K2.6";
                    if (m === "openrouter/free") return "Best";
                    return modelDisplay;
                  })()}
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><path d="m6 9 6 6 6-6" /></svg>
                </button>

                {modelSelectorMounted && (
                  <>
                    <div 
                      className={`fixed inset-0 bg-black/60 z-[55] sm:hidden transition-opacity duration-200 ${modelSelectorClosing ? "opacity-0" : "opacity-100"}`}
                      onClick={closeModelSelector}
                    />
                    <div className={`fixed inset-x-0 bottom-0 w-full rounded-t-3xl sm:rounded-xl border border-border bg-card p-3 sm:p-1 shadow-lg z-[60] pb-8 sm:pb-0 sm:absolute sm:bottom-full sm:right-0 sm:mb-2 sm:w-56 sm:left-auto duration-200 fill-mode-forwards ${modelSelectorClosing ? "animate-out fade-out slide-out-to-bottom-full sm:slide-out-to-bottom-2" : "animate-in fade-in slide-in-from-bottom-full sm:slide-in-from-bottom-2"}`}>
                      <div className="sm:hidden w-full flex justify-center pt-2 pb-4">
                        <div className="w-12 h-1.5 rounded-full bg-muted-foreground/30" />
                      </div>
                      <div className="max-h-[60vh] sm:max-h-60 overflow-y-auto p-1 space-y-1 sm:space-y-0">
                      {(() => {
                        const currentModel = settings.aiProvider.model;
                        const modelsToDisplay = [currentModel, ...preset.models.filter(m => m !== currentModel)];
                        return modelsToDisplay.filter(m => m !== "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free").filter((v, i, a) => a.indexOf(v) === i).map((m) => {
                          let label = m;
                        if (m === "openai/gpt-oss-120b:free") label = "GPT OSS";
                        else if (m === "google/gemma-4-31b-it:free") label = "Gemma 4";
                        else if (m === "meta-llama/llama-3.3-70b-instruct:free") label = "Llama 3.3";
                        else if (m === "z-ai/glm-4.5-air:free") label = "GLM 4.5 Air";
                        else if (m === "deepseek/deepseek-v4-flash:free") label = "DeepSeek v4";
                        else if (m === "minimax/minimax-m2.5:free") label = "MiniMax M2.5";
                        else if (m === "nvidia/nemotron-3-nano-30b-a3b:free") label = "Nemotron 3 Nano";
                        else if (m === "moonshotai/kimi-k2.6:free") label = "Kimi k2.6";
                        else if (m === "openrouter/free") label = "Best";
                        else {
                          const short = m.includes("/") ? m.split("/").pop()! : m;
                          label = short
                            .replace(/-instruct$/i, "")
                            .replace(/-20\d{6}$/, "")
                            .split("-")
                            .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                            .join(" ");
                        }

                        let isSelected = settings.aiProvider.model === m;
                        if (m === "nvidia/nemotron-3-nano-30b-a3b:free" && settings.aiProvider.model === "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free") {
                          isSelected = true;
                        }

                        return (
                          <div key={m} className="flex flex-col">
                            <button
                              className={`flex w-full items-center justify-between rounded-xl sm:rounded-md px-4 sm:px-3 py-3 sm:py-2 text-[16px] sm:text-sm font-medium transition-colors ${isSelected ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                                }`}
                              onClick={() => {
                                if (m === "nvidia/nemotron-3-nano-30b-a3b:free" && isSelected) {
                                  // Don't do anything if they click the already selected parent button
                                } else {
                                  settings.setAIProvider({ ...settings.aiProvider, model: m });
                                  closeModelSelector();
                                }
                              }}
                            >
                              <span>{label}</span>
                              {isSelected && (
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground"><path d="M20 6 9 17l-5-5" /></svg>
                              )}
                            </button>

                            {m === "nvidia/nemotron-3-nano-30b-a3b:free" && isSelected && (
                              <div className="flex items-center justify-between px-3 py-1.5 mx-2 mt-1 mb-1 rounded bg-secondary/30">
                                <span className="text-[11px] text-muted-foreground font-medium">Reasoning Mode</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const isReasoning = settings.aiProvider.model === "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
                                    settings.setAIProvider({
                                      ...settings.aiProvider,
                                      model: isReasoning ? "nvidia/nemotron-3-nano-30b-a3b:free" : "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free"
                                    });
                                  }}
                                  className={`relative inline-flex h-3.5 w-6 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                                    settings.aiProvider.model === "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" ? 'bg-brand' : 'bg-muted-foreground/30'
                                  }`}
                                >
                                  <span
                                    className={`pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                                      settings.aiProvider.model === "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" ? 'translate-x-2.5' : 'translate-x-0'
                                    }`}
                                  />
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      });
                      })()}
                      </div>
                    </div>
                  </>
                )}
              </div>

              {/* Send / Stop button */}
              {isSending ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-destructive text-white transition-colors hover:opacity-90"
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
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
