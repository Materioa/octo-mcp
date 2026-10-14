const AUTH_URL = import.meta.env.VITE_MATERIO_AUTH_URL || "https://auth.getmaterio.app";
const ACCOUNTS_URL = import.meta.env.VITE_MATERIO_ACCOUNTS_URL || "https://accounts.getmaterio.app";

/**
 * Exchanges a handoff code for a JWT token and user profile.
 * Prefers the same-origin reverse proxy `/api/v2/login` to prevent browser CORS preflight errors,
 * with automatic fallback to `${AUTH_URL}/api/v2/login`.
 */
export async function exchangeHandoffCode(code: string): Promise<{ token: string; user: any }> {
  const payload = JSON.stringify({ action: "exchange", code });
  const headers = { "Content-Type": "application/json" };

  let response: Response;
  try {
    // 1. Try same-origin proxy first (no CORS preflight)
    response = await fetch("/api/v2/login", {
      method: "POST",
      headers,
      body: payload
    });
    // If not found (404), fall back to direct external URL
    if (response.status === 404) {
      response = await fetch(`${AUTH_URL}/api/v2/login`, {
        method: "POST",
        headers,
        body: payload
      });
    }
  } catch {
    // If relative fetch had network issue, try direct URL
    response = await fetch(`${AUTH_URL}/api/v2/login`, {
      method: "POST",
      headers,
      body: payload
    });
  }

  const text = await response.text();
  let data: any = {};
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error(`Authentication server returned invalid response (Status ${response.status})`);
  }

  if (!response.ok || (!data.token && !data.accessToken)) {
    throw new Error(data.error || `Authentication failed (Status ${response.status})`);
  }

  const token = data.token || data.accessToken || data.jwt;
  let user = data.user || data.profile || data.data;

  // Supplementary profile fetch if user ID is missing
  if (!user || !user.id) {
    try {
      user = await fetchUserProfile(token);
    } catch (e) {
      console.warn("Failed to fetch supplementary profile:", e);
    }
  }

  if (!token || !user?.id) {
    throw new Error("Missing user profile information");
  }

  return { token, user };
}

/**
 * Fetches user profile from accounts.getmaterio.app.
 */
export async function fetchUserProfile(token: string): Promise<any> {
  const headers = { Authorization: `Bearer ${token}` };
  let response: Response;

  try {
    response = await fetch("/api/v2/profile", { headers });
    if (response.status === 404) {
      response = await fetch(`${ACCOUNTS_URL}/api/v2/profile`, { headers });
    }
  } catch {
    response = await fetch(`${ACCOUNTS_URL}/api/v2/profile`, { headers });
  }

  if (!response.ok) {
    throw new Error(`Failed to load profile (Status ${response.status})`);
  }

  const data = await response.json();
  return data.user || data.profile || data.data || data;
}
