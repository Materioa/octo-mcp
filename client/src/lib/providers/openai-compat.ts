import type {
  AIProvider,
  AIMessage,
  AIToolCall,
} from "@/lib/ai-provider";
import type { MCPTool } from "@/types";
import { mcpToolsToAITools } from "@/lib/ai-provider";

function formatMessagesForAPI(messages: AIMessage[]): any[] {
  const result: any[] = [];

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i];
    if (!m) continue;
    const role = m.role;
    let content = m.content;
    
    if (Array.isArray(content)) {
      content = content.map((c: any) => {
        if (c.type === "text") return { type: "text", text: c.text };
        if (c.type === "image_url") return { type: "image_url", image_url: c.image_url };
        return c;
      });
    }

    const cleanMsg: any = {
      role,
      content: content || "",
    };

    if (role === "tool") {
      cleanMsg.tool_call_id = m.tool_call_id;
      result.push(cleanMsg);
      continue;
    }

    const rawToolCalls = (m as any).toolCalls || m.tool_calls;
    const hasToolCalls = rawToolCalls && Array.isArray(rawToolCalls) && rawToolCalls.length > 0;
    
    if (role === "assistant" && hasToolCalls) {
      cleanMsg.tool_calls = rawToolCalls.map((tc: any) => ({
        id: tc.id,
        type: "function",
        function: {
          name: tc.name || tc.function?.name,
          arguments: typeof tc.args === "object" ? JSON.stringify(tc.args) : (tc.arguments || tc.function?.arguments || "{}"),
        }
      }));
    }

    result.push(cleanMsg);

    if (role === "assistant" && hasToolCalls) {
      const nextMsg = messages[i + 1];
      const nextIsTool = nextMsg && nextMsg.role === "tool";
      
      if (!nextIsTool) {
        for (const tc of rawToolCalls) {
          if (tc.status === "completed" || tc.status === "error" || tc.result || tc.error) {
            result.push({
              role: "tool",
              tool_call_id: tc.id,
              content: tc.result || tc.error || "No result",
            });
          }
        }
      }
    }
  }

  return result;
}

