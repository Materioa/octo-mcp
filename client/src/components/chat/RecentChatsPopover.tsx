import React, { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useChatStore } from "@/stores/chat";
import { cn } from "@/lib/utils";

interface RecentChatsPopoverProps {
  children?: React.ReactNode;
  align?: "left" | "right";
  side?: "bottom" | "right";
  className?: string;
  onNewChat?: () => void;
}

export function RecentChatsPopover({
  children,
  align = "left",
  side = "bottom",
  className,
  onNewChat,
}: RecentChatsPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const navigate = useNavigate();
  const conversations = useChatStore((s) => s.conversations);
  const activeConversationId = useChatStore((s) => s.activeConversationId);

  // Top 10 most recent conversations excluding current if desired, or all recent
  const recentConversations = React.useMemo(() => {
    return [...conversations]
      .filter((c) => c && c.id)
      .sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0))
      .slice(0, 10);
  }, [conversations]);

  const handleMouseEnter = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsOpen(true);
    }, 120);
  };

  const handleMouseLeave = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      setIsOpen(false);
    }, 200);
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return (
    <div
      className={cn("relative inline-flex items-center", className)}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Trigger Button or Custom Children */}
      {children ? (
        children
      ) : (
        <button
          onClick={() => {
            setIsOpen(false);
            if (onNewChat) onNewChat();
            else navigate("/new");
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
          title="New Chat"
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
      )}

      {/* Floating Recents Menu */}
      {isOpen && (
        <div
          className={cn(
            "absolute z-50 min-w-[210px] max-w-[280px] rounded-xl bg-[#232326] text-neutral-100 border border-neutral-700/60 shadow-2xl p-1.5 backdrop-blur-md animate-in fade-in-0 zoom-in-95 duration-150",
            side === "bottom" && "top-full mt-1.5",
            side === "right" && "left-full ml-2 top-0",
            align === "left" && "left-0",
            align === "right" && "right-0"
          )}
          onMouseEnter={handleMouseEnter}
          onMouseLeave={handleMouseLeave}
        >
          <div className="px-3 pt-2 pb-1.5 text-xs font-semibold text-neutral-400 select-none">
            Recents
          </div>

          <div className="flex flex-col gap-0.5 max-h-[360px] overflow-y-auto custom-scrollbar">
            {recentConversations.length > 0 ? (
              recentConversations.map((conv) => {
                const isActive = conv.id === activeConversationId;
                return (
                  <button
                    key={conv.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsOpen(false);
                      navigate(`/c/${conv.id}`);
                    }}
                    className={cn(
                      "w-full text-left px-3 py-1.5 text-[13px] font-medium rounded-lg transition-colors truncate block",
                      isActive
                        ? "bg-neutral-800 text-white font-semibold"
                        : "text-neutral-300 hover:text-white hover:bg-neutral-800/80"
                    )}
                    title={conv.title}
                  >
                    {conv.title || "Untitled Chat"}
                  </button>
                );
              })
            ) : (
              <div className="px-3 py-2 text-xs text-neutral-500 italic select-none">
                No recent chats
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
