import { useState, useRef, useCallback, useEffect } from "react";
import { useSettingsStore } from "@/stores/settings";
import { parseFileContent, generatePdfPreview } from "@/lib/file-parser";
import { uploadFileToSupabase } from "@/lib/supabase";
import { Loader, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat";
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
}

interface Attachment {
  id: string;
  file: File;
  previewUrl: string | null;
  extractedText: string;
  extension: string;
  status: 'idle' | 'uploading' | 'error';
}

export function ChatInput({ onSend, onStop, disabled, isSending, initialValue, isIncognito }: ChatInputProps) {
  const [value, setValue] = useState(initialValue || "");
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const settings = useSettingsStore();
  const [isParsing, setIsParsing] = useState(false);
  const activeConversationId = useChatStore(s => s.activeConversationId) || 'new';
  const rateLimitResetTime = useChatStore(s => s.rateLimitResetTime);

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
    clearDraftAttachments(activeConversationId);
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
  }, [value, disabled, attachments, onSend]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
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

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 160) + "px";
    }
  }, [value]);

  return (
    <div className="bg-transparent px-4 pb-4 pt-2">
      <div className="mx-auto max-w-3xl flex flex-col">
        {rateLimitResetTime && (
          <div className="bg-[#a3a3a3] dark:bg-[#4a4a4a] text-black dark:text-white/80 text-[13px] px-5 py-2.5 rounded-t-xl border border-b-0 border-input font-medium flex items-center">
            You're out of messages for today, come back tomorrow at {rateLimitResetTime}.
          </div>
        )}
        <div className={cn("border border-input bg-input-bg shadow-sm", rateLimitResetTime ? "rounded-b-xl" : "squircle-mask squircle-2xl", isIncognito && "border-dotted border-[2px]")}>
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

          {/* Textarea row */}
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
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
              <ModelSelector placement="top" />

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
