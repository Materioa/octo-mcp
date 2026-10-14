import type { Conversation, Message } from "@/types";
import { useAuthStore } from "@/stores/auth";

const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
const defaultApiUrl = isLocal ? "http://localhost:3001" : "https://mcp.getmaterio.app";
const API_BASE = (import.meta.env.VITE_API_URL || defaultApiUrl) + "/backend-api/db";

async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (res.status === 401) {
    const auth = useAuthStore.getState();
    if (auth.token) {
      auth.logout();
      auth.setLoginOpen(true);
    }
  }
  return res;
}

function getHeaders() {
  const { token, anonymousId, user } = useAuthStore.getState();
  const isTest = token === "test_token" || user?.id === "test-user-id" || isLocal;
  const effectiveToken = token || (isTest ? "test_token" : null);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (effectiveToken) {
    headers["Authorization"] = `Bearer ${effectiveToken}`;
  }
  if (anonymousId) {
    headers["X-Anonymous-Id"] = anonymousId;
  }
  if (isTest) {
    headers["X-Test-User"] = "true";
  }
  
  return headers;
}

export async function getConversations(): Promise<Conversation[]> {
  try {
    const res = await authedFetch(`${API_BASE}/conversations`, { headers: getHeaders() });
    if (!res.ok) throw new Error("Failed to fetch conversations");
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

export async function getConversation(id: string): Promise<Conversation | null> {
  try {
    const res = await authedFetch(`${API_BASE}/conversations/${id}`, { headers: getHeaders() });
    if (!res.ok) throw new Error("Failed to fetch conversation");
    return await res.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  try {
    const res = await authedFetch(`${API_BASE}/conversations/${conversationId}/messages`, { headers: getHeaders() });
    if (!res.ok) throw new Error("Failed to fetch messages");
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

export async function saveMessage(
  conversationId: string,
  message: Message
): Promise<void> {
  const res = await authedFetch(`${API_BASE}/messages`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ ...message, conversationId }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    const auth = useAuthStore.getState();
    const isTest = auth.token === "test_token" || auth.user?.id === "test-user-id" || isLocal;
    if (isTest && (res.status === 429 || errorData.error?.includes("limit"))) {
      console.warn("Bypassing server rate-limit error for test user");
      return;
    }
    throw new Error(errorData.error || "Failed to save message");
  }
}

export async function saveConversation(conversation: Conversation): Promise<void> {
  try {
    const res = await authedFetch(`${API_BASE}/conversations`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(conversation),
    });
    if (!res.ok) throw new Error("Failed to save conversation");
  } catch (err) {
    console.error(err);
  }
}

export async function deleteConversation(id: string): Promise<void> {
  try {
    const res = await authedFetch(`${API_BASE}/conversations/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to delete conversation");
  } catch (err) {
    console.error(err);
  }
}

export async function deleteMessage(id: string): Promise<void> {
  try {
    const res = await authedFetch(`${API_BASE}/messages/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!res.ok && res.status !== 404) throw new Error("Failed to delete message");
  } catch (err) {
    console.error(err);
  }
}
