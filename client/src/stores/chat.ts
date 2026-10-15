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
import baseSystemPrompt from "@/lib/system-prompt.md?raw";
import { BUILTIN_SKILLS, detectRelevantBuiltinSkills } from "@/lib/skills";
import { autoDetectAndSaveMemory } from "@/lib/auto-memory";
import type { EraserDocument } from "@/lib/eraser/types";
import { FOUR_LAYER_ARCHITECTURE_EXAMPLE } from "@/lib/eraser/defaults";
import { CLIENT_TOOLS, isClientTool, executeClientTool } from "@/lib/client-tools";

export interface OpenPdfDocument {
  title: string;
  url?: string;
  numPages: number;
  currentPage: number;
  text?: string;
  pages?: { pageNumber: number; text: string; image?: string; isScanned?: boolean }[];
  isScanned?: boolean;
}

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
  generateResponse: (conversationId: string, modelOverride?: string, autoSwitchReason?: string) => Promise<void>;
  switchBranch: (messageId: string) => void;
  branchMessage: (messageId: string, newContent: string) => Promise<void>;
  retryMessage: (messageId: string, modelOverride?: string) => Promise<void>;
  resolveUserInput: ((result: any) => void) | null;
  submitUserInput: (toolCallId: string, result: any) => void;
  activeDocument: { url: string; format: string; title: string } | null;
  setActiveDocument: (doc: { url: string; format: string; title: string } | null) => void;
  currentPdf: OpenPdfDocument | null;
  dismissedPdfUrl: string | null;
  dismissPdfContext: () => void;
  setCurrentPdf: (pdf: OpenPdfDocument | null) => void;
  updateCurrentPdfPage: (pageNumber: number) => void;
  activeEraserDiagram: EraserDocument | null;
  isEraserCanvasOpen: boolean;
  openEraserCanvas: (doc?: EraserDocument) => void;
  closeEraserCanvas: () => void;
  updateEraserDiagram: (doc: EraserDocument) => void;
  sharedContext: string | null;
  setSharedContext: (context: string | null) => void;
  renameConversation: (id: string, newTitle: string) => Promise<void>;
  setPinnedMcpId: (id: string | undefined) => Promise<void>;
  draftPinnedMcpId?: string | undefined;
}

function parseFunctionArgs(rawArgs: string): Record<string, any> {
  const trimmed = rawArgs.trim();
  if (!trimmed) return {};
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    try {
      return JSON.parse(trimmed);
    } catch (e) {}
  }
  
  const args: Record<string, any> = {};
  const regex = /([a-zA-Z0-9_]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([0-9]+(?:\.[0-9]+)?)|(true|false)|([a-zA-Z0-9_-]+))/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(trimmed)) !== null) {
    const key = match[1];
    let val: any;
    if (match[2] !== undefined) val = match[2];
    else if (match[3] !== undefined) val = match[3];
    else if (match[4] !== undefined) val = Number(match[4]);
    else if (match[5] !== undefined) val = match[5].toLowerCase() === "true";
    else if (match[6] !== undefined) val = match[6];
    if (key) {
      args[key] = val;
    }
  }
  return args;
}

function parseInnerToolCall(inner: string): { id: string; name: string; args: Record<string, any> } | null {
  const trimmed = inner.trim();
  if (trimmed.startsWith("{")) {
    try {
      const obj = JSON.parse(trimmed);
      const name = obj.name || obj.tool || obj.function;
      const args = obj.arguments || obj.parameters || obj.args || {};
      if (name) {
        return {
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: String(name),
          args: typeof args === "string" ? JSON.parse(args) : args,
        };
      }
    } catch (e) {}
  }

  const fnMatch = trimmed.match(/^(?:\[)?([a-zA-Z0-9_-]+)\(([\s\S]*?)\)(?:\])?$/);
  if (fnMatch && fnMatch[1] && fnMatch[2] !== undefined) {
    const name = fnMatch[1];
    const argsStr = fnMatch[2];
    return {
      id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      args: parseFunctionArgs(argsStr),
    };
  }

  return null;
}

