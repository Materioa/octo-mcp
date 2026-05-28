import type { Memory } from "@/types";
import Dexie, { type EntityTable } from "dexie";

const memDb = new Dexie("MCPMemoryDB") as Dexie & {
  memories: EntityTable<Memory, "id">;
};
memDb.version(1).stores({
  memories: "id, createdAt",
});
const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
const defaultApiUrl = isLocal ? "http://localhost:3001" : "https://mcp.getmaterio.app";
const SUPERMEMORY_API = (import.meta.env.VITE_API_URL || defaultApiUrl) + "/api/memory";

export class MemoryManager {
  private apiKey: string;
  private containerTag: string;

  constructor(apiKey: string, userId?: string) {
    this.apiKey = apiKey;
    this.containerTag = userId ? `user-${userId}` : "mcp-chat-user";
  }

  private async request(path: string, method: string, body?: unknown) {
    const res = await fetch(`${SUPERMEMORY_API}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Supermemory API error ${res.status}: ${text}`);
    }
    return res.json();
  }

  async addMemory(content: string, metadata?: Record<string, unknown>): Promise<void> {
    if (!this.apiKey) {
      await this.addLocalMemory(content, metadata);
      return;
    }
    try {
      await this.request("/memories", "POST", {
        content,
        containerTag: this.containerTag,
        metadata: metadata ?? {},
      });
    } catch {
      await this.addLocalMemory(content, metadata);
    }
  }

  async searchMemories(query: string, limit = 10): Promise<Memory[]> {
    if (!this.apiKey) {
      return this.searchLocalMemories(query, limit);
    }
    try {
      const result = await this.request("/search", "POST", {
        q: query,
        containerTag: this.containerTag,
        limit,
      });
      return (result.results ?? []).map((r: any, i: number) => ({
        id: r.id ?? `mem-${i}`,
        content: r.summary ?? r.content ?? r.text ?? r.title ?? "",
        metadata: r.metadata,
        createdAt: Date.now(),
      }));
    } catch {
      return this.searchLocalMemories(query, limit);
    }
  }

  async listMemories(limit = 50): Promise<Memory[]> {
    if (!this.apiKey) {
      return this.listLocalMemories(limit);
    }
    try {
      const result = await this.request("/memories/list", "POST", {
        containerTag: this.containerTag,
        limit,
      });
      return (result.memories ?? result.documents ?? []).map((d: any) => ({
        id: d.id,
        content: d.summary ?? d.content ?? d.text ?? d.title ?? "",
        metadata: d.metadata,
        createdAt: d.createdAt ? new Date(d.createdAt).getTime() : Date.now(),
      }));
    } catch {
      return this.listLocalMemories(limit);
    }
  }

  async deleteMemory(id: string): Promise<void> {
    if (!this.apiKey) {
      await this.deleteLocalMemory(id);
      return;
    }
    try {
      await this.request(`/memories/${id}`, "DELETE");
    } catch {
      await this.deleteLocalMemory(id);
    }
  }

  private async addLocalMemory(content: string, metadata?: Record<string, unknown>) {
    const memory: Memory = {
      id: crypto.randomUUID(),
      content,
      metadata,
      createdAt: Date.now(),
    };
    await memDb.memories.put(memory);
  }

  private async searchLocalMemories(query: string, limit: number): Promise<Memory[]> {
    const all = await this.listLocalMemories(limit * 3);
    const words = query.toLowerCase().split(/\s+/);
    return all
      .map((m) => ({
        ...m,
        score: words.filter((w) => m.content.toLowerCase().includes(w)).length,
      }))
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private async listLocalMemories(limit: number): Promise<Memory[]> {
    try {
      return await memDb.memories.orderBy("createdAt").reverse().limit(limit).toArray();
    } catch {
      return [];
    }
  }

  private async deleteLocalMemory(id: string) {
    try {
      await memDb.memories.delete(id);
    } catch {}
  }
}

let instance: MemoryManager | null = null;

export function getMemoryManager(apiKey: string, userId?: string): MemoryManager {
  if (!instance || apiKey !== "" || (instance as any).containerTag !== (userId ? `user-${userId}` : "mcp-chat-user")) {
    instance = new MemoryManager(apiKey, userId);
  }
  return instance;
}
