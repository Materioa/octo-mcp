import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark, oneLight } from "react-syntax-highlighter/dist/esm/styles/prism";
import { useState, useRef, useEffect } from "react";
import type { Message } from "@/types";
import { ToolCallGroup } from "./ToolCallCard";
import { DiagramRenderer } from "@/components/diagrams/DiagramRenderer";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat";
import { useSettingsStore } from "@/stores/settings";
import { OriginalThinkingLoader } from "./OriginalThinkingLoader";

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
}

export function MessageBubble({ message, onRetry }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const { updateMessage, branchMessage, switchBranch, allMessages } = useChatStore();
  const settings = useSettingsStore();
  const [retryOpen, setRetryOpen] = useState(false);
  const [isDark, setIsDark] = useState(false);
  
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);

  const siblings = allMessages.filter(m => m.parentId === message.parentId && m.role === message.role).sort((a, b) => a.timestamp - b.timestamp);
  const siblingIndex = siblings.findIndex(m => m.id === message.id);
  
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

  return (
    <div className={cn("flex w-full flex-col", isUser ? "items-end" : "items-start")}>
      {message.attachments && message.attachments.length > 0 && isUser && (
        <div className="flex flex-wrap gap-2 mb-2 max-w-[80%] justify-end">
          {message.attachments.map((att) => (
            <div key={att.id} className="relative h-16 w-16 shrink-0 rounded-xl border border-border bg-background overflow-hidden shadow-sm">
              {att.previewUrl ? (
                <img src={att.previewUrl} alt="Preview" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-bold uppercase text-muted-foreground">
                  {att.extension}
                </div>
              )}
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
            "py-3",
            isUser
              ? "max-w-[80%] rounded-2xl bg-muted px-4 text-foreground"
              : "w-full max-w-none text-foreground"
          )}
        >
        {isUser ? (
          <div className="group relative">
            {isEditing ? (
              <div className="flex flex-col">
                <textarea
                  className="w-full min-h-[20px] resize-none bg-transparent text-foreground p-0 text-sm focus:outline-none focus:ring-0 overflow-hidden"
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
              </div>
            ) : (
              <p className="whitespace-pre-wrap text-sm">{message.content}</p>
            )}
            
            {!isEditing && (
              <div className="absolute -bottom-6 right-0 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1 bg-background/80 backdrop-blur rounded p-1 border border-border shadow-sm">
                <button 
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent"
                  onClick={() => navigator.clipboard.writeText(message.content)}
                  title="Copy"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                </button>
                <button 
                  className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded hover:bg-accent"
                  title="Edit"
                  onClick={() => { setEditContent(message.content); setIsEditing(true); }}
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {message.toolCalls && message.toolCalls.length > 0 && (
              <ToolCallGroup toolCalls={message.toolCalls} />
            )}
            {message.content && (
              <div className="prose dark:prose-invert max-w-none prose-p:leading-relaxed prose-pre:p-0 [&>*:not(:first-child)]:mt-4 [&>*:not(:last-child)]:mb-4">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex]}
                  components={{
                    table({ children }) {
                      return (
                        <div className="overflow-x-auto my-6 rounded-md border border-border">
                          <table className="w-full border-collapse text-sm text-left">
                            {children}
                          </table>
                        </div>
                      );
                    },
                    thead({ children }) {
                      return <thead className="bg-muted/50">{children}</thead>;
                    },
                    th({ children }) {
                      return <th className="border border-border px-4 py-2.5 font-semibold text-foreground">{children}</th>;
                    },
                    td({ children }) {
                      return <td className="border border-border px-4 py-2.5">{children}</td>;
                    },
                    tr({ children }) {
                      return <tr className="hover:bg-muted/30 transition-colors">{children}</tr>;
                    },
                    code({ className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || "");
                      const lang = match?.[1];
                      const codeStr = String(children).replace(/\n$/, "");

                      if (lang && ["mermaid", "dot", "graphviz", "python", "javascript", "js"].includes(lang)) {
                        return (
                          <DiagramRenderer
                            code={codeStr}
                            language={lang}
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
                              <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                              Copy
                            </button>
                          </div>
                          <SyntaxHighlighter
                            style={(isDark ? oneDark : oneLight) as any}
                            language={lang || "text"}
                            PreTag="div"
                            customStyle={{ margin: 0, background: isDark ? "#282c34" : "#fafafa", padding: "1rem", fontSize: "0.85rem" }}
                            {...(props as any)}
                          >
                            {codeStr}
                          </SyntaxHighlighter>
                        </div>
                      );
                    },
                  }}
                >
                  {message.content
                    .replace(/\\\[/g, "$$")
                    .replace(/\\\]/g, "$$")
                    .replace(/\\\(/g, "$")
                    .replace(/\\\)/g, "$")}
                </ReactMarkdown>
              </div>
            )}
            {message.isStreaming && !message.content && !message.toolCalls?.length && (
              <div className="flex px-1 pt-2 pb-1">
                <OriginalThinkingLoader className="w-12 h-12 text-muted-foreground" />
              </div>
            )}
            
            {!isUser && !message.isStreaming && (
              <div className="mt-4 flex items-center gap-2 pt-2 border-t border-border/50 text-xs text-muted-foreground">
                <button
                  onClick={() => updateMessage(message.id, { rating: message.rating === "like" ? null : "like" })}
                  className={cn("p-1 hover:bg-accent rounded transition-colors", message.rating === "like" && "text-primary bg-accent")}
                  title="Good response"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={message.rating === "like" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2h0a3.13 3.13 0 0 1 3 3.88Z"/></svg>
                </button>
                <button
                  onClick={() => updateMessage(message.id, { rating: message.rating === "dislike" ? null : "dislike" })}
                  className={cn("p-1 hover:bg-accent rounded transition-colors", message.rating === "dislike" && "text-destructive bg-accent")}
                  title="Bad response"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill={message.rating === "dislike" ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 14V2"/><path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22h0a3.13 3.13 0 0 1-3-3.88Z"/></svg>
                </button>
                
                <button
                  onClick={() => navigator.clipboard.writeText(message.content)}
                  className="p-1 hover:bg-accent rounded transition-colors"
                  title="Copy"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                </button>
                
                <div className="relative">
                  <button 
                    onClick={() => setRetryOpen(!retryOpen)}
                    className="p-1 hover:bg-accent rounded transition-colors flex items-center gap-1"
                    title="Retry"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
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
                        ["claude-3-5-sonnet-20241022", "gpt-4o", "gemini-1.5-pro", settings.aiProvider.model].filter((v, i, a) => a.indexOf(v) === i).map(model => (
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
                      )}
                    </div>
                  )}
                </div>
                
                {message.modelUsed && (
                  <span className="ml-auto opacity-70 italic text-[10px]">
                    Generated by {formatModelName(message.modelUsed)}
                  </span>
                )}
              </div>
            )}
          </>
        )}
        </div>
      </div>
      
      {siblings.length > 1 && (!isUser || !isEditing) && (
        <div className={cn("flex mt-1 text-xs text-muted-foreground gap-2 items-center", isUser ? "justify-end" : "justify-start")}>
           <button 
             onClick={() => {
               const prev = siblings[siblingIndex - 1];
               if (prev) switchBranch(prev.id);
             }}
             disabled={siblingIndex === 0}
             className="hover:text-foreground disabled:opacity-30 transition-colors"
           >
             &lt;
           </button>
           <span>{siblingIndex + 1} / {siblings.length}</span>
           <button 
             onClick={() => {
               const next = siblings[siblingIndex + 1];
               if (next) switchBranch(next.id);
             }}
             disabled={siblingIndex === siblings.length - 1}
             className="hover:text-foreground disabled:opacity-30 transition-colors"
           >
             &gt;
           </button>
        </div>
      )}
    </div>
  );
}
