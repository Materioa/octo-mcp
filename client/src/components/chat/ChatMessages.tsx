import { useEffect, useRef } from "react";
import { useChatStore } from "@/stores/chat";
import { MessageBubble } from "./MessageBubble";
import { ScrollArea } from "@/components/ui/scroll-area";

interface ChatMessagesProps {
  onRetry?: (msgId: string, modelOverride: string) => void;
}

export function ChatMessages({ onRetry }: ChatMessagesProps) {
  const messages = useChatStore((s) => s.messages);
  const viewportRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
    }
  }, [messages]);

  return (
    <ScrollArea viewportRef={viewportRef} className="flex-1">
      <div className="mx-auto max-w-3xl space-y-4 p-4 pb-8">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onRetry={onRetry} />
        ))}
      </div>
    </ScrollArea>
  );
}
