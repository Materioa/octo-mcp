import { useEffect, useRef, useMemo, useState, useCallback } from "react";
import { useChatStore } from "@/stores/chat";
import { MessageBubble } from "./MessageBubble";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatMessagesProps {
  onRetry?: (msgId: string, modelOverride: string) => void;
}

export function ChatMessages({ onRetry }: ChatMessagesProps) {
  const messages = useChatStore((s) => s.messages);
  const allMessages = useChatStore((s) => s.allMessages);
  const isSending = useChatStore((s) => s.isSending);
  const viewportRef = useRef<HTMLDivElement>(null);

  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const isAutoScrollEnabled = useRef(true);
  const lastScrollTop = useRef(0);
  const rafId = useRef<number | null>(null);
  const prevMessagesLength = useRef(messages.length);

  const checkScrollState = useCallback(() => {
    const el = viewportRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
    const isAtBottom = distanceFromBottom <= 45;

    if (isAtBottom) {
      isAutoScrollEnabled.current = true;
      setShowScrollBottom(false);
    } else {
      setShowScrollBottom(distanceFromBottom > 60);
    }
  }, []);

  const scrollToBottom = useCallback((smooth = true) => {
    const el = viewportRef.current;
    if (!el) return;
    isAutoScrollEnabled.current = true;
    setShowScrollBottom(false);
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
  }, []);

  // Listen to user interactions to pause auto-scroll when user scrolls up
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;

      // If user scrolls up away from bottom
      if (scrollTop < lastScrollTop.current - 1 && distanceFromBottom > 45) {
        isAutoScrollEnabled.current = false;
        setShowScrollBottom(true);
      } else if (distanceFromBottom <= 45) {
        isAutoScrollEnabled.current = true;
        setShowScrollBottom(false);
      } else if (distanceFromBottom > 60) {
        setShowScrollBottom(true);
      }

      lastScrollTop.current = scrollTop;
    };

    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) {
        // User scrolled upward
        isAutoScrollEnabled.current = false;
        setShowScrollBottom(true);
      }
    };

    const onTouchMove = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      const distanceFromBottom = scrollHeight - scrollTop - clientHeight;
      if (distanceFromBottom > 45) {
        isAutoScrollEnabled.current = false;
        setShowScrollBottom(true);
      }
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", onWheel, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: true });

    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, []);

  // When a new message is added (e.g. user sends message)
  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg?.role === "user") {
        isAutoScrollEnabled.current = true;
        scrollToBottom(false);
      }
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length, scrollToBottom]);

  // Handle incoming stream chunks
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    if (isAutoScrollEnabled.current) {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      rafId.current = requestAnimationFrame(() => {
        if (viewportRef.current && isAutoScrollEnabled.current) {
          viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
        }
      });
    } else {
      // User is reading above while response is streaming
      checkScrollState();
    }

    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [messages, checkScrollState]);

  const lastUserMessageId = useMemo(() => {
    return messages.filter(m => m.role === 'user').pop()?.id;
  }, [messages]);

  const siblingData = useMemo(() => {
    const data = new Map();
    const groups = new Map();
    
    for (const m of allMessages) {
      const key = `${m.parentId}-${m.role}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(m);
    }
    
    for (const [key, group] of groups.entries()) {
      group.sort((a: any, b: any) => a.timestamp - b.timestamp);
      for (let i = 0; i < group.length; i++) {
        data.set(group[i].id, {
          prevId: group[i - 1]?.id,
          nextId: group[i + 1]?.id,
          index: i,
          count: group.length,
        });
      }
    }
    return data;
  }, [allMessages]);

  return (
    <div className="relative flex-1 min-h-0 flex flex-col h-full">
      <ScrollArea viewportRef={viewportRef} className="flex-1">
        <div className="mx-auto max-w-3xl space-y-4 p-4 pb-8 chat-messages-container">
          {messages.map((msg) => {
            const sData = siblingData.get(msg.id);
            return (
              <MessageBubble 
                key={msg.id} 
                message={msg} 
                onRetry={onRetry} 
                isLastUserMessage={msg.id === lastUserMessageId}
                prevSiblingId={sData?.prevId}
                nextSiblingId={sData?.nextId}
                siblingIndex={sData?.index}
                siblingCount={sData?.count}
              />
            );
          })}
        </div>
      </ScrollArea>

      {/* Floating Go to Bottom Button */}
      {showScrollBottom && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 animate-in fade-in zoom-in-95 duration-200">
          <button
            onClick={() => scrollToBottom(true)}
            className="group relative flex h-10 w-10 items-center justify-center rounded-full bg-[#242422]/95 hover:bg-[#2c2c28] text-white/90 hover:text-white border border-white/10 shadow-lg active:scale-95 transition-all overflow-hidden focus:outline-none backdrop-blur-sm cursor-pointer"
            title="Go to bottom"
            aria-label="Scroll to bottom"
          >
            {/* Glowing gradient inside circle at bottom part when responding */}
            {isSending && (
              <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none">
                <div 
                  className="absolute -bottom-2.5 left-1/2 w-8 h-5 rounded-[50%] blur-[2px] opacity-95 animate-bottom-glow pointer-events-none"
                  style={{
                    background: "radial-gradient(ellipse at bottom, #b8270a 0%, rgba(184, 39, 10, 0.75) 45%, rgba(184, 39, 10, 0.2) 75%, transparent 100%)"
                  }}
                />
                <div 
                  className="absolute bottom-0 left-0 right-0 h-3 pointer-events-none"
                  style={{
                    background: "linear-gradient(to top, rgba(184, 39, 10, 0.55) 0%, transparent 100%)"
                  }}
                />
              </div>
            )}

            {/* Down arrow icon matching user screenshot */}
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
              className="relative z-10 transition-transform duration-150 group-hover:translate-y-0.5"
            >
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <polyline points="19 12 12 19 5 12"></polyline>
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
