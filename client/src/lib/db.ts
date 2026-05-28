import type { Conversation, Message } from "@/types";
import { useAuthStore } from "@/stores/auth";

const API_BASE = "/api/db";

function getHeaders() {
  const { token, anonymousId } = useAuthStore.getState();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  } else if (anonymousId) {
    headers["X-Anonymous-Id"] = anonymousId;
  }
  
  return headers;
}

export async function getConversations(): Promise<Conversation[]> {
  try {
    const res = await fetch(`${API_BASE}/conversations`, { headers: getHeaders() });
    if (!res.ok) throw new Error("Failed to fetch conversations");
    return await res.json();
  } catch (err) {
    console.error(err);
    return [];
  }
}

export async function getMessages(conversationId: string): Promise<Message[]> {
  try {
    const res = await fetch(`${API_BASE}/conversations/${conversationId}/messages`, { headers: getHeaders() });
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
  const res = await fetch(`${API_BASE}/messages`, {
    method: "POST",
    headers: getHeaders(),
    body: JSON.stringify({ ...message, conversationId }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || "Failed to save message");
  }
}

export async function saveConversation(conversation: Conversation): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/conversations`, {
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
    const res = await fetch(`${API_BASE}/conversations/${id}`, {
      method: "DELETE",
      headers: getHeaders(),
    });
    if (!res.ok) throw new Error("Failed to delete conversation");
  } catch (err) {
    console.error(err);
  }
}