function sanitizeMessagesForNonToolProvider(messages: any[]): any[] {
  const sanitized: any[] = [];
  
  for (const m of messages) {
    if (!m) continue;
    
    if (m.role === "system") {
      sanitized.push({ ...m });
      continue;
    }
    
    if (m.role === "assistant") {
      let content = m.content || "";
      if (m.tool_calls && m.tool_calls.length > 0) {
        const callsDesc = m.tool_calls.map((tc: any) => 
          `[Called tool: ${tc.function?.name} with arguments: ${tc.function?.arguments}]`
        ).join("\n");
        content = `${content}\n${callsDesc}`.trim();
      }
      sanitized.push({
        role: "assistant",
        content: content || "Executing tool...",
      });
      continue;
    }
    
    if (m.role === "tool") {
      const content = `[Tool Result: ${m.content || "No result"}]`;
      const last = sanitized[sanitized.length - 1];
      if (last && last.role === "user") {
        last.content = `${last.content}\n${content}`.trim();
      } else {
        sanitized.push({
          role: "user",
          content,
        });
      }
      continue;
    }
    
    if (m.role === "user") {
      const last = sanitized[sanitized.length - 1];
      if (last && last.role === "user") {
        last.content = `${last.content}\n${m.content || ""}`.trim();
      } else {
        sanitized.push({ ...m });
      }
    }
  }
  
  return sanitized;
}

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

    // In dev, Vite proxies /api → localhost:3001. In production, we need the absolute URL.
    const apiBase = import.meta.env.VITE_API_URL
      || (import.meta.env.DEV ? "" : "https://mcp.getmaterio.app");
    
    const isChatGPT = this.baseUrl.includes("/backend-api/chatgpt") || this.baseUrl.includes("/api/chatgpt") || this.model.startsWith("chatgpt:") || this.model.startsWith("chatgpt");

    const body: Record<string, any> = {
      model: this.model,
      stream: true,
    };

    const cleanMessages = formatMessagesForAPI(messages);

    if (isChatGPT) {
      body.input = cleanMessages
        .filter((m) => m.role !== "system")
        .map((m) => {
          if (m.role === "tool") {
            return {
              type: "function_call_output",
              call_id: m.tool_call_id,
              output: typeof m.content === "string" ? m.content : JSON.stringify(m.content || {}),
            };
          }
          
          const rawToolCalls = (m as any).toolCalls || m.tool_calls;
          const hasToolCalls = rawToolCalls && Array.isArray(rawToolCalls) && rawToolCalls.length > 0;
          
          if (m.role === "assistant" && hasToolCalls) {
            const contentParts: any[] = [];
            if (m.content && typeof m.content === "string") {
              contentParts.push({ type: "output_text", text: m.content });
            }
            for (const tc of rawToolCalls) {
              contentParts.push({
                type: "function_call",
                name: tc.name || tc.function?.name,
                arguments: typeof tc.args === "object" ? JSON.stringify(tc.args) : (tc.arguments || tc.function?.arguments || "{}"),
                call_id: tc.id,
              });
            }
            return {
              type: "message",
              role: "assistant",
              content: contentParts,
            };
          }
          
          return {
            type: "message",
            role: m.role,
            content: typeof m.content === "string" ? m.content : (m.content?.[0]?.text || ""),
          };
        });
      
      const systemMessage = cleanMessages.find(m => m.role === "system");
      if (systemMessage && typeof systemMessage.content === "string") {
        body.instructions = systemMessage.content;
      }

      const aiTools = mcpToolsToAITools(tools);
      if (aiTools.length > 0) {
        body.tools = aiTools.map((t) => {
          if (t.type === "function" && t.function) {
            return {
              type: "function",
              name: t.function.name,
              description: t.function.description,
              parameters: t.function.parameters,
            };
          }
          return t;
        });
      }
    } else {
      const lowerUrl = this.baseUrl.toLowerCase();
      const lowerModel = (this.model || "").toLowerCase();
      const isFreeModel = lowerModel === "openrouter/free" || lowerModel.endsWith(":free");

      const isToolsSupported = 
        !isFreeModel && (
          lowerUrl.includes("openai.com") || 
          lowerUrl.includes("anthropic.com") || 
          lowerUrl.includes("googleapis.com") || 
          lowerUrl.includes("openrouter.ai") ||
          lowerUrl.includes("deepseek.com") ||
          lowerUrl.includes("groq.com") ||
          lowerUrl.includes("/backend-api/chatgpt") ||
          lowerUrl.includes("/api/chatgpt")
        );

      if (isToolsSupported) {
        body.messages = cleanMessages;
        const aiTools = mcpToolsToAITools(tools);
        if (aiTools.length > 0) {
          body.tools = aiTools;
        }
      } else {
        body.messages = sanitizeMessagesForNonToolProvider(cleanMessages);
      }
    }

    try {
      if (!isChatGPT && (!this.baseUrl || !this.baseUrl.startsWith("http"))) {
        throw new Error("No AI provider configured. Please set a provider in Settings.");
      }
      const proxyUrl = isChatGPT
        ? `${apiBase}/backend-api/chatgpt/responses`
        : `${apiBase}/backend-api/chat/completions`;

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };

      if (!isChatGPT) {
        headers["X-Target-Url"] = this.baseUrl;
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      // Clean model name for upstream ChatGPT proxy if prefix is present
      if (isChatGPT && body.model && typeof body.model === "string" && body.model.startsWith("chatgpt:")) {
        body.model = body.model.replace(/^chatgpt:/, "");
      }

      const res = await fetch(proxyUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: this.abortController.signal,
        credentials: isChatGPT ? "include" : "same-origin",
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
            
            if (isChatGPT) {
              if (parsed.delta && typeof parsed.delta === "string") {
                onToken(parsed.delta);
              } else if (parsed.choices?.[0]?.delta?.content) {
                onToken(parsed.choices[0].delta.content);
              }
              continue;
            }

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
