import { z } from "zod";

const SUPERMEMORY_API = "https://api.supermemory.ai/v3";

export const memoryTool = {
  name: "save_to_memory",
  description: `Save important information about the user, their preferences, or the conversation to long-term memory.
Use this ONLY for significant facts or explicitly requested saves (e.g. "remember that I use Windows", or "save this snippet").`,
  inputSchema: {
    content: z.string().describe("The content to save to memory."),
    containerTag: z.string().optional().describe("Internal tag for the user. Injected by the client automatically."),
  },
};

export async function handleSaveMemory(args: { content: string, containerTag?: string }) {
  const { content, containerTag = "mcp-chat-user" } = args;
  const apiKey = process.env.VITE_SUPERMEMORY_API_KEY;
  
  if (!apiKey) {
    // If no API key, we fallback or just error since this is a backend tool
    return {
      content: [{ type: "text" as const, text: "Warning: No VITE_SUPERMEMORY_API_KEY configured in .env. Memory could not be saved to Supermemory API." }],
    };
  }

  try {
    const res = await fetch(`${SUPERMEMORY_API}/memories`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        content,
        containerTag,
        metadata: {},
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return {
        content: [{ type: "text" as const, text: `Supermemory API error ${res.status}: ${text}` }],
        isError: true,
      };
    }

    return {
      content: [{ type: "text" as const, text: "Successfully saved to memory." }],
    };
  } catch (err: any) {
    return {
      content: [{ type: "text" as const, text: `Error saving memory: ${err.message}` }],
      isError: true,
    };
  }
}
