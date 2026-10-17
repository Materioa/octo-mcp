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
            className="group relative flex h-10 w-10 items-center justify-center rounded-full border border-black/10 dark:border-white/20 shadow-lg hover:shadow-xl active:scale-95 transition-all overflow-hidden focus:outline-none cursor-pointer"
            title="Go to bottom"
            aria-label="Scroll to bottom"
          >
            {/* Layer 0: Glow Layer (strictly UNDERNEATH the frosted glass layer, confined to bottom) */}
            {isSending && (
              <div className="absolute inset-0 rounded-full overflow-hidden pointer-events-none z-0">
                {/* Focused living glowing core strictly in the bottom crescent */}
                <div 
                  className="absolute -bottom-1 left-1/2 w-8 h-4 rounded-[50%] blur-[3.5px] animate-live-glow pointer-events-none"
                  style={{
                    background: "radial-gradient(ellipse at 50% 100%, #b8270a 0%, rgba(184, 39, 10, 0.85) 30%, rgba(184, 39, 10, 0.2) 60%, transparent 80%)"
                  }}
                />
                {/* Secondary subtle wave */}
                <div 
                  className="absolute -bottom-0.5 left-1/2 w-6 h-3 rounded-[50%] blur-[2.5px] animate-live-wave pointer-events-none"
                  style={{
                    background: "radial-gradient(circle at 50% 100%, rgba(220, 50, 15, 0.8) 0%, rgba(184, 39, 10, 0.35) 50%, transparent 80%)"
                  }}
                />
                {/* Ambient bottom rim light */}
                <div 
                  className="absolute bottom-0 left-0 right-0 h-2 blur-[1.5px] pointer-events-none"
                  style={{
                    background: "linear-gradient(to top, rgba(184, 39, 10, 0.6) 0%, transparent 100%)"
                  }}
                />
              </div>
            )}

            {/* Layer 1: Frosted Glass Layer (sits ABOVE the glow to diffuse it beautifully while keeping top half crisp) */}
            <div className="absolute inset-0 rounded-full backdrop-blur-md bg-white/80 hover:bg-white/90 dark:bg-[#1e1e1c]/80 dark:hover:bg-[#262624]/90 transition-colors z-10 pointer-events-none" />

            {/* Layer 2: Inner subtle rim reflection */}
            <div className="absolute inset-0 rounded-full ring-1 ring-inset ring-black/5 dark:ring-white/10 z-10 pointer-events-none" />

            {/* Layer 3: Down arrow icon (on top of blur layer, crisp and sharp) */}
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
              className="relative z-20 text-neutral-800 dark:text-neutral-100 transition-transform duration-150 group-hover:translate-y-0.5"
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