function extractTextToolCalls(text: string): {
  toolCalls: { id: string; name: string; args: Record<string, any> }[];
  cleanedText: string;
} {
  const toolCalls: { id: string; name: string; args: Record<string, any> }[] = [];
  let cleaned = text;

  // 1. <|tool_call_start|>...<|tool_call_end|>
  const toolCallStartEndRegex = /<\|tool_call_start\|>([\s\S]*?)<\|tool_call_end\|>/g;
  let match: RegExpExecArray | null;
  while ((match = toolCallStartEndRegex.exec(text)) !== null) {
    const fullMatch = match[0];
    const inner = (match[1] || "").trim();
    const parsed = parseInnerToolCall(inner);
    if (parsed) {
      toolCalls.push(parsed);
      cleaned = cleaned.replace(fullMatch, "");
    }
  }

  // 2. <tool_call>...</tool_call>
  const xmlToolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/g;
  while ((match = xmlToolCallRegex.exec(cleaned)) !== null) {
    const fullMatch = match[0];
    const inner = (match[1] || "").trim();
    const parsed = parseInnerToolCall(inner);
    if (parsed) {
      toolCalls.push(parsed);
      cleaned = cleaned.replace(fullMatch, "");
    }
  }

  // 3. ```tool_call...```
  const codeBlockToolCallRegex = /```(?:tool_call|tool)[\r\n]+([\s\S]*?)```/g;
  while ((match = codeBlockToolCallRegex.exec(cleaned)) !== null) {
    const fullMatch = match[0];
    const inner = (match[1] || "").trim();
    const parsed = parseInnerToolCall(inner);
    if (parsed) {
      toolCalls.push(parsed);
      cleaned = cleaned.replace(fullMatch, "");
    }
  }

  // 4. Standalone bracket calls: [read_current_pdf(page=32)]
  const bracketCallRegex = /\[([a-zA-Z0-9_-]+)\(([\s\S]*?)\)\]/g;
  while ((match = bracketCallRegex.exec(cleaned)) !== null) {
    const fullMatch = match[0];
    const funcName = match[1];
    const argsStr = match[2];
    if (funcName && argsStr !== undefined) {
      if (isClientTool(funcName) || mcpClient.getToolServerId(funcName) !== undefined || funcName === "read_current_pdf") {
        toolCalls.push({
          id: `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          name: funcName,
          args: parseFunctionArgs(argsStr),
        });
        cleaned = cleaned.replace(fullMatch, "");
      }
    }
  }

  return { toolCalls, cleanedText: cleaned.trim() };
}

export function cleanDocumentTitle(rawTitle?: string, url?: string): string {
  let name = (rawTitle || "").trim();

  // Strip common generic prefixes from PowerPoint / Word / Office exports
  name = name.replace(/^(?:Microsoft\s+)?PowerPoint\s+Presentation(?:\s*[-–—]\s*)?/i, '');
  name = name.replace(/^(?:Microsoft\s+)?Word\s+Document(?:\s*[-–—]\s*)?/i, '');
  name = name.replace(/^Microsoft\s+(?:Word|PowerPoint)\s*[-–—]\s*/i, '');
  name = name.replace(/\.pdf$/i, '');
  name = name.replace(/\.[a-z0-9]{2,4}$/i, '');
  name = name.trim();

  const isGeneric = !name || /^(?:pdf\.?js(\s+viewer)?|viewer|document|presentation\d*|untitled|powerpoint\s+presentation)$/i.test(name);

  if (isGeneric && url) {
    try {
      const u = new URL(url, "https://chat.getmaterio.app");
      const fileParam = u.searchParams.get("file");
      if (fileParam) {
        const fromParam = cleanDocumentTitle(fileParam);
        if (fromParam && fromParam !== "Document") return fromParam;
      }
      const last = u.pathname.split("/").filter(Boolean).pop();
      if (last && !/^(viewer\.html|index\.html)$/i.test(last)) {
        let fromUrl = decodeURIComponent(last);
        fromUrl = fromUrl.replace(/^(?:Microsoft\s+)?PowerPoint\s+Presentation(?:\s*[-–—]\s*)?/i, '');
        fromUrl = fromUrl.replace(/^(?:Microsoft\s+)?Word\s+Document(?:\s*[-–—]\s*)?/i, '');
        fromUrl = fromUrl.replace(/\.pdf$/i, '').replace(/\.[a-z0-9]{2,4}$/i, '').trim();
        if (fromUrl && !/^(?:pdf\.?js(\s+viewer)?|viewer|document)$/i.test(fromUrl)) {
          return fromUrl;
        }
      }
    } catch (e) {
      const parts = String(url).split(/[/\\]/).filter(Boolean);
      const last = parts.pop() || '';
      if (last && !/^(viewer\.html|index\.html)$/i.test(last)) {
        let fromUrl = decodeURIComponent(last).replace(/\.pdf$/i, '').trim();
        if (fromUrl) return fromUrl;
      }
    }
  }

  return name || "Document";
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
  draftPinnedMcpId: undefined,
  
  submitUserInput: (toolCallId, result) => {
    const { resolveUserInput } = get();
    if (resolveUserInput) {
      resolveUserInput(result);
      set({ resolveUserInput: null });
    }
  },
  
  activeDocument: null,
  setActiveDocument: (doc) => set({ activeDocument: doc }),

  currentPdf: null,
  dismissedPdfUrl: null,
  dismissPdfContext: () => {
    const { currentPdf } = get();
    const url = currentPdf?.url || currentPdf?.title || "dismissed";
    set({ currentPdf: null, dismissedPdfUrl: url });
  },
  setCurrentPdf: (pdf) => {
    if (!pdf) {
      set({ currentPdf: null });
      return;
    }
    const { dismissedPdfUrl } = get();
    if (dismissedPdfUrl && (pdf.url === dismissedPdfUrl || pdf.title === dismissedPdfUrl)) {
      return;
    }
    set({ dismissedPdfUrl: null });
    const title = cleanDocumentTitle(pdf.title, pdf.url);
    set({ currentPdf: { ...pdf, title } });
  },
  updateCurrentPdfPage: (pageNumber) =>
    set((state) => ({
      currentPdf: state.currentPdf ? { ...state.currentPdf, currentPage: pageNumber } : null,
    })),
  activeEraserDiagram: null,
  isEraserCanvasOpen: false,
  openEraserCanvas: (doc) =>
    set({
      activeEraserDiagram: doc || { title: "New Diagram", entities: [], connections: [] },
      isEraserCanvasOpen: true,
    }),
  closeEraserCanvas: () => set({ isEraserCanvasOpen: false }),
  updateEraserDiagram: (doc) => set({ activeEraserDiagram: doc }),
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
    const { draftPinnedMcpId } = get();

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
      pinnedMcpId: draftPinnedMcpId,
    };
    
    // Optimistic UI update
    set((s) => ({
      conversations: [conversation, ...s.conversations],
      activeConversationId: id,
      messages: [],
      draftPinnedMcpId: undefined,
    }));

    // Background DB save (do not await to keep UI instant)
    if (!isTemporary) {
      saveConversation(conversation).catch(console.error);
    }
    
    return id;
  },

  setActiveConversation: async (id) => {
    set({ activeConversationId: id, isLoading: true, draftPinnedMcpId: undefined });
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

  setPinnedMcpId: async (id: string | undefined) => {
    const { activeConversationId, conversations } = get();
    if (!activeConversationId) {
      set({ draftPinnedMcpId: id });
      return;
    }
    const conv = conversations.find(c => c.id === activeConversationId);
    if (!conv) return;

    const updatedConv = { ...conv, pinnedMcpId: id };
    set(s => ({
      conversations: s.conversations.map(c => c.id === activeConversationId ? updatedConv : c)
    }));

    if (!updatedConv.isTemporary) {
      await saveConversation(updatedConv).catch(console.error);
    }
  },

  clearActiveConversation: () => {
    set({ activeConversationId: null, messages: [], allMessages: [], draftPinnedMcpId: undefined });
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

    // 2.5 Auto-detect memorable content in user messages and silently save
    if (message.role === "user" && conv && !conv.isTemporary) {
      try {
        const auth = useAuthStore.getState();
        const uid = auth.user?.id || auth.anonymousId;
        autoDetectAndSaveMemory(message.content, uid, false);
      } catch {}
    }

    // 3. Save to DB and rollback if fails (e.g. rate limit)
    try {
      if (updatedConv && !updatedConv.isTemporary) {
        if (updatedTitle) document.title = updatedTitle;
        saveConversation(updatedConv).catch(console.error);
        await saveMessage(activeConversationId, message);
      }
    } catch (err) {
      const auth = useAuthStore.getState();
      const isTestUser = auth.token === "test_token" || auth.user?.id === "test-user-id";
      if (isTestUser) {
        console.warn("Ignoring DB save / rate limit error for test user:", err);
        return;
      }
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

  generateResponse: async (conversationId, modelOverride, autoSwitchReason) => {
    const { messages, generatingConversationIds, isSending, updateMessage } = get();
    if (isSending || generatingConversationIds.includes(conversationId)) return;

    // Helper: strip <thought>, <thinking>, <Thought process>, pseudo-tool tokens etc. from display
    const stripThinking = (text: string): string => {
      return text
        .replace(/<(?:thought|thinking|Thought process)[^>]*>[\s\S]*?<\/(?:thought|thinking|Thought process)>/gi, "")
        .replace(/<(?:thought|thinking|Thought process)[^>]*>[\s\S]*/gi, "") // unclosed thinking tag — hide everything after it
        .replace(/<\|tool_call_start\|>[\s\S]*?<\|tool_call_end\|>/gi, "")
        .replace(/<\|tool_call_start\|>[\s\S]*/gi, "")
        .replace(/<tool_call>[\s\S]*?<\/tool_call>/gi, "")
        .replace(/<tool_call>[\s\S]*/gi, "")
        .replace(/```(?:tool_call|tool)[\s\S]*?```/gi, "")
        .replace(/\[(?:read_current_pdf|ask_user_input_v0|save_to_memory)\([^\)]*\)\]/gi, "")
        .trim();
    };

    // Use current settings
    const settings = useSettingsStore.getState();
    let providerConfig = settings.aiProvider;
    let finalModelOverride = modelOverride;

    const userMsg = messages.filter(m => m.role === "user").pop();
    
    const hasImage = messages.some(m => 
      m.attachments?.some(a => ['png', 'jpg', 'jpeg', 'webp', 'gif'].includes(a.extension?.toLowerCase() || ''))
    );

    let finalAutoSwitchReason = autoSwitchReason;

    // No matter what provider, if there is an image or model override is openrouter/free, force openrouter-free "best" model
    if (hasImage || finalModelOverride === "openrouter/free") {
      if (hasImage && finalModelOverride !== "openrouter/free") {
        finalAutoSwitchReason = "Auto-routed to best model for image support.";
      }
      finalModelOverride = "openrouter/free";
      providerConfig = {
        providerId: "openrouter-free",
        baseUrl: "https://openrouter.ai/api/v1",
        apiKey: "",
        model: "openrouter/free"
      };
    } else if (providerConfig.providerId === "openrouter-free" && userMsg && !modelOverride) {
      const intentRegex = /\b(create|generate|visualize|code|build|make|draw|write a script|web artifact|dashboard|component|app|website|react|html|css|js|diagram)\b/i;
      if (intentRegex.test(userMsg.content)) {
         finalModelOverride = "qwen/qwen3-coder:free";
      }
    }

    const provider = new OpenAICompatProvider(
      providerConfig.baseUrl,
      providerConfig.apiKey,
      finalModelOverride || providerConfig.model
    );
    
    set({ 
      isSending: true, 
      generatingConversationIds: [...generatingConversationIds, conversationId] 
    });
    get().setAbortController({ abort: () => (provider as any).abort() } as any);

    const parentId = messages[messages.length - 1]?.id || "root";

    const aiMessageId = crypto.randomUUID();

    // Add empty placeholder message IMMEDIATELY so UI doesn't hang
    const newMsg: Message = {
      id: aiMessageId,
      role: "assistant",
      content: "",
      timestamp: Date.now(),
      isStreaming: true,
      modelUsed: finalModelOverride || providerConfig.model,
      autoSwitchReason: finalAutoSwitchReason,
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
            "\n\n## Stored User Memories\nThese facts were previously saved about this user. Use them to personalize your responses. Do NOT re-save facts that already exist here.\n" +
            memories.map((m) => `- ${m.content}`).join("\n");
        }
      }
    } catch (err) {
      console.error("Memory error:", err);
    }

    // ── Build system prompt from .md file + dynamic context ─────────────────
    //
    // The base prompt lives in src/lib/system-prompt.md — edit that file to
    // change the AI's core behaviour. Dynamic sections (skills, memory,
    // personality) are appended below.

    // Collect active user skills (trigger: 'auto' | 'both') that match the query
    const userSkills = settings.skills ?? [];
    const autoSkills = userSkills.filter(s =>
      !s.trigger || s.trigger === "auto" || s.trigger === "both"
    );
    const builtinMatches = userMsg
      ? detectRelevantBuiltinSkills(userMsg.content)
      : [];

    // Build skill injection block
    const skillBlocks: string[] = [];
    for (const s of builtinMatches) {
      skillBlocks.push(`<skill name="${s.name}">\n${s.content}\n</skill>`);
    }
    for (const s of autoSkills) {
      if (userMsg && s.description) {
        const haystack = `${s.name} ${s.description}`.toLowerCase();
        const words = userMsg.content.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(w => w.length > 3);
        if (!words.some(w => haystack.includes(w))) continue;
      }
      skillBlocks.push(`<skill name="${s.name}">\n${s.content}\n</skill>`);
    }

    const skillContext = skillBlocks.length > 0
      ? `\n\n## Active Skills\n${skillBlocks.join("\n\n")}`
      : "";

    const systemPrompt = `${baseSystemPrompt}\nCurrent personality: ${settings.personality}${skillContext}${memoryContext}`;

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

    const currentPdf = get().currentPdf;
    if (currentPdf) {
      let pdfContext = `\n\n<current_open_pdf>\n`;
      pdfContext += `Document Title: "${currentPdf.title}"\n`;
      pdfContext += `Total Pages: ${currentPdf.numPages}\n`;
      pdfContext += `User's Currently Viewing Page: ${currentPdf.currentPage}\n`;
      if (currentPdf.url) {
        pdfContext += `Document URL: ${currentPdf.url}\n`;
      }
      if (currentPdf.text) {
        const textContent = currentPdf.text.length > 50000
          ? currentPdf.text.slice(0, 50000) + "\n\n[... Additional pages accessible via the read_current_pdf tool ...]"
          : currentPdf.text;
        pdfContext += `\n--- Document Text Content ---\n${textContent}\n`;
      }
      if (currentPdf.isScanned) {
        pdfContext += `\n[NOTE: This document is a scanned or image-based PDF without embedded digital text. You must use the "read_current_pdf" tool with action="read_page" to view page visual snapshots. You have vision capabilities to read scanned pages.]\n`;
      }
      pdfContext += `</current_open_pdf>\n\n`;
      pdfContext += `DOCUMENT GROUNDING INSTRUCTIONS:
The user has this PDF document currently open in the Oread viewer right beside you.
- Answer questions directly using the text of this open document.
- When referencing information from the document, cite the page number(s) (e.g. "On page 4...").
- You have the "read_current_pdf" tool available if you need to read specific pages, search for terms across the PDF, or look up the user's current page.
- Do NOT say you cannot read the document or that you need an MCP connector. You have direct access to the user's open PDF in the Oread viewer.`;

      finalSystemPrompt += pdfContext;
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
    let hasError = false;
    
    let activeTools: any[] = [];
    if (mcpClient.isConnected()) {
      try {
        activeTools = await mcpClient.listTools();
        const conv = get().conversations.find(c => c.id === conversationId);
        if (conv?.pinnedMcpId) {
          activeTools = activeTools.filter(t => t.serverId === conv.pinnedMcpId);
        }
      } catch (err) {}
    }

    // Inject client-side tools: ask_user_input_v0, save_to_memory, execute_js, exa_web_search, skill_builder, generate_eraser_diagram
    activeTools = [
      ...activeTools,
      ...CLIENT_TOOLS,
    ];

    const runTurn = async (): Promise<void> => {
      const pendingToolCalls: AIToolCall[] = [];

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
            hasError = true;
            const errMsg = err.message || "";
            if (errMsg.includes("429") || errMsg.includes("503") || errMsg.includes("rate limit") || errMsg.includes("404")) {
              if (!modelOverride && settings.aiProvider.model !== "openrouter/free") {
                // Remove the failed placeholder message and retry silently
                get().deleteMessage(aiMessageId);
                setTimeout(() => {
                  get().generateResponse(conversationId, "openrouter/free", "Provider was capped or unavailable. Auto-switched to best alternative.");
                }, 500);
              } else {
                useAlertStore.getState().addAlert("We couldn't connect to the AI Provider. Please check your network connection and try again.", "error");
                get().deleteMessage(aiMessageId);
              }
            } else if (errMsg.includes("400") || errMsg.includes("Bad Request")) {
              useAlertStore.getState().addAlert("The model rejected the request. This often happens if you uploaded an image to a model that doesn't support vision. Try switching to a vision model (like GPT-4o or Claude 3.5).", "error");
              get().deleteMessage(aiMessageId);
            } else {
              useAlertStore.getState().addAlert("We couldn't connect to the AI Provider. Please check your network connection and try again.", "error");
              get().deleteMessage(aiMessageId);
            }
          }
        );

        // Check if model emitted textual tool calls (e.g. <|tool_call_start|>, <tool_call>, or [read_current_pdf(...)])
        if (pendingToolCalls.length === 0 && fullResponse) {
          const extracted = extractTextToolCalls(fullResponse);
          if (extracted.toolCalls.length > 0) {
            fullResponse = extracted.cleanedText;
            for (const etc of extracted.toolCalls) {
              const tcObj: AIToolCall = {
                id: etc.id,
                type: "function",
                function: {
                  name: etc.name,
                  arguments: JSON.stringify(etc.args),
                },
              };
              pendingToolCalls.push(tcObj);
              toolCallMap.set(etc.id, {
                id: etc.id,
                name: etc.name,
                args: etc.args,
                status: "pending",
              });
            }
            if (get().activeConversationId === conversationId) {
              updateMessage(aiMessageId, {
                content: stripThinking(fullResponse),
                toolCalls: Array.from(toolCallMap.values()),
              });
            }
          }
        }

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
              if (isClientTool(tc.function.name)) {
                if (tc.function.name === "ask_user_input_v0" && existingTc) {
                  existingTc.status = "awaiting_user_input";
                  if (get().activeConversationId === conversationId) {
                    updateMessage(aiMessageId, { toolCalls: Array.from(toolCallMap.values()) });
                  }
                }
                const conv = get().conversations.find((c) => c.id === conversationId);
                result = await executeClientTool(tc.function.name, finalArgs, {
                  isTemporary: conv?.isTemporary,
                  onUpdateEraserDiagram: (docData) => get().updateEraserDiagram(docData),
                  onResolveUserInput: (resolveFn) =>
                    new Promise<string>((resolve) => {
                      set({ resolveUserInput: (data: any) => resolve(resolveFn(data)) });
                    }),
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

              if (tc.function.name === "read_current_pdf") {
                try {
                  const parsed = JSON.parse(result);
                  if (parsed.image && typeof parsed.image === "string" && parsed.image.startsWith("data:image/")) {
                    aiMessages.push({
                      role: "user",
                      content: [
                        { type: "text", text: `[Visual snapshot of page ${parsed.pageNumber || 1} of "${currentPdf?.title || "document"}" for visual reading / OCR]:` },
                        { type: "image_url", image_url: { url: parsed.image } }
                      ]
                    } as any);
                  }
                } catch (e) {}
              }
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
         hasError = true;
         const errMsg = err.message || "";
         if (errMsg.includes("429") || errMsg.includes("503") || errMsg.includes("rate limit") || errMsg.includes("404")) {
           if (!modelOverride && settings.aiProvider.model !== "openrouter/free") {
             get().deleteMessage(aiMessageId);
             setTimeout(() => {
               get().generateResponse(conversationId, "openrouter/free", "Provider was capped or unavailable. Auto-switched to best alternative.");
             }, 500);
           } else {
             useAlertStore.getState().addAlert("We couldn't connect to the AI Provider. Please check your network connection and try again.", "error");
             get().deleteMessage(aiMessageId);
           }
         } else if (errMsg.includes("400") || errMsg.includes("Bad Request")) {
           useAlertStore.getState().addAlert("The model rejected the request. This often happens if you uploaded an image to a model that doesn't support vision. Try switching to a vision model (like GPT-4o or Claude 3.5).", "error");
           get().deleteMessage(aiMessageId);
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
      if (!finalContent.trim() && toolCallMap.size === 0) {
        useAlertStore.getState().addAlert("The AI model returned an empty response. It might be overloaded or unable to process the prompt.", "error");
        get().deleteMessage(aiMessageId);
      } else {
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
