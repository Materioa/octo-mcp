import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
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
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { useAuthStore } from "@/stores/auth";
import { cn } from "@/lib/utils";
import { Loader } from "lucide-react";

export function ChatLayout() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState("ai");
  const [sidebarOpen, setSidebarOpen] = useState(window.innerWidth >= 768);
  const [isDebugOpen, setIsDebugOpen] = useState(false);
  const [connected, setConnected] = useState(false);
  const [tools, setTools] = useState<MCPTool[]>([]);
  const providerRef = useRef<any>(null);

  const {
    activeConversationId,
    messages,
    isSending,
    createConversation,
    setActiveConversation,
    clearActiveConversation,
    deleteConversation,
    addMessage,
    updateMessage,
    setIsSending,
    isLoading,
  } = useChatStore();

  const { user } = useAuthStore();
  const userName = user?.displayName || user?.username || "there";

  const { id } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    if (id && id !== activeConversationId) {
      setActiveConversation(id);
    }
  }, [id, activeConversationId, setActiveConversation]);

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
        convId = await createConversation();
        navigate(`/c/${convId}`);
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
           navigate("/");
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
    <div className="flex h-screen bg-background text-foreground">
      <ChatSidebar 
        open={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        onOpenSettings={(tab) => {
          setSettingsTab(tab || "ai");
          setSettingsOpen(true);
        }} 
      />

      <main className="flex flex-1 flex-col relative overflow-hidden">
        {/* Main chat header (Thinklet v) */}
        <header className="flex h-12 shrink-0 items-center px-4 gap-2 justify-between md:justify-start">
          {!sidebarOpen && (
            <button 
              onClick={() => setSidebarOpen(true)}
              className="md:hidden flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="12" y2="12"/><line x1="4" x2="20" y1="6" y2="6"/><line x1="4" x2="20" y1="18" y2="18"/></svg>
            </button>
          )}
          
          <button 
            onClick={() => {
              clearActiveConversation();
              navigate("/");
            }}
            className="md:hidden flex h-8 w-8 items-center justify-center rounded-md hover:bg-accent transition-colors ml-auto text-muted-foreground hover:text-foreground"
            title="New Chat"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </header>

        {activeConversationId ? (
          <>
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader className="h-8 w-8 animate-spin text-muted-foreground/50" />
              </div>
            ) : (
              <ChatMessages onRetry={handleRetry} />
            )}
            <div className="mx-auto w-full max-w-3xl pt-2 pb-4">
              <ChatInput 
                onSend={handleSend} 
                onStop={() => providerRef.current?.abort()}
                disabled={isSending} 
                isSending={isSending} 
              />
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
              />
            </div>
          </div>
        )}
      </main>

      <SettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        defaultTab={settingsTab}
        mcpConnected={connected}
        tools={tools}
      />

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
