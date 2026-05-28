import { useState, useEffect, useCallback } from "react";
import { useSettingsStore } from "@/stores/settings";
import { getMemoryManager } from "@/lib/memory";
import type { Memory } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";

interface MemoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function MemoryPanel({ open, onOpenChange }: MemoryPanelProps) {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const supermemoryApiKey = import.meta.env.VITE_SUPERMEMORY_API_KEY || "";

  const loadMemories = useCallback(async () => {
    setLoading(true);
    try {
      const mem = getMemoryManager(supermemoryApiKey);
      const results = searchQuery
        ? await mem.searchMemories(searchQuery)
        : await mem.listMemories();
      setMemories(results);
    } catch (err) {
      console.error("Failed to load memories:", err);
    } finally {
      setLoading(false);
    }
  }, [supermemoryApiKey, searchQuery]);

  useEffect(() => {
    if (open) loadMemories();
  }, [open, loadMemories]);

  const handleDelete = async (id: string) => {
    try {
      const mem = getMemoryManager(supermemoryApiKey);
      await mem.deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {}
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div
        className="fixed inset-0 bg-black/80"
        onClick={() => onOpenChange(false)}
      />
      <div className="fixed right-0 top-0 h-full w-96 border-l border-border bg-background shadow-lg">
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between border-b border-border p-4">
            <h2 className="text-lg font-semibold">Memory</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </Button>
          </div>

          <div className="p-4">
            <Input
              placeholder="Search memories..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && loadMemories()}
            />
          </div>

          <ScrollArea className="flex-1">
            <div className="space-y-2 p-4 pt-0">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
                </div>
              ) : memories.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  {searchQuery ? "No matching memories" : "No memories stored yet"}
                </p>
              ) : (
                memories.map((mem) => (
                  <div
                    key={mem.id}
                    className="group relative rounded-lg border border-border p-3"
                  >
                    <p className="pr-8 text-sm">{mem.content}</p>
                    <p className="mt-1 text-[10px] text-muted-foreground">
                      {new Date(mem.createdAt).toLocaleDateString()}
                    </p>
                    <button
                      className="absolute right-2 top-2 hidden rounded p-1 text-muted-foreground hover:bg-destructive hover:text-destructive-foreground group-hover:block"
                      onClick={() => handleDelete(mem.id)}
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
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
