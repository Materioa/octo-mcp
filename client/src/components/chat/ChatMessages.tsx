import { useEffect, useRef, useMemo } from "react";
import { useChatStore } from "@/stores/chat";
import { MessageBubble } from "./MessageBubble";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatMessagesProps {
  onRetry?: (msgId: string, modelOverride: string) => void;
}

export function ChatMessages({ onRetry }: ChatMessagesProps) {
  const messages = useChatStore((s) => s.messages);
  const allMessages = useChatStore((s) => s.allMessages);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [messages]);

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
  );
}
