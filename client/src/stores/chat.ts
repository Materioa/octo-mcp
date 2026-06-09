import { create } from "zustand";
import type { Conversation, Message, ToolCall } from "@/types";
import {
  getConversations,
  getConversation,
  getMessages,
  saveMessage,
  saveConversation,
  deleteConversation as dbDeleteConversation,
  deleteMessage as dbDeleteMessage,
} from "@/lib/db";
import { useSettingsStore } from "./settings";
import { useAuthStore } from "./auth";
import { useAlertStore } from "./alert";
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
  isSearchMode: boolean;
  setIsSearchMode: (val: boolean) => void;
  rateLimitResetTime: string | null;
  setRateLimitResetTime: (time: string | null) => void;

  loadConversations: () => Promise<void>;
  createConversation: (isTemporary?: boolean) => Promise<string>;
  setActiveConversation: (id: string) => Promise<boolean>;
  clearActiveConversation: () => void;
  deleteConversation: (id: string) => Promise<void>;
  setConversationVisibility: (id: string, visibility: "private" | "public") => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
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
  resolveUserInput: ((result: any) => void) | null;
  submitUserInput: (toolCallId: string, result: any) => void;
  activeDocument: { url: string; format: string; title: string } | null;
  setActiveDocument: (doc: { url: string; format: string; title: string } | null) => void;
  sharedContext: string | null;
  setSharedContext: (context: string | null) => void;
  renameConversation: (id: string, newTitle: string) => Promise<void>;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  conversations: [],
  activeConversationId: null,
  messages: [],
  allMessages: [],
  isLoading: false,
  isSending: false,
  isSearchMode: false,
  setIsSearchMode: (val: boolean) => set({ isSearchMode: val }),
  rateLimitResetTime: null,
  setRateLimitResetTime: (time: string | null) => set({ rateLimitResetTime: time }),
  _abortController: null as AbortController | null,
  generatingConversationIds: [],
  resolveUserInput: null,
  
  submitUserInput: (toolCallId, result) => {
    const { resolveUserInput } = get();
    if (resolveUserInput) {
      resolveUserInput(result);
      set({ resolveUserInput: null });
    }
  },
  
  activeDocument: null,
  setActiveDocument: (doc) => set({ activeDocument: doc }),
  sharedContext: null,
  setSharedContext: (context) => set({ sharedContext: context }),

  loadConversations: async () => {
    const fetched = await getConversations();
    // Preserve any active shared conversation that we don't own so it doesn't disappear from UI
    const { activeConversationId, conversations: currentConvs } = get();
    if (activeConversationId) {
      const active = currentConvs.find(c => c.id === activeConversationId || c.shareId === activeConversationId);
      if (active && !fetched.find(c => c.id === active.id)) {
        fetched.push(active);
      }
    }
    set({ conversations: fetched });
  },

  createConversation: async (isTemporary = false) => {
    const id = crypto.randomUUID();
    const now = Date.now();
    const { user, anonymousId } = useAuthStore.getState();
    const userName = user?.displayName || user?.fullName || user?.firstName || user?.name || user?.username || (user?.email ? user.email.split('@')[0] : undefined) || undefined;

    const conversation: Conversation = {
      id,
      title: "New Chat",
      createdAt: now,
      updatedAt: now,
      messageCount: 0,
      isTemporary,
      visibility: "private",
      authorName: userName,
      userId: user?.id,
      anonymousId: !user ? anonymousId : undefined,
    };
    
    // Optimistic UI update
    set((s) => ({
      conversations: [conversation, ...s.conversations],
      activeConversationId: id,
      messages: [],
    }));

    // Background DB save (do not await to keep UI instant)
    if (!isTemporary) {
      saveConversation(conversation).catch(console.error);
    }
    
    return id;
  },

  setActiveConversation: async (id) => {
    set({ activeConversationId: id, isLoading: true });
    let conversations = get().conversations;
    let conv = conversations.find(c => c.id === id || c.shareId === id);
    if (!conv) {
      const fetchedConv = await getConversation(id);
      if (fetchedConv) {
        conv = fetchedConv;
        if (!get().conversations.find(c => c.id === fetchedConv.id)) {
          set((s) => ({ conversations: [...s.conversations, fetchedConv] }));
        }
      }
    }
    
    if (!conv) {
      set({ activeConversationId: null, isLoading: false });
      return false;
    }
    
    if (!conv.isTemporary) document.title = conv.title;
    
    const messages = await getMessages(id);
    
    // Auto-patch missing parentIds chronologically for backward compatibility
    for (let i = 1; i < messages.length; i++) {
      const current = messages[i];
      const prev = messages[i - 1];
      if (current && prev && !current.parentId) {
        current.parentId = prev.id;
      }
    }

    // Fix any stuck streaming states from interrupted generations
    messages.forEach(m => {
      if (m.isStreaming) {
        m.isStreaming = false;
        const conv = get().conversations.find(c => c.id === id || c.shareId === id);
        if (!conv?.isTemporary) {
          saveMessage(id, m).catch(() => {});
        }
      }
    });
    
    // Auto-select the most recent branch leaf
    if (messages.length > 0) {
      const childMap = new Map<string, string[]>();
      messages.forEach(m => {
        if (m.parentId) {
          if (!childMap.has(m.parentId)) childMap.set(m.parentId, []);
          childMap.get(m.parentId)!.push(m.id);
        }
      });
      const leaves = messages.filter(m => !childMap.has(m.id));
      leaves.sort((a, b) => b.timestamp - a.timestamp);
      if (leaves.length > 0) {
        const leaf = leaves[0];
        if (leaf) {
          set({ allMessages: messages, isLoading: false });
          get().switchBranch(leaf.id);
          return true;
        }
      }
    }
    
    set({ messages, allMessages: messages, isLoading: false });
    return true;
  },

  renameConversation: async (id: string, newTitle: string) => {
    let conv: Conversation | null | undefined = get().conversations.find(c => c.id === id);
    if (!conv) {
      conv = await getConversation(id);
      if (!conv) return;
    }
    const updated = { ...conv, title: newTitle };
    set({ conversations: get().conversations.map(c => c.id === id ? updated : c) });
    if (!updated.isTemporary) {
      saveConversation(updated).catch(console.error);
    }
  },

  clearActiveConversation: () => {
    set({ activeConversationId: null, messages: [], allMessages: [] });
    document.title = "Thinklet";
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

  setConversationVisibility: async (id, visibility) => {
    const { conversations } = get();
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;

    // Attach authorName if it's missing (for older conversations)
    let updatedAuthorName = conv.authorName;
    if (!updatedAuthorName || updatedAuthorName === "User") {
      const { user } = useAuthStore.getState();
      updatedAuthorName = user?.displayName || user?.fullName || user?.firstName || user?.name || user?.username || (user?.email ? user.email.split('@')[0] : undefined) || undefined;
    }

    let shareId = conv.shareId;
    if (visibility === "public") {
      // Always generate a new share link when turned public
      shareId = crypto.randomUUID();
    } else {
      // Clear share link when turned private
      shareId = undefined;
    }

    const updatedConv = { ...conv, visibility, authorName: updatedAuthorName, shareId };
    set(s => ({
      conversations: s.conversations.map(c => c.id === id ? updatedConv : c)
    }));

    if (!updatedConv.isTemporary) {
      await saveConversation(updatedConv);
    }
  },

  deleteMessage: async (id) => {
    const { allMessages, activeConversationId, conversations } = get();
    const conv = conversations.find(c => c.id === activeConversationId);
    
    // Find all descendants iteratively to delete the entire branch
    const idsToDelete = new Set([id]);
    let currentLevelIds = [id];
    
    while (currentLevelIds.length > 0) {
      const nextLevelIds = allMessages
        .filter((m) => m.parentId && currentLevelIds.includes(m.parentId))
        .map((m) => m.id);
        
      nextLevelIds.forEach((childId) => idsToDelete.add(childId));
      currentLevelIds = nextLevelIds;
    }
    
    const idsToDeleteArray = Array.from(idsToDelete);
    if (!conv?.isTemporary) {
      for (const deleteId of idsToDeleteArray) {
        await dbDeleteMessage(deleteId);
      }
    }
    
    set((s) => ({
      allMessages: s.allMessages.filter((m) => !idsToDelete.has(m.id)),
      messages: s.messages.filter((m) => !idsToDelete.has(m.id)),
    }));
  },

  addMessage: async (message) => {
    const { activeConversationId, conversations, messages: currentMessages } = get();
    if (!activeConversationId) return;

    // 1. Optimistic UI Update
    const updatedMessages = [...currentMessages, message];
    const conv = conversations.find((c) => c.id === activeConversationId);
    
    let updatedTitle = conv?.title;

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
      if (updatedConv && !updatedConv.isTemporary) {
        if (updatedTitle) document.title = updatedTitle;
        saveConversation(updatedConv).catch(console.error);
        await saveMessage(activeConversationId, message);
      }
    } catch (err) {
      // Rollback UI to previous state on failure
      const errorMsg = err instanceof Error ? err.message : String(err);
      let time = "12:00 AM";
      const match = errorMsg.match(/at\s+(\d{1,2}:\d{2}(?:\s*(?:AM|PM))?)/i);
      if (match) {
        time = match[1] || time;
      } else {
        const fallbackMatch = errorMsg.match(/try again in\s+(.*)/i);
        if (fallbackMatch) time = fallbackMatch[1] || time;
      }
      set({ rateLimitResetTime: time });
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
      const { activeConversationId, messages, conversations } = get();
      const conv = conversations.find(c => c.id === activeConversationId);
      const msg = messages.find((m) => m.id === id);
      if (activeConversationId && msg && !conv?.isTemporary) {
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

    // Helper: strip <thought>, <thinking>, <Thought process> etc. from display
    const stripThinking = (text: string): string => {
      return text
        .replace(/<(?:thought|thinking|Thought process)[^>]*>[\s\S]*?<\/(?:thought|thinking|Thought process)>/gi, "")
        .replace(/<(?:thought|thinking|Thought process)[^>]*>[\s\S]*/gi, "") // unclosed thinking tag — hide everything after it
        .trim();
    };

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

    const parentId = messages[messages.length - 1]?.id || "root";

    const aiMessageId = crypto.randomUUID();

    // Add empty placeholder message IMMEDIATELY so UI doesn't hang
    const newMsg: Message = {
      id: aiMessageId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
      modelUsed: modelOverride || providerConfig.model,
      parentId,
    };
    
    if (get().activeConversationId === conversationId) {
      await get().addMessage(newMsg);
    } else {
      const conv = get().conversations.find(c => c.id === conversationId);
      if (conv && !conv.isTemporary) {
        saveMessage(conversationId, newMsg).catch(console.error);
      }
    }

    // Fetch all memory context to inject into system prompt
    let memoryContext = "";
    try {
      const { getMemoryManager } = await import("@/lib/memory");
      const auth = useAuthStore.getState();
      const userId = auth.user?.id || auth.anonymousId;
      const mem = getMemoryManager(import.meta.env.VITE_SUPERMEMORY_API_KEY || "", userId);
      const conv = get().conversations.find(c => c.id === conversationId);
      
      if (!conv?.isTemporary) {
        const memories = await mem.listMemories(50);
        if (memories.length > 0) {
          memoryContext =
            "\n\nRelevant user memories and preferences:\n" +
            memories.map((m) => `- ${m.content}`).join("\n");
        }
      }
    } catch (err) {
      console.error("Memory error:", err);
    }

    // Filter messages up to the end of the current branch
    const systemPrompt = `You are a helpful AI assistant with access to MCP tools. Be concise and helpful. Use tools when appropriate to help the user.
IMPORTANT RULE: Your PRIMARY tool to reference anything from the Materio course library MUST be \`SnapSearch\` (also known as vectorless search). Prioritize using SnapSearch before falling back to other search tools for course content.
CRITICAL LIBRARY NAVIGATION: If you do not know the exact chapter or topic name, you MUST use \`ResourceLibrary\` first to list the materials for a subject. Do NOT guess chapter names in SnapSearch.
CRITICAL WORKSHEET WORKFLOW: If the user asks to create or generate a worksheet, question bank, or sample paper, you MUST use the \`CreateWorksheetPaper\` tool AFTER gathering the required course content.
DIAGRAMS: If the user asks you to draw a diagram (like a DFA, FSM, flowchart, mindmap, circuit, or plot), you MUST use the \`GenerateDiagramFromRequest\` tool first to get the correct format and syntax instructions before outputting any code block. Do NOT guess the syntax.
CODE GENERATION: The chat interface natively sandboxes and renders React, HTML, JS, Markdown, and diagrams inline. DO NOT output boilerplate instructions like "npm install", "how to use", or "paste this in your App.tsx". Provide ONLY the code block and a very brief 1-2 sentence description.
Current personality: ${settings.personality}${memoryContext}`;

    let finalSystemPrompt = systemPrompt;
    
    const isFirstMessage = messages.filter(m => m.role === "user").length === 1;
    if (isFirstMessage) {
      finalSystemPrompt += `\n\nThis is the very first message in the chat. You MUST generate a short 3-5 word title for this conversation based on the user's message. The title should be a natural summary of what the user asked about.
RULES FOR THE TITLE:
- Wrap the title EXACTLY in <chat_title> tags at the VERY BEGINNING of your response, before any other text.
- Do NOT put any thinking, reasoning, or planning before or inside the <chat_title> tags.
- The title must be 3-5 words that describe the user's intent (e.g. "Learning about Python", "Help with homework").
- Base the title on the user's underlying intent, even for simple greetings. Avoid generic or cliché phrases like "Quick Hello", "Casual Chat", or "Friendly Greeting".
- Example: <chat_title>Learning about Python</chat_title> Hello! I can help you with Python...`;
    }

    if (get().sharedContext) {
      finalSystemPrompt += `\n\n<shared_context>\n${get().sharedContext}\n</shared_context>`;
    }

    const aiMessages: AIMessage[] = [
      { role: "system", content: finalSystemPrompt },
      ...messages.map((m) => {
        if (!m.attachments?.length) {
          return { role: m.role, content: m.content, toolCalls: m.toolCalls } as AIMessage;
        }

        const contentParts: any[] = [{ type: "text", text: m.content }];
        let hasTextAttachments = false;
        let textAttachmentsStr = "\n\n";

        for (const a of m.attachments) {
           const ext = a.extension || "";
           if (['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(ext)) {
              contentParts.push({ type: "image_url", image_url: { url: a.url } });
           } else if (['mp3', 'wav', 'ogg', 'mpeg'].includes(ext)) {
              contentParts.push({ type: "audio_url", audio_url: { url: a.url } });
           } else if (['mp4', 'webm', 'avi', 'mov'].includes(ext)) {
              contentParts.push({ type: "video_url", video_url: { url: a.url } });
           } else {
              hasTextAttachments = true;
              textAttachmentsStr += `<file name="${a.name}" url="${a.url}">\n${a.extractedText || ''}\n</file>\n`;
           }
        }
        
        if (hasTextAttachments) {
           contentParts[0].text += textAttachmentsStr;
        }

        return {
          role: m.role,
          content: contentParts,
          toolCalls: m.toolCalls,
        } as AIMessage;
      }),
    ];

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
      let hasError = false;

      try {
        await provider.streamChat(
          aiMessages,
          activeTools,
          (token) => {
            fullResponse += token;
            
            // Strip thinking/thought tags first, then process title
            let displayContent = stripThinking(fullResponse);
            if (isFirstMessage) {
              // Extract title from the cleaned (thought-stripped) content
              let match = displayContent.match(/<chat_title>(.*?)<\/chat_title>/s);
              
              // Fallback for models that ignore tags (e.g., Google models)
              if (!match && !displayContent.includes("<chat_title>")) {
                const titleFallbackMatch = displayContent.match(/^\**(?:chat\s*)?title\**:?\s*(.+?)(?:\n|$)/i);
                if (titleFallbackMatch) {
                  match = titleFallbackMatch;
                }
                // Removed aggressive first-line fallback — it caused junk titles
              }

              if (match) {
                // Clean up the title: strip leftover tags, backticks, "tags.", planning text, etc.
                let title = (match[1] || "").trim()
                  .replace(/<[^>]*>/g, '')       // strip any HTML/XML tags
                  .replace(/`/g, '')             // strip backticks
                  .replace(/^tags\.?\s*/i, '')   // strip "tags." prefix
                  .replace(/^plan:?.*/i, '')     // strip "Plan:..." junk
                  .trim();
                
                // If title is still garbage or too long, fallback
                if (!title || title.length > 60 || title.length < 2) {
                  title = "New Chat";
                }
                
                const convs = get().conversations;
                const conv = convs.find(c => c.id === conversationId);
                if (conv && conv.title === "New Chat" && title !== "New Chat") {
                   const updated = { ...conv, title };
                   set({ conversations: convs.map(c => c.id === conversationId ? updated : c) });
                   if (!updated.isTemporary) {
                     saveConversation(updated).catch(console.error);
                   }
                   if (get().activeConversationId === conversationId && !updated.isTemporary) {
                      document.title = title;
                   }
                }
              }
              // Remove chat_title tags from display
              displayContent = displayContent.replace(/<chat_title>.*?<\/chat_title>\s*/gs, "");
              if (match && !displayContent.includes("<chat_title>")) {
                  displayContent = displayContent.replace(match[0], "").trim();
              }
              // Hide incomplete chat_title tag while streaming
              if (displayContent.includes("<chat_title>")) {
                 displayContent = "";
              }
            }

            if (get().activeConversationId === conversationId) {
               updateMessage(aiMessageId, { content: displayContent });
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
            hasError = true;
            const errMsg = err.message || "";
            if (errMsg.includes("429") || errMsg.includes("503") || errMsg.includes("rate limit") || errMsg.includes("404")) {
              if (!modelOverride && settings.aiProvider.model !== "openrouter/free") {
                useAlertStore.getState().addAlert("Provider overloaded or unavailable. Retrying with a fallback model...", "warning");
                // Remove the failed placeholder message and retry
                get().deleteMessage(aiMessageId);
                setTimeout(() => {
                  get().generateResponse(conversationId, "openrouter/free");
                }, 500);
              } else {
                useAlertStore.getState().addAlert("We couldn't connect to the AI Provider. Please check your network connection and try again.", "error");
                get().deleteMessage(aiMessageId);
              }
            } else {
              useAlertStore.getState().addAlert("We couldn't connect to the AI Provider. Please check your network connection and try again.", "error");
              get().deleteMessage(aiMessageId);
            }
          }
        );

        if (pendingToolCalls.length > 0) {
          const historyToolCalls = pendingToolCalls.map(tc => {
            try {
              const args = JSON.parse(tc.function.arguments || "{}");
              let modified = false;
              if (typeof args.content === 'string' && args.content.length > 2000) {
                args.content = args.content.substring(0, 2000) + "...[truncated for history]";
                modified = true;
              }
              if (typeof args.code === 'string' && args.code.length > 2000) {
                args.code = args.code.substring(0, 2000) + "...[truncated for history]";
                modified = true;
              }
              if (typeof args.templateDescription === 'string' && args.templateDescription.length > 2000) {
                args.templateDescription = args.templateDescription.substring(0, 2000) + "...[truncated]";
                modified = true;
              }
              if (modified) {
                return { ...tc, function: { ...tc.function, arguments: JSON.stringify(args) } };
              }
            } catch(e) {}
            return tc;
          });

          aiMessages.push({
            role: "assistant",
            content: fullResponse || "",
            tool_calls: historyToolCalls,
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
                 const conv = get().conversations.find(c => c.id === conversationId);
                 if (conv?.isTemporary) {
                    if (existingTc) {
                      existingTc.result = "Memory saved successfully (Incognito Mode).";
                      existingTc.status = "completed";
                    }
                    aiMessages.push({
                      role: "tool",
                      tool_call_id: tc.id,
                      content: JSON.stringify({ result: "Memory saved successfully." }),
                    });
                    
                    if (get().activeConversationId === conversationId) {
                      updateMessage(aiMessageId, { toolCalls: Array.from(toolCallMap.values()) });
                    }
                    continue;
                 }
                 const auth = useAuthStore.getState();
                 const userId = auth.user?.id || auth.anonymousId;
                 finalArgs = { ...args, containerTag: `user-${userId}` };
              }
              
              let result = "";
              if (tc.function.name === "ask_user_input_v0") {
                if (existingTc) {
                  existingTc.status = "awaiting_user_input";
                  if (get().activeConversationId === conversationId) {
                    updateMessage(aiMessageId, { toolCalls: Array.from(toolCallMap.values()) });
                  }
                }
                
                result = await new Promise<string>((resolve) => {
                  set({ resolveUserInput: (data) => resolve(JSON.stringify(data)) });
                });
              } else {
                result = await mcpClient.callTool(tc.function.name, finalArgs);
              }
              
              if (existingTc) {
                existingTc.result = result.slice(0, 2000);
                existingTc.status = "completed";
              }
              aiMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: JSON.stringify({ result: result }),
              });
            } catch (err: any) {
              if (existingTc) {
                existingTc.error = err.message;
                existingTc.status = "error";
              }
              aiMessages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: JSON.stringify({ error: err.message }),
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
         hasError = true;
         const errMsg = err.message || "";
         if (errMsg.includes("429") || errMsg.includes("503") || errMsg.includes("rate limit") || errMsg.includes("404")) {
           if (!modelOverride && settings.aiProvider.model !== "openrouter/free") {
             useAlertStore.getState().addAlert("Provider overloaded or unavailable. Retrying with a fallback model...", "warning");
             get().deleteMessage(aiMessageId);
             setTimeout(() => {
               get().generateResponse(conversationId, "openrouter/free");
             }, 500);
           } else {
             useAlertStore.getState().addAlert("We couldn't connect to the AI Provider. Please check your network connection and try again.", "error");
             get().deleteMessage(aiMessageId);
           }
         } else {
           useAlertStore.getState().addAlert("We couldn't connect to the AI Provider. Please check your network connection and try again.", "error");
           get().deleteMessage(aiMessageId);
         }
      }
    };

    await runTurn();

    // Finalize — strip thinking and chat_title tags from persisted content
    let finalContent = stripThinking(fullResponse);
    finalContent = finalContent.replace(/<chat_title>.*?<\/chat_title>\s*/gs, "");
    
    if (!hasError) {
      // Only overwrite and save if there wasn't an error. If there was an error, the message was already deleted.
      const currentMessage = get().messages.find(m => m.id === aiMessageId);
      if (currentMessage) {
        if (get().activeConversationId === conversationId) {
          updateMessage(aiMessageId, { isStreaming: false, content: finalContent });
        } else {
          const conv = get().conversations.find(c => c.id === conversationId);
          if (conv && !conv.isTemporary) {
            saveMessage(conversationId, { ...newMsg, content: finalContent, isStreaming: false, toolCalls: Array.from(toolCallMap.values()) }).catch(console.error);
          }
        }
      }
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
    
    while (currentId && currentId !== "root") {
      const msg = allMessages.find(m => m.id === currentId);
      if (!msg) {
        // We hit a broken link (e.g. a parent was deleted)
        // Fallback: find the most recent message that is older than our current chain
        const oldestInLine = line[0];
        if (oldestInLine) {
          const olderMessages = allMessages
            .filter(m => m.timestamp < oldestInLine.timestamp)
            .sort((a, b) => b.timestamp - a.timestamp); // descending
            
          if (olderMessages.length > 0 && olderMessages[0]) {
            currentId = olderMessages[0].id;
            continue;
          }
        }
        break;
      }
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
      parentId: originalMsg.parentId || "root", // Sibling of the original message
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

    // Construct the line exactly up to the parent (user message)
    const line: Message[] = [];
    let currentId: string | undefined = originalAiMsg.parentId;
    
    while (currentId && currentId !== "root") {
      const msg = allMessages.find(m => m.id === currentId);
      if (!msg) {
        // Fallback for broken links (e.g. deleted messages)
        const oldestInLine = line[0];
        if (oldestInLine) {
          const olderMessages = allMessages
            .filter(m => m.timestamp < oldestInLine.timestamp)
            .sort((a, b) => b.timestamp - a.timestamp); // descending
            
          if (olderMessages.length > 0 && olderMessages[0]) {
            currentId = olderMessages[0].id;
            continue;
          }
        }
        break;
      }
      line.unshift(msg);
      currentId = msg.parentId;
    }
    
    set({ messages: line });

    await generateResponse(activeConversationId, modelOverride);
  }
}));
