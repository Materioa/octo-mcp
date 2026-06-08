import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import React, { useState, useRef, useEffect, useMemo } from "react";
import type { Message } from "@/types";
import { ToolCallGroup } from "./ToolCallCard";
import { AskUserInputCard } from "./AskUserInputCard";
import { DiagramRenderer } from "@/components/diagrams/DiagramRenderer";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat";
import { DownloadIcon, FileIcon, FileTextIcon, Copy, Pencil, Trash2, AlertCircle, ThumbsUp, ThumbsDown, RotateCcw, ChevronLeft, ChevronRight } from "lucide-react";
import { useSettingsStore } from "@/stores/settings";
import { getPreset } from "@/lib/providers/presets";
import { OriginalThinkingLoader } from "./OriginalThinkingLoader";
import { ThinkingView } from "./ThinkingView";

function formatModelName(model: string): string {
  const map: Record<string, string> = {
    "openai/gpt-oss-120b:free": "GPT OSS",
    "google/gemma-4-31b-it:free": "Gemma 4",
    "meta-llama/llama-3.3-70b-instruct:free": "Llama 3.3",
    "z-ai/glm-4.5-air:free": "GLM 4.5 Air",
    "deepseek/deepseek-v4-flash:free": "DeepSeek v4",
    "minimax/minimax-m2.5:free": "MiniMax M2.5",
    "nvidia/nemotron-3-nano-30b-a3b:free": "Nemotron 3 Nano",
    "openrouter/free": "Best"
  };
  return map[model] || model;
}

interface MessageBubbleProps {
  message: Message;
  onRetry?: (msgId: string, modelOverride: string) => void;
  isLastUserMessage?: boolean;
  prevSiblingId?: string;
  nextSiblingId?: string;
  siblingIndex?: number;
  siblingCount?: number;
}

