import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "@/stores/chat";
import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LoginDialog } from "@/components/auth/LoginDialog";
import { ProfileDropdown } from "./ProfileDropdown";
import { cn } from "@/lib/utils";
import { SearchDialog } from "./SearchDialog";

interface ChatSidebarProps {
  open: boolean;
  onToggle: () => void;
  onOpenSettings: (tab?: string, view?: "list" | "detail") => void;
}

export function ChatSidebar({ open, onToggle, onOpenSettings }: ChatSidebarProps) {
  const {
    conversations,
    activeConversationId,
    loadConversations,
    createConversation,
    setActiveConversation,
    deleteConversation,
    clearActiveConversation,
    generatingConversationIds,
  } = useChatStore();

  const { theme, setTheme } = useSettingsStore();
  const { user, logout, loginOpen, setLoginOpen } = useAuthStore();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  return (
    <div
      className={cn(
        "flex h-full flex-col border-r border-border bg-card transition-all duration-300 ease-in-out absolute md:relative z-50 shrink-0",
        open ? "w-[260px] translate-x-0" : "w-[260px] -translate-x-full md:w-[52px] md:translate-x-0"
      )}
    >
      {/* ── Top Area: Logo (Toggle) ── */}
      <div className={cn("flex h-14 items-center gap-2", open ? "px-4" : "justify-center")}>
        <button
          onClick={onToggle}
          className={cn("flex shrink-0 items-center rounded-lg hover:bg-accent transition-colors", open ? "px-2 py-1.5 -ml-2" : "h-10 w-10 justify-center")}
          title={open ? "Close sidebar" : "Open sidebar"}
        >
          <img
            src="/sidebar.svg"
            alt="Toggle Sidebar"
            className="h-6 w-6 object-contain dark-invert"
          />
          {open && (
            <img 
              src="/wordmark.svg" 
              alt="Thinklet" 
              className="ml-2 h-5 object-contain dark-invert"
            />
          )}
        </button>
      </div>

      {/* ── Edge Hover Handle ── */}
      <div 
        className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-accent/50 z-50 transition-colors"
        onClick={onToggle}
        title="Toggle sidebar"
      />

      {/* ── Middle: Actions ── */}
      <div className={cn("pb-2 space-y-1 mt-2", open ? "px-3" : "px-1.5")}>
        <button
          className={cn(
            "flex w-full items-center gap-3 rounded-lg hover:bg-accent transition-colors",
            open ? "p-2.5" : "h-11 justify-center"
          )}
          onClick={() => {
            clearActiveConversation();
            navigate("/new");
          }}
          title="New chat"
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
            className="shrink-0"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          {open && <span className="text-sm font-medium">New chat</span>}
        </button>
        
        <button
          className={cn(
            "flex w-full items-center gap-3 rounded-lg hover:bg-accent transition-colors",
            open ? "p-2.5" : "h-11 justify-center"
          )}
          title="Search chats"
          onClick={() => setSearchOpen(true)}
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
            className="shrink-0"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          {open && <span className="text-sm font-medium">Search chats</span>}
        </button>
      </div>

      <SearchDialog open={searchOpen} onOpenChange={setSearchOpen} />

      {/* ── Conversations ── */}
      {open ? (
        <ScrollArea className="flex-1 px-3">
          <div className="space-y-1 py-2">
            {conversations.map((conv) => (
              <div
                key={conv.id}
                className={cn(
                  "group flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm hover:bg-accent",
                  activeConversationId === conv.id && "bg-accent"
                )}
                onClick={() => navigate(`/c/${conv.id}`)}
              >
                <span className="flex-1 truncate">{conv.title}</span>
                {generatingConversationIds.includes(conv.id) ? (
                  <div className="shrink-0 rounded p-1">
                    <svg className="animate-spin h-4 w-4 text-orange-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                ) : (
                  <button
                    className="hidden shrink-0 rounded p-1 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground group-hover:block"
                    onClick={async (e) => {
                      e.stopPropagation();
                      await deleteConversation(conv.id);
                      if (activeConversationId === conv.id) {
                        navigate("/new");
                      }
                    }}
                  >
                    <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                </button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex-1" />
      )}

      {/* ── Bottom: Theme & Settings ── */}
      <div className={cn("space-y-1", open ? "p-3" : "p-1.5 pb-3")}>
        {user ? (
          <ProfileDropdown user={user} onLogout={logout} onSettings={onOpenSettings} isCollapsed={!open} />
        ) : (
          <button
            className={cn(
              "flex w-full items-center gap-3 rounded-lg text-primary hover:bg-primary/10 transition-colors font-medium",
              open ? "p-2.5" : "h-11 justify-center"
            )}
            onClick={() => setLoginOpen(true)}
            title="Sign in"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
              <polyline points="10 17 15 12 10 7" />
              <line x1="15" x2="3" y1="12" y2="12" />
            </svg>
            {open && <span className="text-sm">Sign in</span>}
          </button>
        )}

      </div>

      <LoginDialog open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
}
