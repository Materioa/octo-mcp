import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useChatStore } from "@/stores/chat";
import { useNavigate } from "react-router-dom";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";

interface SearchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SearchDialog({ open, onOpenChange }: SearchDialogProps) {
  const { conversations } = useChatStore();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  const filteredConversations = useMemo(() => {
    if (!query.trim()) return conversations;
    return conversations.filter(c => 
      c.title.toLowerCase().includes(query.toLowerCase())
    );
  }, [conversations, query]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl max-h-[80vh] flex flex-col p-0 sm:rounded-xl">
        <DialogHeader className="p-4 pb-2 border-b">
          <DialogTitle>Search Chats</DialogTitle>
          <div className="pt-2">
            <Input 
              autoFocus
              placeholder="Search by title..." 
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full"
            />
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 p-2">
          {filteredConversations.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground text-sm">
              No chats found.
            </div>
          ) : (
            <div className="space-y-1">
              {filteredConversations.map((conv) => (
                <button
                  key={conv.id}
                  onClick={() => {
                    onOpenChange(false);
                    navigate(`/c/${conv.id}`);
                  }}
                  className="w-full flex flex-col items-start gap-1 p-3 rounded-lg hover:bg-accent text-left transition-colors"
                >
                  <span className="font-medium text-sm truncate w-full">{conv.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {new Date(conv.updatedAt).toLocaleDateString(undefined, {
                      month: 'short', day: 'numeric', year: 'numeric'
                    })} • {conv.messageCount} messages
                  </span>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
