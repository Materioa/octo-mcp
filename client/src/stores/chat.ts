import { create } from "zustand";
import type { Conversation, Message, ToolCall } from "@/types";
import {
  getConversations,
  getMessages,
  saveMessage,
  saveConversation,
  deleteConversation as dbDeleteConversation,
} from "@/lib/db";
import { useSettingsStore } from "./settings";
import { useAuthStore } from "./auth";
import { OpenAICompatProvider } from "@/lib/providers/openai-compat";
import type { AIMessage, AIToolCall } from "@/lib/ai-provider";
import { mcpClient } from "@/lib/mcp-client";

interface ChatStore {
  conversations: Conversation[];
  activeConversationId: string | null;
  messages: Message[];
  allMessages: Message[];
  isLoading: boolean;
  isSending: boolean;

  loadConversations: () => Promise<void>;
  createConversation: () => Promise<string>;
  setActiveConversation: (id: string) => Promise<void>;
  clearActiveConversation: () => void;
  deleteConversation: (id: string) => Promise<void>;
  addMessage: (message: Message) => Promise<void>;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setIsLoading: (v: boolean) => void;
  setIsSending: (v: boolean) => void;
  abortStream: () => void;
  setAbortController: (ctrl: AbortController | null) => void;
  _abortController: AbortController | null;
  generatingConversationIds: string[];
  generateResponse: (conversationId: string, modelOverride?: string) => Promise<void>;
  switchBranch: (messageId: string) => void;
  branchMessage: (messageId: string, newContent: string) => Promise<void>;
  retryMessage: (messageId: string, modelOverride?: string) => Promise<void>;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  allMessages: [],
  isLoading: false,
  isSending: false,
  _abortController: null as AbortController | null,
  generatingConversationIds: [],

  loadConversations: async () => {
    const conversations = await getConversations();
    set({ conversations });
  },

  createConversation: async () => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const conversation: Conversation = {
      id,
      title: "New Chat",
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
    };
    
    // Optimistic UI update
    set((s) => ({
      conversations: [conversation, ...s.conversations],
      activeConversationId: id,
      messages: [],
    }));

    // Background DB save (do not await to keep UI instant)
    saveConversation(conversation).catch(console.error);
    
