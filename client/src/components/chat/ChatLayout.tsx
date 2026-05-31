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
import { Share, Ghost } from "lucide-react";
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
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [tools, setTools] = useState<MCPTool[]>([]);
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
    } catch(e) {}
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
        setActiveConversation(id);
      }
    } else {
      clearActiveConversation();
    }
  }, [id, setActiveConversation, clearActiveConversation]);

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

  const settings = useSettingsStore();

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
        await mcpClient.connect(mcpUrl);
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
  }, [settings.mcpEnvironment]);

  const handleRetry = async (msgId: string, modelOverride: string) => {
    if (!activeConversationId || isSending) return;
    useChatStore.getState().retryMessage(msgId, modelOverride).catch(console.error);
  };

  const handleSend = useCallback(
    async (content: string, attachments?: any[]) => {
      let convId = activeConversationId;
      if (!convId) {
        const isTemporary = searchParams.get("temporary") === "true";
        convId = await createConversation(isTemporary);
        
        // Only preserve specific params to keep AI context alive, drop pre-filled queries
        const newParams = new URLSearchParams();
        const sharedCtx = searchParams.get("shared-context");
        if (sharedCtx) newParams.set("shared-context", sharedCtx);
        if (isTemporary) newParams.set("temporary", "true");
        
        const paramStr = newParams.toString();
        navigate(`/c/${convId}${paramStr ? `?${paramStr}` : ''}`);
      }

      const parentId = messages[messages.length - 1]?.id;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
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
    [activeConversationId, messages, createConversation, addMessage, navigate]
  );

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    let timeGreeting = "Good morning";
    if (hour >= 12 && hour < 18) timeGreeting = "Good afternoon";
    else if (hour >= 18) timeGreeting = "Good evening";

    const sentences = [
      `${timeGreeting}, ${userName}`,
      "What will you learn today?",
      `${userName}, ready to start learning?`,
      "Let's explore something new.",
      `Ready to dive in, ${userName}?`
    ];
    return sentences[Math.floor(Math.random() * sentences.length)];
  }, [userName]);

  return (
    <div className="flex h-[100dvh] bg-background text-foreground relative overflow-hidden w-full">
      <ChatSidebar 
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onOpenSettings={(tab, view) => {
          setSettingsTab(tab || "ai");
          setSettingsMobileView(view || (tab ? "detail" : "list"));
          setSettingsOpen(true);
        }} 
      />

      <div className="flex flex-1 overflow-hidden relative">
        {sidebarOpen && (
          <div 
            className="absolute inset-0 z-40 bg-black/40 md:hidden backdrop-blur-sm animate-in fade-in-0 transition-opacity"
            onClick={() => setSidebarOpen(false)}
          />
        )}
        <main className={cn("flex flex-col relative h-full transition-all duration-300", activeDocument ? "w-full md:w-3/5" : "w-full")}>
          {/* Main chat header (Thinklet v) */}
        <header className="flex h-12 shrink-0 items-center px-4 gap-2 justify-between md:justify-start">
          {!sidebarOpen && (
            <button 
              onClick={() => setSidebarOpen(true)}
              className="md:hidden flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors shrink-0"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </button>
          )}
          <div className="font-medium text-sm text-foreground">
            {(() => {
              const rawTitle = activeConv?.title || (activeConversationId ? "New Chat" : "");
              const truncatedTitle = rawTitle.length > 10 ? rawTitle.slice(0, 10) + ".." : rawTitle;
              return (
                <>
                  <span className="md:hidden truncate block max-w-[200px]" title={rawTitle}>
                    {truncatedTitle}
                  </span>
                  <span className="hidden md:block truncate max-w-[400px]" title={rawTitle}>
                    {rawTitle}
                  </span>
                </>
              );
            })()}
          </div>
          
          
          <div className="ml-auto flex items-center gap-2">
            {!activeConversationId ? (
              <button 
                onClick={() => {
                  const newParams = new URLSearchParams(searchParams);
                  if (searchParams.get("temporary") === "true") {
                    newParams.delete("temporary");
                  } else {
                    newParams.set("temporary", "true");
                  }
                  navigate(`/new?${newParams.toString()}`);
                }}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md transition-colors",
                  searchParams.get("temporary") === "true" 
                    ? "bg-accent text-foreground" 
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
                title={searchParams.get("temporary") === "true" ? "Disable Temporary Chat" : "Enable Temporary Chat"}
              >
                <Ghost className="h-4 w-4" />
              </button>
            ) : (
              activeConv?.isTemporary && (
                <div className="flex h-8 w-8 items-center justify-center rounded-md text-foreground bg-accent" title="Temporary Chat (Not Saved)">
                  <Ghost className="h-4 w-4" />
                </div>
              )
            )}
            
            {activeConversationId && isSharedView && (
              <div className="flex items-center justify-center rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-foreground border border-border mr-1">
                {ownsIt ? "Shared by you" : `Shared by ${activeConv?.authorName || "User"}`}
              </div>
            )}
            
            {activeConversationId && !isSharedView && (
              <button 
                onClick={() => setShareOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
                title="Share Chat Link"
              >
                <Share className="h-4 w-4" />
              </button>
            )}

            <button 
              onClick={() => {
                clearActiveConversation();
                navigate("/new");
              }}
              className="md:hidden flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
              title="New Chat"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
        </header>

        {activeConversationId ? (
          <>
            {isSharedView && (
              <div className="mx-auto w-full max-w-3xl pt-4 px-4 pb-4 z-10 shrink-0">
                <div className="flex items-start gap-3 rounded-xl bg-accent/50 p-4 border border-accent">
                  <div className="mt-0.5">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
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
              <ChatMessages onRetry={handleRetry} />
            )}
            <div className="mx-auto w-full max-w-3xl pb-2 md:px-0">
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
                  onStop={() => providerRef.current?.abort()}
                  disabled={isSending} 
                  isSending={isSending} 
                />
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col px-4 md:items-center md:justify-center">
            <div className="flex-1 flex flex-col items-center justify-center md:flex-none">
              <div className="mb-8 text-center">
                <h1 className="text-3xl font-semibold tracking-tight text-foreground/90">
                  {greeting}
                </h1>
              </div>
            </div>
            <div className="w-full max-w-3xl pb-4 md:pb-0 mx-auto">
              <ChatInput 
                onSend={handleSend} 
                onStop={() => providerRef.current?.abort()}
                disabled={isSending} 
                isSending={isSending} 
                initialValue={initialQuery}
              />
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
            navigate(id ? `/c/${id}` : "/new", { replace: true });
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
          "fixed bottom-4 right-4 z-50 rounded-lg border border-border bg-card shadow-lg transition-all duration-300",
          isDebugOpen ? "w-64 p-3 animate-in slide-in-from-bottom-4" : "w-10 p-2 cursor-pointer hover:bg-accent"
        )}>
          {!isDebugOpen ? (
            <div 
              className="flex items-center justify-center h-full w-full opacity-50 hover:opacity-100"
              onClick={() => setIsDebugOpen(true)}
              title="Open Debug Panel"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </div>
          ) : (
            <>
              <h4 className="text-xs font-semibold mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => setIsDebugOpen(false)}
                    className="p-1 hover:bg-accent rounded-sm"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
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
