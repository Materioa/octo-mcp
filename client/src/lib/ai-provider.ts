import type { MCPTool } from "@/types";

export interface AIMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: AIToolCall[];
}

export interface AIToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface AIProvider {
  streamChat(
    messages: AIMessage[],
    tools: MCPTool[],
    onToken: (token: string) => void,
    onToolCall: (toolCall: AIToolCall) => void,
    onDone: () => void,
    onError: (error: Error) => void
  ): Promise<void>;
  abort(): void;
}

export function mcpToolsToAITools(tools: MCPTool[]): any[] {
  return tools.map((t) => ({
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  }));
}