export const MessageBubble = React.memo(function MessageBubble({ 
  message, 
  onRetry,
  isLastUserMessage,
  prevSiblingId,
  nextSiblingId,
  siblingIndex,
  siblingCount
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const updateMessage = useChatStore(s => s.updateMessage);
  const setActiveDocument = useChatStore(s => s.setActiveDocument);
  const branchMessage = useChatStore(s => s.branchMessage);
  const deleteMessage = useChatStore(s => s.deleteMessage);
  const switchBranch = useChatStore(s => s.switchBranch);
  const settings = useSettingsStore();
  const [retryOpen, setRetryOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  
  const [showMobileActions, setShowMobileActions] = useState(false);
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTouchStart = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
    longPressTimer.current = setTimeout(() => {
      setShowMobileActions(true);
    }, 800);
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) clearTimeout(longPressTimer.current);
  };
  
  // Shimmering loader state
  const [shimmerIndex, setShimmerIndex] = useState(0);
  const shimmerPhrases = [
    "Cooking up a response...",
    "Thinklet is thinking...",
    "Brewing a response...",
    "Calling tools...",
    "Big thoughts take time...",
    "Analyzing context...",
    "Reasoning deeply..."
  ];

  useEffect(() => {
    if (message.isStreaming && !message.content && !message.toolCalls?.length) {
      const interval = setInterval(() => {
        setShimmerIndex(i => (i + 1) % shimmerPhrases.length);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [message.isStreaming, message.content, message.toolCalls]);
  
  const hasSiblings = !!(prevSiblingId || nextSiblingId);
  
  const handleEditSubmit = async () => {
    if (editContent.trim() && editContent !== message.content) {
      await branchMessage(message.id, editContent);
    }
    setIsEditing(false);
  };

  useEffect(() => {
    setIsDark(document.documentElement.classList.contains("dark"));
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.classList.contains("dark"));
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  // Parse thoughts from content
  const content = message.content || "";
  let cleanContent = content;
  const thoughts: string[] = [];

  const thinkRegex = /<(?:thought|think)>([\s\S]*?)<\/(?:thought|think)>/gi;
  let match;
  while ((match = thinkRegex.exec(content)) !== null) {
    if (match[1]?.trim()) thoughts.push(match[1].trim());
  }
  cleanContent = cleanContent.replace(/<(?:thought|think)>[\s\S]*?<\/(?:thought|think)>/gi, "").trim();

  // Handle unclosed tag (both streaming and non-streaming)
  const unclosedThinkRegex = /<(?:thought|think)>([\s\S]*)$/i;
  if (unclosedThinkRegex.test(cleanContent)) {
    const unclosedMatch = cleanContent.match(unclosedThinkRegex);
    if (unclosedMatch && unclosedMatch[1]?.trim()) {
      let unclosedText = unclosedMatch[1].trim();

      if (!message.isStreaming) {
        // Heuristically split unclosed thought if it contains common response headers
        // We look for \n\n or a period followed by common transition phrases
        const splitRegex = /(?:\n\n|\.\s*)(?=Here is|I will now|Sure|Let me|Let's|Here's)/i;
        const splitMatch = unclosedText.match(splitRegex);
        
        if (splitMatch && splitMatch.index !== undefined) {
          const splitIndex = splitMatch.index;
          thoughts.push(unclosedText.substring(0, splitIndex).trim());
          cleanContent = cleanContent.replace(unclosedThinkRegex, "").trim() + "\n\n" + unclosedText.substring(splitIndex).trim();
        } else {
          thoughts.push(unclosedText);
          cleanContent = cleanContent.replace(unclosedThinkRegex, "").trim();
        }
      } else {
        thoughts.push(unclosedText);
        cleanContent = cleanContent.replace(unclosedThinkRegex, "").trim();
      }
    }
  }

  // If the model wrapped the ENTIRE response in a thought block (meaning cleanContent is completely empty after parsing, 
  // but thoughts exist), AND the stream is finished, we should restore potentialClean to the full content so the user can see it.
  // But we also KEEP the thoughts array so the thought process block doesn't vanish.
  if (cleanContent.length === 0 && thoughts.length > 0 && !message.isStreaming) {
    cleanContent = content;
  }

  // Clean any stray closing tags that leaked into the content
  cleanContent = cleanContent.replace(/<\/(?:thought|think)>/gi, "").trim();

  const markdownComponents = useMemo(() => ({
    a(props: any) {
      const { href, children, ...rest } = props;
      
      // Check if it's our special [Document: format | title](url) syntax
      if (typeof children === 'string' && children.startsWith('Document:')) {
        const parts = children.split('|').map((s: string) => s.trim());
        const format = parts[0]?.replace('Document:', '').trim() || '';
        const title = parts[1] || 'Document';
        
        return (
          <span 
            className="my-4 flex items-center justify-between rounded-xl border border-border bg-card p-4 shadow-sm transition-colors hover:bg-accent/50 max-w-sm cursor-pointer" 
            onClick={() => setActiveDocument({ url: href!, format, title })}
          >
            <span className="flex items-center gap-3 overflow-hidden">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                {format === 'pdf' ? <FileIcon className="h-5 w-5" /> : <FileTextIcon className="h-5 w-5" />}
              </span>
              <span className="overflow-hidden flex flex-col">
                <span className="truncate font-medium text-sm leading-tight text-foreground block">{title}</span>
                <span className="truncate text-xs text-muted-foreground uppercase mt-0.5 block">Document · {format}</span>
              </span>
            </span>
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-input bg-background px-3 text-xs font-medium shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground"
              onClick={(e) => e.stopPropagation()}
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              Download
            </a>
          </span>
        );
      }

      return <a href={href} target="_blank" rel="noreferrer" {...rest}>{children}</a>;
    },
    table({ children }: any) {
      return (
        <div className="overflow-x-auto my-6 rounded-md border border-border">
          <table className="w-full border-collapse text-sm text-left">
            {children}
          </table>
        </div>
      );
    },
    thead({ children }: any) {
      return <thead className="bg-muted/50">{children}</thead>;
    },
    th({ children }: any) {
      return <th className="border border-border px-4 py-2.5 font-semibold text-foreground">{children}</th>;
    },
    td({ children }: any) {
      return <td className="border border-border px-4 py-2.5">{children}</td>;
    },
    tr({ children }: any) {
      return <tr className="hover:bg-muted/30 transition-colors">{children}</tr>;
    },
    code({ className, children, ...props }: any) {
      const match = /language-(\w+)/.exec(className || "");
      const lang = match?.[1];
      const codeStr = String(children).replace(/\n$/, "");

      if (lang && ["mermaid", "dot", "graphviz", "python", "javascript", "js", "html", "react", "jsx", "tsx", "markmap", "mindmap"].includes(lang)) {
        return (
          <DiagramRenderer
            code={codeStr}
            language={lang}
            isStreaming={message.isStreaming}
          />
        );
      }

      const isInline = !className;
      if (isInline) {
        return (
          <code
            className="rounded bg-muted-foreground/20 px-1 py-0.5 text-xs font-mono"
            {...props}
          >
            {children}
          </code>
        );
      }

      return (
        <div className="relative rounded-lg overflow-hidden my-4 group border border-border shadow-sm">
          <div className="flex items-center justify-between px-4 py-1.5 bg-muted/50 border-b border-border/50 text-xs font-medium text-muted-foreground">
            <span>{lang || "code"}</span>
            <button
              onClick={() => {
                navigator.clipboard.writeText(codeStr);
                // could add a mini copied state here
              }}
              className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-foreground flex items-center gap-1"
            >
              <Copy className="w-3 h-3" />
              Copy
            </button>
          </div>
          <SyntaxHighlighter
            style={isDark ? oneDark : oneLight}
            language={lang}
            PreTag="div"
            className="!m-0 !bg-card text-sm"
            customStyle={{ padding: '1rem', background: 'transparent' }}
            {...props}
          >
            {codeStr}
          </SyntaxHighlighter>
        </div>
      );
    }
  }), [isDark, message.isStreaming, setActiveDocument]);

  return (
    <div className={cn("flex w-full flex-col", isUser ? "items-end" : "items-start")}>
      {message.attachments && message.attachments.length > 0 && isUser && (
        <div className="flex flex-wrap gap-2 mb-2 max-w-[80%] justify-end">
          {message.attachments.map((att) => (
            <div key={att.id} className="relative h-16 w-16 shrink-0 rounded-xl border border-border bg-background overflow-hidden shadow-sm">
              {(() => {
                const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(att.extension?.toLowerCase() || '');
                const imgSrc = isImage ? att.url : att.previewUrl;
                return imgSrc ? (
                  <img src={imgSrc} alt="Preview" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-xs font-bold uppercase text-muted-foreground">
                    {att.extension}
                  </div>
                );
              })()}
            </div>
          ))}
        </div>
      )}
      <div
        className={cn(
          "flex w-full",
          isUser ? "justify-end" : "justify-start"
        )}
      >
        <div
          className={cn(
            isUser
              ? "max-w-[80%]"
              : "py-3 w-full max-w-none text-foreground"
          )}
        >
        {isUser ? (
          <div 
            className="group relative"
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onTouchMove={handleTouchEnd}
            onClick={() => {
              if (window.innerWidth < 768) {
                setShowMobileActions(!showMobileActions);
              }
            }}
          >
            <div className="squircle-mask squircle-2xl bg-muted px-4 py-3 text-foreground">
              {isEditing ? (
              <div className="flex flex-col">
                <textarea
                  className="w-full min-w-[250px] sm:min-w-[350px] md:min-w-[450px] min-h-[20px] resize-none bg-transparent text-foreground p-0 text-sm focus:outline-none focus:ring-0 overflow-hidden"
                  value={editContent}
                  onChange={(e) => {
                    setEditContent(e.target.value);
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleEditSubmit();
                    } else if (e.key === 'Escape') {
                      setIsEditing(false);
                    }
                  }}
                  onFocus={(e) => {
                    e.target.style.height = 'auto';
                    e.target.style.height = e.target.scrollHeight + 'px';
                    // place cursor at end
                    e.target.setSelectionRange(e.target.value.length, e.target.value.length);
                  }}
                  autoFocus
                />
                <div className="flex justify-end gap-2 mt-3">
                  <button 
                    onClick={() => setIsEditing(false)}
                    className="px-3 py-1.5 text-[13px] font-medium rounded-md text-muted-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleEditSubmit}
                    className="px-3 py-1.5 text-[13px] font-medium bg-brand text-white rounded-md hover:bg-brand/90 transition-colors"
                  >
                    Send
                  </button>
                </div>
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm">{message.content}</p>
            )}
            </div>
            
            {!isEditing && (
              <div className={cn(
                "absolute -bottom-6 right-0 transition-opacity flex gap-1 bg-background/80 backdrop-blur rounded p-1 border border-border shadow-sm",
                showMobileActions ? "opacity-100" : "opacity-0 group-hover:opacity-100"
              )}>
                <button 
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent"
                  onClick={() => {
                    navigator.clipboard.writeText(message.content);
                    setShowMobileActions(false);
                  }}
                  title="Copy"
                >
                  <Copy className="w-3 h-3" />
                </button>
                <button 
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent"
                  title="Edit"
                  onClick={() => { setEditContent(message.content); setIsEditing(true); setShowMobileActions(false); }}
                >
                  <Pencil className="w-3 h-3" />
                </button>
                {isLastUserMessage && (
                  <button 
                    className="p-1 text-muted-foreground hover:text-red-500 transition-colors rounded hover:bg-red-500/10"
                    title="Undo turn (Deletes message and response)"
                    onClick={() => {
                      deleteMessage(message.id);
                      setShowMobileActions(false);
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
        ) : (
          <>

            {thoughts.length > 0 && (
              <ThinkingView thoughts={thoughts} isStreaming={message.isStreaming} />
            )}

            {message.toolCalls && message.toolCalls.length > 0 && (
              <>
                {(() => {
                  const askUserInputCalls = message.toolCalls!.filter((tc) => tc.name === "ask_user_input_v0");
                  const otherToolCalls = message.toolCalls!.filter((tc) => tc.name !== "ask_user_input_v0");
                  
                  return (
                    <>
                      {otherToolCalls.length > 0 && <ToolCallGroup toolCalls={otherToolCalls} />}
                      {askUserInputCalls.map((tc) => (
                        <AskUserInputCard key={tc.id} toolCall={tc} />
                      ))}
                    </>
                  );
                })()}
              </>
            )}
            
            {cleanContent && (
              <div className="prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0 [&>*:not(:first-child)]:mt-4 [&>*:not(:last-child)]:mb-4">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={markdownComponents as any}
                >
                  {cleanContent
                    .replace(/\\\[/g, "$$")
                    .replace(/\\\]/g, "$$")
                    .replace(/\\\(/g, "$")
                    .replace(/\\\)/g, "$")}
                </ReactMarkdown>
              </div>
            )}
            {message.isStreaming && !message.content && !message.toolCalls?.length && (
              <div className="flex items-center gap-3 px-1 pt-2 pb-1 text-muted-foreground animate-in fade-in duration-500">
                <OriginalThinkingLoader className="w-7 h-7" />
                <span key={shimmerIndex} className="text-sm font-medium tracking-wide animate-shimmer-text">
                  {shimmerPhrases[shimmerIndex]}
                </span>
              </div>
            )}
            
            {/* Internal error rendering removed in favor of global alerts */}
            
            {!isUser && !message.isStreaming && (
              <div className="mt-4 flex items-center gap-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
                <button
                  onClick={() => updateMessage(message.id, { rating: message.rating === "like" ? null : "like" })}
                  className={cn("p-1 hover:bg-accent rounded transition-colors", message.rating === "like" && "text-primary bg-accent")}
                  title="Good response"
                >
                  <ThumbsUp className="w-3.5 h-3.5" fill={message.rating === "like" ? "currentColor" : "none"} />
                </button>
                <button
                  onClick={() => updateMessage(message.id, { rating: message.rating === "dislike" ? null : "dislike" })}
                  className={cn("p-1 hover:bg-accent rounded transition-colors", message.rating === "dislike" && "text-destructive bg-accent")}
                  title="Bad response"
                >
                  <ThumbsDown className="w-3.5 h-3.5" fill={message.rating === "dislike" ? "currentColor" : "none"} />
                </button>
                
                <button
                  onClick={() => navigator.clipboard.writeText(message.content)}
                  className="p-1 hover:bg-accent rounded transition-colors"
                  title="Copy"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
                

                <div className="relative">
                  <button 
                    onClick={() => setRetryOpen(!retryOpen)}
                    className="p-1 hover:bg-accent rounded transition-colors flex items-center gap-1"
                    title="Retry"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                  </button>
                  
                  {retryOpen && (
                    <div className="absolute top-full left-0 mt-1 w-48 bg-card border border-border rounded-lg shadow-lg py-1 z-50">
                      <div className="px-3 py-1 text-[10px] uppercase font-semibold text-muted-foreground">Retry using...</div>
                      {settings.aiProvider.providerId === "openrouter-free" ? (
                        [
                          "openai/gpt-oss-120b:free",
                          "google/gemma-4-31b-it:free",
                          "meta-llama/llama-3.3-70b-instruct:free",
                          "z-ai/glm-4.5-air:free",
                          "deepseek/deepseek-v4-flash:free",
                          "minimax/minimax-m2.5:free",
                          "nvidia/nemotron-3-nano-30b-a3b:free",
                          "openrouter/free"
                        ].map(model => (
                          <button
                            key={model}
                            className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent transition-colors"
                            onClick={() => {
                              setRetryOpen(false);
                              onRetry?.(message.id, model);
                            }}
                          >
                            {formatModelName(model)}
                          </button>
                        ))
                      ) : (
                        (() => {
                          const preset = getPreset(settings.aiProvider.providerId);
                          const currentModel = settings.aiProvider.model;
                          const modelsToDisplay = [currentModel, ...preset.models.filter(m => m !== currentModel)];
                          return modelsToDisplay.filter((v, i, a) => a.indexOf(v) === i).map(model => (
                            <button
                              key={model}
                              className={cn(
                                "w-full text-left px-3 py-1.5 text-xs transition-colors",
                                model === currentModel ? "bg-primary/10 text-primary font-medium" : "hover:bg-accent text-foreground"
                              )}
                              onClick={() => {
                                setRetryOpen(false);
                                onRetry?.(message.id, model);
                              }}
                            >
                              {formatModelName(model)} {model === currentModel && "(Current)"}
                            </button>
                          ));
                        })()
                      )}
                    </div>
                  )}
                </div>
                
                {message.modelUsed && (
                  <span className="ml-auto opacity-70 italic text-[10px] model-name">
                    Generated by {formatModelName(message.modelUsed)}
                  </span>
                )}
              </div>
            )}
          </>
        )}
        </div>
      </div>
      
      {hasSiblings && (
        <div className={cn("flex mt-1 text-xs text-muted-foreground gap-2 items-center", isUser ? "justify-end" : "justify-start")}>
          <div className="flex items-center gap-1.5 px-1">
            <button
              onClick={() => prevSiblingId && switchBranch(prevSiblingId)}
              disabled={!prevSiblingId}
              className="p-1 hover:bg-accent rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Previous Version"
            >
              <ChevronLeft className="w-3 h-3" />
            </button>
            <span className="text-[10px] font-medium text-muted-foreground w-8 text-center">
              {siblingIndex !== undefined && siblingCount !== undefined ? `${siblingIndex + 1} / ${siblingCount}` : 'Versions'}
            </span>
            <button
              onClick={() => nextSiblingId && switchBranch(nextSiblingId)}
              disabled={!nextSiblingId}
              className="p-1 hover:bg-accent rounded disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title="Next Version"
            >
              <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
});