    return id;
  },

  setActiveConversation: async (id) => {
    set({ activeConversationId: id, isLoading: true });
    const conversations = get().conversations;
    const conv = conversations.find(c => c.id === id);
    if (conv) document.title = conv.title;
    
    const messages = await getMessages(id);
    
    // Auto-patch missing parentIds chronologically for backward compatibility
    for (let i = 1; i < messages.length; i++) {
      const current = messages[i];
      const prev = messages[i - 1];
      if (current && prev && !current.parentId) {
        current.parentId = prev.id;
      }
    }
    
    // Auto-select the most recent branch leaf
    if (messages.length > 0) {
      // Very basic: just use the raw messages for now, or build the tree if we have parentId
      // Find the last message (the one with no children)
      const childMap = new Map<string, string[]>();
      messages.forEach(m => {
        if (m.parentId) {
          if (!childMap.has(m.parentId)) childMap.set(m.parentId, []);
          childMap.get(m.parentId)!.push(m.id);
        }
      });
      // Find leaves (messages that aren't parents of anyone)
      const leaves = messages.filter(m => !childMap.has(m.id));
      // Pick the latest leaf
      leaves.sort((a, b) => b.timestamp - a.timestamp);
      if (leaves.length > 0) {
        const leaf = leaves[0];
        if (leaf) {
          set({ allMessages: messages, isLoading: false });
          get().switchBranch(leaf.id);
          return;
        }
      }
    }
    
    set({ messages, allMessages: messages, isLoading: false });
  },

  clearActiveConversation: () => {
    set({ activeConversationId: null, messages: [], allMessages: [] });
  },

  deleteConversation: async (id) => {
    await dbDeleteConversation(id);
    const { activeConversationId } = get();
    set((s) => ({
      conversations: s.conversations.filter((c) => c.id !== id),
      ...(activeConversationId === id
        ? { activeConversationId: null, messages: [], allMessages: [] }
        : {}),
    }));
  },

  addMessage: async (message) => {
    const { activeConversationId, conversations, messages: currentMessages } = get();
    if (!activeConversationId) return;

    // 1. Optimistic UI Update
    const updatedMessages = [...currentMessages, message];
    const conv = conversations.find((c) => c.id === activeConversationId);
    
    let updatedTitle = conv?.title;
    if (conv?.title === "New Chat" && message.role === "user") {
      updatedTitle = message.content.slice(0, 50) + (message.content.length > 50 ? "..." : "");
    }

    const updatedConv = conv
      ? { ...conv, updatedAt: Date.now(), messageCount: updatedMessages.length, title: updatedTitle || "New Chat" }
      : conv;

    set((s) => ({
      messages: updatedMessages,
      allMessages: [...s.allMessages, message],
      conversations: updatedConv
        ? s.conversations.map((c) => (c.id === activeConversationId ? updatedConv : c))
        : s.conversations,
    }));

    // 2. Do not save streaming messages yet
    if (message.isStreaming) {
      return;
    }

    // 3. Save to DB and rollback if fails (e.g. rate limit)
    try {
      if (updatedConv && updatedTitle) {
        document.title = updatedTitle;
        saveConversation(updatedConv).catch(console.error);
      }
      await saveMessage(activeConversationId, message);
    } catch (err) {
      // Rollback UI to previous state on failure
      set((s) => ({
        messages: currentMessages,
        conversations: conversations,
      }));
      throw err;
    }
  },

  updateMessage: (id, updates) => {
    set((s) => ({
      messages: s.messages.map((m) =>
        m.id === id ? { ...m, ...updates } : m
      ),
    }));

    // If stream finishes or updates important metadata, save to DB in background
    if (updates.isStreaming === false || updates.rating || updates.modelUsed) {
      const { activeConversationId, messages } = get();
      const msg = messages.find((m) => m.id === id);
      if (activeConversationId && msg) {
        saveMessage(activeConversationId, msg).catch(console.error);
      }
    }
  },

  setIsLoading: (v) => set({ isLoading: v }),
  setIsSending: (v) => set({ isSending: v }),
  abortStream: () => {
    const s = get() as any;
    if (s._abortController) {
      s._abortController.abort();
      set({ _abortController: null, isSending: false });
    }
  },
  setAbortController: (ctrl) => set({ _abortController: ctrl } as any),

  generateResponse: async (conversationId, modelOverride) => {
    const { messages, generatingConversationIds, isSending, updateMessage } = get();
    if (isSending || generatingConversationIds.includes(conversationId)) return;

    // Use current settings
    const settings = useSettingsStore.getState();
    const providerConfig = settings.aiProvider;
    const provider = new OpenAICompatProvider(
      providerConfig.baseUrl,
      providerConfig.apiKey,
      modelOverride || providerConfig.model
    );
    
    set({ 
      isSending: true, 
      generatingConversationIds: [...generatingConversationIds, conversationId] 
    });
    get().setAbortController(provider["abortController"] as any);

    const parentId = messages[messages.length - 1]?.id;

    // Fetch all memory context to inject into system prompt
    let memoryContext = "";
    try {
      const { getMemoryManager } = await import("@/lib/memory");
      const auth = useAuthStore.getState();
      const userId = auth.user?.id || auth.anonymousId;
      const mem = getMemoryManager(import.meta.env.VITE_SUPERMEMORY_API_KEY || "", userId);
      const memories = await mem.listMemories(50);
      if (memories.length > 0) {
        memoryContext =
          "\n\nRelevant user memories and preferences:\n" +
          memories.map((m) => `- ${m.content}`).join("\n");
      }
    } catch (err) {
      console.error("Memory error:", err);
    }

    // Filter messages up to the end of the current branch
    const systemPrompt = `You are a helpful AI assistant with access to MCP tools. Be concise and helpful. Use tools when appropriate to help the user.
IMPORTANT RULE: Your PRIMARY tool to reference anything from the Materio course library MUST be \`SnapSearch\` (also known as vectorless search). Prioritize using SnapSearch before falling back to other search tools for course content.
Current personality: ${settings.personality}${memoryContext}`;

    const aiMessages: AIMessage[] = [
      { role: "system", content: systemPrompt },
      ...messages.map((m) => {
        let content = m.content;
        if (m.attachments?.length) {
          content += '\n\n' + m.attachments.map((a: any) => `<file name="${a.name}" url="${a.url}">\n${a.extractedText || ''}\n</file>`).join('\n');
        }
        return {
          role: m.role,
          content,
          toolCalls: m.toolCalls,
        } as AIMessage;
      }),
    ];

    const aiMessageId = crypto.randomUUID();

    // Add empty placeholder message
    const newMsg: Message = {
      id: aiMessageId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
      modelUsed: modelOverride || providerConfig.model,
      parentId,
    };
    
    // Switch to target conversation if we are still on it
    if (get().activeConversationId === conversationId) {
      await get().addMessage(newMsg);
    } else {
      // Just save to DB directly if it's in background
      await saveMessage(conversationId, newMsg).catch(console.error);
    }

    const toolCallMap = new Map<string, ToolCall>();
    let fullResponse = "";
    
    let activeTools: any[] = [];
    if (mcpClient.isConnected()) {
      try {
        activeTools = await mcpClient.listTools();
      } catch (err) {}
    }

    const runTurn = async (): Promise<void> => {
      const pendingToolCalls: AIToolCall[] = [];

      try {
        await provider.streamChat(
          aiMessages,
          activeTools,
          (token) => {
            fullResponse += token;
            if (get().activeConversationId === conversationId) {
               updateMessage(aiMessageId, { content: fullResponse });
            }
          },
          (tc) => {
            if (!tc.id || !tc.function.name) return;
            let existing = toolCallMap.get(tc.id);
            if (!existing) {
              existing = {
                id: tc.id,
                name: tc.function.name,
                args: {},
                status: "pending",
              };
              toolCallMap.set(tc.id, existing);
              pendingToolCalls.push(tc);
            } else {
              const pTc = pendingToolCalls.find(p => p.id === tc.id);
              if (pTc) pTc.function.arguments = tc.function.arguments;
            }
            if (get().activeConversationId === conversationId) {
              updateMessage(aiMessageId, { toolCalls: Array.from(toolCallMap.values()) });
            }
          },
          () => {
            // internal stream finish handler
          },
          (err) => {
            console.error("Stream error:", err);
            fullResponse += "\n\n**Error:** " + err.message;
            if (get().activeConversationId === conversationId) {
              updateMessage(aiMessageId, { content: fullResponse });
            }
          }
        );

        if (pendingToolCalls.length > 0) {
          aiMessages.push({
            role: "assistant",
            content: fullResponse || "",
            tool_calls: pendingToolCalls,
          });

          for (const tc of pendingToolCalls) {
            const existingTc = toolCallMap.get(tc.id);
            let args = {};
            try {
              args = JSON.parse(tc.function.arguments || "{}");
            } catch (e) {
              console.warn("Failed to parse tool arguments:", tc.function.arguments);
            }

            if (existingTc) {
              existingTc.args = args;
              existingTc.status = "running";
              if (get().activeConversationId === conversationId) {
                updateMessage(aiMessageId, { toolCalls: Array.from(toolCallMap.values()) });
              }
            }

            try {
              let finalArgs = args;
              if (tc.function.name === "save_to_memory") {
                 const auth = useAuthStore.getState();
                 const userId = auth.user?.id || auth.anonymousId;
                 finalArgs = { ...args, containerTag: `user-${userId}` };
              }
              const result = await mcpClient.callTool(tc.function.name, finalArgs);
              if (existingTc) {
                existingTc.result = result.slice(0, 2000);
                existingTc.status = "completed";
              }
              aiMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: result,
              });
            } catch (err: any) {
              if (existingTc) {
                existingTc.error = err.message;
                existingTc.status = "error";
              }
              aiMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: `Error: ${err.message}`,
              });
            }

            if (get().activeConversationId === conversationId) {
              updateMessage(aiMessageId, { toolCalls: Array.from(toolCallMap.values()) });
            }
          }

          fullResponse += "\n\n";
          await runTurn();
        }
      } catch (err: any) {
         console.error("Start stream error:", err);
         fullResponse += "\n\n**Error:** " + err.message;
         if (get().activeConversationId === conversationId) {
           updateMessage(aiMessageId, {
             content: fullResponse,
           });
         }
      }
    };

    await runTurn();

    // Finalize
    if (get().activeConversationId === conversationId) {
      updateMessage(aiMessageId, { isStreaming: false, content: fullResponse });
    } else {
      saveMessage(conversationId, { ...newMsg, content: fullResponse, isStreaming: false, toolCalls: Array.from(toolCallMap.values()) }).catch(console.error);
    }
    const { generatingConversationIds: currentGenerating } = get();
    set({
      isSending: false,
      generatingConversationIds: currentGenerating.filter(id => id !== conversationId)
    });
  },

  switchBranch: async (messageId) => {
    const activeConv = get().activeConversationId;
    if (!activeConv) return;
    const allMessages = get().allMessages;
    let leafId: string = messageId;
    const visited = new Set<string>();
    while (true) {
      if (visited.has(leafId)) break;
      visited.add(leafId);
      
      const children = allMessages.filter(m => m.parentId === leafId);
      if (children.length === 0) break;
      
      children.sort((a, b) => b.timestamp - a.timestamp);
      const firstChild = children[0];
      if (!firstChild) break;
      leafId = firstChild.id;
    }

    const line: Message[] = [];
    let currentId: string | undefined = leafId;
    
    while (currentId) {
      const msg = allMessages.find(m => m.id === currentId);
      if (!msg) break;
      line.unshift(msg);
      currentId = msg.parentId;
    }
    
    set({ messages: line });
  },

  branchMessage: async (messageId, newContent) => {
    const { activeConversationId, messages } = get();
    if (!activeConversationId) return;

    // Find the message being edited
    const originalMsg = messages.find(m => m.id === messageId);
    if (!originalMsg) return;

    const newMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: newContent,
      timestamp: Date.now(),
      parentId: originalMsg.parentId, // Sibling of the original message
    };

    // Construct the new line up to the parent
    const parentIndex = messages.findIndex(m => m.id === originalMsg.parentId);
    const newMessages = parentIndex >= 0 
      ? [...messages.slice(0, parentIndex + 1), newMsg]
      : [newMsg]; // if no parent (root message)

    set({ messages: newMessages, allMessages: [...get().allMessages, newMsg] });
    await saveMessage(activeConversationId, newMsg);
    
    // Auto trigger response
    await get().generateResponse(activeConversationId);
  },

  retryMessage: async (messageId, modelOverride) => {
    const { activeConversationId, allMessages, generateResponse } = get();
    if (!activeConversationId) return;

    const originalAiMsg = allMessages.find(m => m.id === messageId);
    if (!originalAiMsg || !originalAiMsg.parentId) return;

    const line: Message[] = [];
    let currentId: string | undefined = originalAiMsg.parentId;
    while (currentId) {
      const msg = allMessages.find(m => m.id === currentId);
      if (!msg) break;
      line.unshift(msg);
      currentId = msg.parentId;
    }
    
    set({ messages: line });
    await generateResponse(activeConversationId, modelOverride);
  }
}));
