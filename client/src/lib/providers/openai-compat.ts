import type {
  AIProvider,
  AIMessage,
  AIToolCall,
} from "@/lib/ai-provider";
import type { MCPTool } from "@/types";
import { mcpToolsToAITools } from "@/lib/ai-provider";

export class OpenAICompatProvider implements AIProvider {
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private abortController: AbortController | null = null;

  constructor(baseUrl: string = "", apiKey: string = "", model: string = "") {
    let cleanBaseUrl = (baseUrl || "").replace(/\/+$/, "");
    if (cleanBaseUrl.endsWith("/chat/completions")) {
      cleanBaseUrl = cleanBaseUrl.replace(/\/chat\/completions$/, "");
    }
    this.baseUrl = cleanBaseUrl;
    this.apiKey = apiKey || "";
    this.model = model || "";
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  async streamChat(
    messages: AIMessage[],
    tools: MCPTool[],
    onToken: (token: string) => void,
    onToolCall: (toolCall: AIToolCall) => void,
    onDone: () => void,
    onError: (error: Error) => void
  ): Promise<void> {
    this.abortController = new AbortController();

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: true,
    };

    const aiTools = mcpToolsToAITools(tools);
    if (aiTools.length > 0) {
      body.tools = aiTools;
    }

    try {
      if (!this.baseUrl || !this.baseUrl.startsWith("http")) {
        throw new Error("No AI provider configured. Please set a provider in Settings.");
      }

      // In dev, Vite proxies /api → localhost:3001. In production, we need the absolute URL.
      const apiBase = import.meta.env.VITE_API_URL
        || (import.meta.env.DEV ? "" : "https://mcp.getmaterio.app");
      const proxyUrl = `${apiBase}/api/chat/completions`;

      const res = await fetch(proxyUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Target-Url": this.baseUrl,
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: this.abortController.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`AI API error ${res.status}: ${text}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body");

      const decoder = new TextDecoder();
      let buffer = "";
      const toolCallsMap = new Map<number, AIToolCall>();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            if (!delta) continue;

            if (delta.content) {
              onToken(delta.content);
            }

            if (delta.tool_calls) {
              for (const tc of delta.tool_calls) {
                const index = tc.index;
                let existing = toolCallsMap.get(index);
                if (!existing) {
                  existing = {
                    id: tc.id ?? "",
                    type: "function",
                    function: {
                      name: tc.function?.name ?? "",
                      arguments: tc.function?.arguments ?? "",
                    },
                  };
                  toolCallsMap.set(index, existing);
                } else {
                  if (tc.id) existing.id = tc.id;
                  if (tc.function?.name) existing.function.name += tc.function.name;
                  if (tc.function?.arguments) existing.function.arguments += tc.function.arguments;
                }
                
                // Emit the accumulated tool call
                onToolCall(existing);
              }
            }
          } catch {}
        }
      }

      onDone();
    } catch (err: any) {
      if (err.name === "AbortError") {
        onDone();
      } else {
        onError(err);
      }
    }
  }
}
