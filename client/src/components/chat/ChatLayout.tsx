import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useChatStore } from "@/stores/chat";
import { useSettingsStore } from "@/stores/settings";
import { mcpClient } from "@/lib/mcp-client";
import { OpenAICompatProvider } from "@/lib/providers/openai-compat";
import { getMemoryManager } from "@/lib/memory";
import type { AIMessage, AIToolCall } from "@/lib/ai-provider";
import type { Message, ToolCall, MCPTool } from "@/types";
import { ChatSidebar } from "./ChatSidebar";
import { ChatMessages } from "./ChatMessages";
import { ChatInput } from "./ChatInput";
import { DocumentPreview } from "./DocumentPreview";
import { Share, Ghost, X } from "lucide-react";
import { ShareDialog } from "./ShareDialog";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";
import { Loader } from "lucide-react";

export function ChatLayout() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("ai");
  const [settingsMobileView, setSettingsMobileView] = useState<"list" | "detail">("list");
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    if (window.innerWidth < 768) return false;
    const saved = localStorage.getItem("sidebarOpen");
    if (saved !== null) return saved === "true";
    return true;
  });
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const providerRef = useRef<any>(null);

  const {
    activeConversationId,
    messages,
    conversations,
    isSending,
    createConversation,
    setActiveConversation,
    clearActiveConversation,
    deleteConversation,
    addMessage,
    updateMessage,
    setIsSending,
    isLoading,
    activeDocument,
    setActiveDocument,
    setSharedContext,
  } = useChatStore();

  const { user, anonymousId } = useAuthStore();
  const userName = user?.displayName || user?.fullName || user?.firstName || user?.name || user?.username || (user?.email ? user.email.split('@')[0] : undefined) || "there";

  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  const activeConv = conversations.find(c => c.id === activeConversationId || c.shareId === activeConversationId);
  const ownsIt = activeConv ?
    (activeConv.userId && activeConv.userId === user?.id) ||
    (activeConv.anonymousId && activeConv.anonymousId === anonymousId && !user)
    : false;

  const isSharedView = location.pathname.startsWith("/share/");
  const [searchParams] = useSearchParams();
  const initialQuery = useMemo(() => searchParams.get("q") || searchParams.get("query") || undefined, [searchParams]);

  useEffect(() => {
    // Safely check if we are embedded in getmaterio.app and parse shared context
    try {
      const isEmbedded = window.self !== window.top;
      const isMaterio = document.referrer.includes("getmaterio.app") || document.referrer.includes("localhost:1000") || document.referrer.includes("localhost:3000");
      const isDev = import.meta.env.DEV;

      if ((isEmbedded && isMaterio) || isDev) {
        const context = searchParams.get("shared-context");
        if (context) {
          setSharedContext(context);
        }
      }
    } catch (e) { }
  }, [searchParams, setSharedContext]);

  useEffect(() => {
    if (location.pathname.startsWith("/settings")) {
      setSettingsOpen(true);
      const tab = location.pathname.split("/")[2];
      if (tab) {
        setSettingsTab(tab);
      }
    }
  }, [location.pathname]);

  useEffect(() => {
    if (id) {
      if (id !== useChatStore.getState().activeConversationId) {
        setActiveConversation(id).then((success) => {
          if (success === false) {
            navigate("/new", { replace: true });
            import("@/stores/alert").then(m => m.useAlertStore.getState().addAlert("Conversation not found", "error"));
          }
        });
      }
    } else {
      if (searchParams.get("incognito") !== "true") {
        clearActiveConversation();
      }
    }
  }, [id, setActiveConversation, clearActiveConversation, searchParams, navigate]);

  // Automatically collapse sidebar on mobile
  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 767px)");
    const handleMediaChange = (e: MediaQueryListEvent) => {
      if (e.matches) {
        setSidebarOpen(false);
      }
    };
    mediaQuery.addEventListener("change", handleMediaChange);
    return () => mediaQuery.removeEventListener("change", handleMediaChange);
  }, []);

  // Save sidebar state to localStorage
  useEffect(() => {
    if (window.innerWidth >= 768) {
      localStorage.setItem("sidebarOpen", String(sidebarOpen));
    }
  }, [sidebarOpen]);

  const mcpEnvironment = useSettingsStore(s => s.mcpEnvironment);
  const customConnectors = useSettingsStore(s => s.customConnectors);
  const settings = useSettingsStore(); // keep for other usages

  // Connect to MCP server
  useEffect(() => {
    let active = true;
    const connect = async () => {
      try {
        const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
        const mcpUrl = isLocal
          ? "http://localhost:3001/mcp"
          : "https://mcp.getmaterio.app/mcp";

        // Re-connecting forces disconnect first under the hood if already connected
        await mcpClient.connectAll({
          mainServerUrl: mcpUrl,
          customConnectors: settings.customConnectors || []
        });
        const serverTools = await mcpClient.listTools();
        if (active) {
          setTools(serverTools);
          setConnected(true);
        }
      } catch (err) {
        console.error("MCP connection failed:", err);
        if (active) setConnected(false);
      }
    };
    connect();
    return () => { active = false; };
  }, [mcpEnvironment, customConnectors]);

  const handleRetry = async (msgId: string, modelOverride: string) => {
    if (!activeConversationId || isSending) return;
    useChatStore.getState().retryMessage(msgId, modelOverride).catch(console.error);
  };

  const handleSend = useCallback(
    async (content: string, attachments?: any[]) => {
      let finalContent = content;
      if (content.startsWith("/")) {
        const spaceIndex = content.indexOf(" ");
        const cmd = spaceIndex === -1 ? content.slice(1) : content.slice(1, spaceIndex);
        const argText = spaceIndex === -1 ? "" : content.slice(spaceIndex + 1);

        try {
          const prompts = await mcpClient.listPrompts();
          const match = prompts.find(p => p.name === cmd);
          if (match) {
            const promptArgs: Record<string, string> = {};
            if (match.arguments && match.arguments.length > 0) {
              const primaryArg = match.arguments.find((a: any) => 
                ["code", "text", "content", "query", "input"].includes(a.name.toLowerCase())
              ) || match.arguments[0];
              if (primaryArg) {
                promptArgs[primaryArg.name] = argText;
              }
            }
            const promptRes = await mcpClient.getPrompt(cmd, promptArgs);
            if (promptRes.messages && promptRes.messages.length > 0) {
              finalContent = promptRes.messages.map((m: any) => {
                if (typeof m.content === "string") return m.content;
                if (m.content && typeof m.content === "object") {
                  if (m.content.type === "text") return m.content.text;
                  if (m.content.text) return m.content.text;
                  return JSON.stringify(m.content);
                }
                return "";
              }).filter(Boolean).join("\n");
            }
          }
        } catch (e) {
          console.error("Failed to load prompt contents", e);
        }
      }

      let convId = activeConversationId;
      if (!convId) {
        const isIncognito = searchParams.get("incognito") === "true";
        const isTemporary = searchParams.get("temporary") === "true" || isIncognito;
        convId = await createConversation(isTemporary);

        // Preserve all params except the pre-filled queries
        const newParams = new URLSearchParams(searchParams);
        newParams.delete("q");
        newParams.delete("query");
        if (isTemporary && !isIncognito) newParams.set("temporary", "true");
        if (isIncognito) newParams.set("incognito", "true");

        const paramStr = newParams.toString();
        if (!isIncognito) {
          navigate(`/c/${convId}${paramStr ? `?${paramStr}` : ''}`);
        }
      }

      const parentId = messages[messages.length - 1]?.id || "root";

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: finalContent,
        attachments,
        timestamp: Date.now(),
        parentId,
      };

      try {
        await addMessage(userMsg);
      } catch (err: any) {
        if (messages.length === 0) {
          await deleteConversation(convId);
          navigate("/new");
        }
        if (err.message && err.message.toLowerCase().includes("limit")) {
          useAuthStore.getState().setLoginOpen(true);
        } else {
          alert(`Error saving message: ${err.message}`);
        }
        return;
      }

      // Generation is handled in the background
      useChatStore.getState().generateResponse(convId).catch(console.error);
    },
    [activeConversationId, messages, createConversation, addMessage, navigate, searchParams]
  );

  const isIncognito = searchParams.get("incognito") === "true";
  const [hideSidebarIcon, setHideSidebarIcon] = useState(() => searchParams.get("hide-sidebar-icon") === "true");

  const renameConversation = useChatStore(s => s.renameConversation);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState("");

  useEffect(() => {
    const handleHideSidebar = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && typeof customEvent.detail.hide === "boolean") {
        setHideSidebarIcon(customEvent.detail.hide);
      }
    };
    window.addEventListener("materio-hide-sidebar-icon", handleHideSidebar);
    return () => window.removeEventListener("materio-hide-sidebar-icon", handleHideSidebar);
  }, []);

  const greeting = useMemo(() => {
    if (isIncognito) {
      const sentences = [
        "Greetings, whoever you are",
        "Ask the question you've been afraid to ask.",
        "Your secrets are safe here",
        "Speak freely, friend",
        "What's on your mind?",
        "Going off the record...",
        "Just you and the question. Go ahead.",
        "Let's keep this between us."
      ];
      return sentences[Math.floor(Math.random() * sentences.length)];
    }
    const hour = new Date().getHours();
    let timeGreeting = "Good morning";
    if (hour >= 12 && hour < 18) timeGreeting = "Good afternoon";
    else if (hour >= 18) timeGreeting = "Good evening";

    const sentences = [
      `${timeGreeting}, ${userName}`,
      "What will you learn today?",
      `${userName}, ready to start learning?`,
      "Let's explore something new.",
      `Ready to dive in, ${userName}?`,
      "No question is too basic. Seriously.",
      `Hey ${userName}, stuck somewhere? I'm here`
    ];
    return sentences[Math.floor(Math.random() * sentences.length)];
  }, [userName, isIncognito]);

  return (
    <div
      className={cn("flex h-[100dvh] text-foreground relative w-full transition-all duration-300 print:h-auto print:bg-white", isIncognito ? "flex-col p-1.5 md:p-2" : "flex-row bg-background")}
      style={isIncognito ? { backgroundColor: "var(--incognito-frame)" } : undefined}
    >
      {isIncognito && (
        <div
          className="flex shrink-0 items-center justify-between px-2 pb-2 pt-1 md:px-3 md:pb-3 md:pt-2"
          style={{ color: "var(--incognito-text)" }}
        >
          <div className="flex items-center gap-2 font-medium text-sm">
            <Ghost className="h-4 w-4" />
            Incognito chat
          </div>
          <button
            onClick={() => {
              const newParams = new URLSearchParams(searchParams);
              newParams.delete("incognito");
              navigate(`/new?${newParams.toString()}`);
            }}
            className="flex items-center justify-center hover:opacity-70 transition-opacity"
            title="Exit Incognito Mode"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
      {!isIncognito && (
        <ChatSidebar
          open={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)}
          onOpenSettings={(tab, view) => {
            if (tab) setSettingsTab(tab);
            if (view) setSettingsMobileView(view);
            setSettingsOpen(true);
          }}
        />
      )}

      <div className={cn(
        "flex flex-1 overflow-hidden relative transition-all duration-300",
        isIncognito && "bg-background rounded-2xl border dark:border-white/20 shadow-2xl"
      )}>
        {sidebarOpen && (
          <div
            className="absolute inset-0 z-40 bg-black/40 md:hidden backdrop-blur-sm animate-in fade-in-0 transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <main className={cn("flex flex-col relative h-full transition-all duration-300", activeDocument ? "w-full md:w-3/5" : "w-full")}>
          {/* Main chat header (Thinklet v) */}
          <header className="flex h-12 shrink-0 items-center px-4 gap-2 justify-between md:justify-start print:hidden">
            {!sidebarOpen && !isIncognito && !hideSidebarIcon && (
              <button
                onClick={() => setSidebarOpen(true)}
                className="md:hidden flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="18" y2="18" /></svg>
              </button>
            )}
            <div className="font-medium text-sm text-foreground">
              {(() => {
                const rawTitle = activeConv?.title || (activeConversationId ? "New Chat" : "");
                
                if (editingTitle && activeConversationId && activeConv) {
                  return (
                    <input
                      type="text"
                      autoFocus
                      className="h-7 w-[150px] md:w-[300px] rounded-md border border-input bg-transparent px-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                      value={titleValue}
                      onChange={(e) => setTitleValue(e.target.value)}
                      onKeyDown={async (e) => {
                        if (e.key === "Enter") {
                          if (titleValue.trim() && titleValue.trim() !== rawTitle) {
                            await renameConversation(activeConversationId, titleValue.trim());
                          }
                          setEditingTitle(false);
                        } else if (e.key === "Escape") {
                          setEditingTitle(false);
                        }
                      }}
                      onBlur={async () => {
                        if (titleValue.trim() && titleValue.trim() !== rawTitle) {
                          await renameConversation(activeConversationId, titleValue.trim());
                        }
                        setEditingTitle(false);
                      }}
                    />
                  );
                }

                const truncatedTitle = rawTitle.length > 10 ? rawTitle.slice(0, 10) + ".." : rawTitle;
                return (
                  <div 
                    className={cn("cursor-pointer hover:bg-accent hover:text-accent-foreground px-2 py-1 -ml-2 rounded-md transition-colors", !activeConversationId && "cursor-default hover:bg-transparent hover:text-foreground")}
                    onClick={() => {
                      if (activeConversationId && activeConv) {
                        setTitleValue(rawTitle);
                        setEditingTitle(true);
                      }
                    }}
                  >
                    <span className="md:hidden truncate block max-w-[200px]" title={rawTitle}>
                      {truncatedTitle}
                    </span>
                    <span className="hidden md:block truncate max-w-[400px]" title={rawTitle}>
                      {rawTitle}
                    </span>
                  </div>
                );
              })()}
            </div>

            <div className="ml-auto flex items-center gap-2">
              {!isIncognito && (
                !activeConversationId ? (
                  <button
                    onClick={() => {
                      const newParams = new URLSearchParams(searchParams);
                      if (searchParams.get("incognito") === "true") {
                        newParams.delete("incognito");
                      } else {
                        newParams.set("incognito", "true");
                      }
                      navigate(`/new?${newParams.toString()}`);
                    }}
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-md transition-all active:scale-95",
                      searchParams.get("incognito") === "true"
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                    title={searchParams.get("incognito") === "true" ? "Exit Incognito Chat" : "Enter Incognito Chat"}
                  >
                    <Ghost className="h-4 w-4" />
                  </button>
                ) : (
                  activeConv?.isTemporary && (
                    <div className="flex h-8 w-8 items-center justify-center rounded-md text-foreground bg-accent" title="Temporary Chat (Not Saved)">
                      <Ghost className="h-4 w-4" />
                    </div>
                  )
                )
              )}

              {activeConversationId && isSharedView && (
                <div className="flex items-center justify-center rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-foreground border border-border mr-1">
                  {ownsIt ? "Shared by you" : `Shared by ${activeConv?.authorName || "User"}`}
                </div>
              )}

              {activeConversationId && !isSharedView && !activeConv?.isTemporary && (
                <>
                  <button
                    onClick={() => {
                      setIsPreparingPrint(true);
                      setTimeout(() => {
                        window.print();
                        setIsPreparingPrint(false);
                      }, 2500);
                    }}
                    disabled={isPreparingPrint}
                    className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
                    title={isPreparingPrint ? "Preparing PDF..." : "Export as PDF"}
                  >
                    {isPreparingPrint ? (
                      <Loader className="h-4 w-4 animate-spin" />
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M12 18v-6"/><path d="m9 15 3 3 3-3"/></svg>
                    )}
                  </button>

                  <button
                    onClick={() => setShareOpen(true)}
                    className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                    title="Share Chat Link"
                  >
                    <Share className="h-4 w-4" />
                  </button>
                </>
              )}

              <button
                onClick={() => {
                  clearActiveConversation();
                  navigate("/new");
                }}
                className="md:hidden flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                title="New Chat"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            </div>
          </header>

          {activeConversationId ? (
            <>
              {isSharedView && (
                <div className="mx-auto w-full max-w-3xl pt-4 px-4 pb-4 z-10 shrink-0">
                  <div className="flex items-start gap-3 rounded-xl bg-accent/50 p-4 border border-accent">
                    <div className="mt-0.5">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      This is a copy of a chat between Thinklet and {activeConv?.authorName || "User"}. Content may include unverified or unsafe content that do not represent the views of Thinklet.
                    </p>
                  </div>
                </div>
              )}

              {isLoading ? (
                <div className="flex-1 flex items-center justify-center">
                  <Loader className="h-8 w-8 animate-spin text-muted-foreground/50" />
                </div>
              ) : (
                <>
                  <div className="hidden print:flex items-center gap-3 border-b border-border/50 pb-4 mb-4 pt-4 px-4 mx-auto w-full max-w-3xl">
                    <img src="/sidebar.svg" alt="Thinklet" className="h-8 dark-invert" />
                    <h1 className="text-2xl font-bold m-0 text-foreground">Thinklet</h1>
                  </div>
                  <ChatMessages onRetry={handleRetry} />
                </>
              )}
              <div className="mx-auto w-full max-w-3xl pb-2 px-2 sm:px-0 print:hidden">
                {isSharedView ? (
                  <div className="px-4 pb-4 pt-2">
                    <button
                      onClick={() => navigate(`/c/${activeConversationId}`)}
                      className="w-full flex items-center justify-center gap-2 rounded-lg bg-primary text-primary-foreground py-3 text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm"
                    >
                      Continue this conversation
                    </button>
                  </div>
                ) : (
                  <ChatInput
                    onSend={handleSend}
                    onStop={() => useChatStore.getState().abortStream()}
                    disabled={isSending}
                    isSending={isSending}
                    mcpConnected={connected}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 flex-col px-2 sm:px-4 md:items-center md:justify-center">
              <div className="flex-1 flex flex-col items-center justify-center md:flex-none">
                <div className="mb-8 text-center select-none">
                  <h1 className="text-3xl font-semibold tracking-tight text-foreground/90">
                    {greeting}
                  </h1>
                </div>
              </div>
              <div className="w-full max-w-3xl pb-4 md:pb-0 mx-auto">
                <ChatInput
                  onSend={handleSend}
                  onStop={() => useChatStore.getState().abortStream()}
                  disabled={isSending}
                  isSending={isSending}
                  initialValue={initialQuery}
                  mcpConnected={connected}
                />
                {isIncognito && (
                  <div className="mt-6 text-center text-xs text-muted-foreground">
                    Incognito chats aren't saved or added to memory.
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
        {activeDocument && (
          <DocumentPreview document={activeDocument} onClose={() => setActiveDocument(null)} />
        )}
      </div>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={(open) => {
          setSettingsOpen(open);
          if (!open && location.pathname.startsWith("/settings")) {
            navigate(`${id ? `/c/${id}` : "/new"}${location.search}`, { replace: true });
          }
        }}
        mcpConnected={connected}
        tools={tools}
        defaultTab={settingsTab}
        defaultMobileView={settingsMobileView}
      />

      {activeConversationId && (
        <ShareDialog
          open={shareOpen}
          onOpenChange={setShareOpen}
          visibility={activeConv?.visibility || "private"}
          conversationId={activeConversationId}
          shareId={activeConv?.shareId}
          onSaveVisibility={(vis) => useChatStore.getState().setConversationVisibility(activeConversationId, vis)}
        />
      )}

      {import.meta.env.DEV && (
        <div className={cn(
          "fixed bottom-4 right-4 z-50 rounded-lg border border-border bg-card shadow-lg transition-all duration-300 print:hidden",
          isDebugOpen ? "w-64 p-3 animate-in slide-in-from-bottom-4" : "w-10 p-2 cursor-pointer hover:bg-accent"
        )}>
          {!isDebugOpen ? (
            <div
              className="flex items-center justify-center h-full w-full opacity-50 hover:opacity-100"
              onClick={() => setIsDebugOpen(true)}
              title="Open Debug Panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            </div>
          ) : (
            <>
              <h4 className="text-xs font-semibold mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsDebugOpen(false)}
                    className="p-1 hover:bg-accent rounded-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                  </button>
                  Debug Panel
                </div>
                <span className={cn("h-2 w-2 rounded-full", connected ? "bg-green-500" : "bg-red-500")} />
              </h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground whitespace-nowrap">MCP Server</span>
                  <select
                    className="text-xs bg-background border border-border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-ring w-full"
                    value={settings.mcpEnvironment}
                    onChange={(e) => settings.setMcpEnvironment(e.target.value as any)}
                  >
                    <option value="production">Production</option>
                    <option value="development">Local (3001)</option>
                  </select>
                </div>
                <p className="text-[10px] text-muted-foreground break-all bg-muted/50 p-1.5 rounded border border-border/50">
                  {settings.mcpEnvironment === "development" ? "http://localhost:3001/mcp" : (import.meta.env.VITE_MCP_SERVER_URL || "https://materiomcp.vercel.app/mcp")}
                </p>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
