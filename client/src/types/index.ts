export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  result?: string;
  error?: string;
  status: "pending" | "running" | "completed" | "error" | "awaiting_user_input";
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  attachments?: {
    id: string;
    name: string;
    url: string;
    previewUrl?: string;
    extractedText?: string;
    extension: string;
  }[];
  toolCalls?: ToolCall[];
  timestamp: number;
  isStreaming?: boolean;
  rating?: "like" | "dislike" | null;
  modelUsed?: string;
  parentId?: string;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
  isTemporary?: boolean;
  visibility?: "private" | "public";
}

export interface Memory {
  id: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
}

export type ProviderId =
  | "openrouter-free"
  | "openrouter"
  | "openai"
  | "anthropic"
  | "gemini"
  | "nvidia"
  | "llama"
  | "qwen"
  | "kimi"
  | "perplexity"
  | "custom";

export interface ProviderPreset {
  id: ProviderId;
  name: string;
  baseUrl: string;
  defaultModel: string;
  models: string[];
  keyPlaceholder: string;
}

export interface AIProviderConfig {
  providerId: ProviderId;
  baseUrl: string;
  apiKey: string;
  model: string;
}

export interface Skill {
  id: string;
  name: string;
  content: string;
  createdAt: number;
}

export interface Settings {
  aiProvider: AIProviderConfig;
  theme: "light" | "dark" | "system";
  personality: "friendly" | "nerdy" | "explainer" | "default";
  customInstructions?: string;
  exaSearchEnabled?: boolean;
  skills: Skill[];
}

export interface MCPTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}
