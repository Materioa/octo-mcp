import { useEffect, useState, useRef } from "react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Loader } from "lucide-react";
import { OAuthCallback } from "@/components/OAuthCallback";
import { AuthCallback } from "@/components/auth/AuthCallback";

import { useChatStore } from "@/stores/chat";

const AUTH_URL = import.meta.env.VITE_MATERIO_AUTH_URL || "https://auth.getmaterio.app";
const ACCOUNTS_URL = import.meta.env.VITE_MATERIO_ACCOUNTS_URL || "https://accounts.getmaterio.app";

function isTrustedOrigin(origin: string): boolean {
  if (!origin || origin === "null") return true;
  if (origin === window.location.origin) return true;
  if (/^https?:\/\/([a-z0-9_-]+\.)*getmaterio\.app$/i.test(origin)) return true;
  if (/^https?:\/\/materio\.jinansh\.workers\.dev$/i.test(origin)) return true;
  if (/^tauri:\/\/localhost/i.test(origin) || /^https?:\/\/tauri\.localhost/i.test(origin)) return true;
  if (/^capacitor:\/\/localhost/i.test(origin) || /^https?:\/\/capacitor\.localhost/i.test(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  return false;
}

function IframeListener() {
  const navigate = useNavigate();
  
  useEffect(() => {
    // Proactively request currently open PDF from parent viewer (e.g. Oread / PDF.js)
    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "MATERIO_REQUEST_ACTIVE_PDF" }, "*");
      }
    } catch (e) {}

    const handleMessage = (event: MessageEvent) => {
      if (!isTrustedOrigin(event.origin)) {
        return;
      }

      if (event.data?.type === "MATERIO_NAVIGATE" && event.data.path) {
        navigate(event.data.path);
      }
      if (event.data?.type === "MATERIO_SET_QUERY" && event.data.query) {
        window.dispatchEvent(new CustomEvent("materio-set-query", { 
          detail: { query: event.data.query, autoSubmit: !!event.data.autoSubmit } 
        }));
      }
      if (event.data?.type === "MATERIO_SET_THEME" && event.data.theme) {
        useSettingsStore.getState().setTheme(event.data.theme);
      }
      if (event.data?.type === "MATERIO_HIDE_SIDEBAR_ICON") {
        window.dispatchEvent(new CustomEvent("materio-hide-sidebar-icon", {
          detail: { hide: event.data.hide !== false }
        }));
      }
      if (event.data?.type === "MATERIO_ACTIVE_PDF" && event.data.pdf) {
        useChatStore.getState().setCurrentPdf(event.data.pdf);
      }
      if (event.data?.type === "MATERIO_PAGE_CHANGED" && typeof event.data.pageNumber === "number") {
        useChatStore.getState().updateCurrentPdfPage(event.data.pageNumber);
      }
      if (event.data?.type === "MATERIO_AUTH" && event.data.token) {
        useAuthStore.getState().setAuth(event.data.token, event.data.user);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [navigate]);

  return null;
}

import { GlobalAlert } from "@/components/ui/GlobalAlert";

export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  const { setAuth, setLoginOpen } = useAuthStore();
  const [isExchanging, setIsExchanging] = useState(false);

  const hasExchanged = useRef(false);

  // Capture the handoff code synchronously during the very first render.
  // This prevents React Router's <Navigate> from clearing it from the URL before the useEffect runs!
  const [initialHandoffCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("code") || params.get("handoff");
  });
  
  const [initialTheme] = useState(() => {
    return new URLSearchParams(window.location.search).get("theme");
  });

  useEffect(() => {
    if (initialTheme && (initialTheme === "dark" || initialTheme === "light" || initialTheme === "system")) {
      useSettingsStore.getState().setTheme(initialTheme as any);
    }
  }, [initialTheme]);

  useEffect(() => {
    const isDark = theme === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
      : theme === "dark";
    document.documentElement.classList.toggle("dark", isDark);
    document.documentElement.classList.toggle("light", !isDark);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', isDark ? '#1f1f1e' : '#fdfdfc');
  }, [theme]);

  const token = useAuthStore((s) => s.token);
  useEffect(() => {
    const auth = useAuthStore.getState();
    const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
    if (!auth.token && (import.meta.env.DEV || isLocal)) {
      auth.setAuth("test_token", {
        id: "test-user-id",
        username: "testuser",
        name: "Test User",
        email: "test@example.com",
        hasAdminPrivileges: true,
        isPlusUser: true,
      });
    }
  }, []);

  useEffect(() => {
    if (token) {
      useSettingsStore.getState().syncCustomConnectors(token);
      useSettingsStore.getState().syncSkills(token);
      useSettingsStore.getState().syncApiKeys(token);

      // Skip remote verification for developer test mode
      if (token === "test_token") {
        return;
      }

      // Verify if token is still valid on startup/mount
      fetch(`${ACCOUNTS_URL}/api/v2/profile`, {
        headers: { "Authorization": `Bearer ${token}` }
      })
      .then(res => {
        if (res.status === 401 || res.status === 403) {
          useAuthStore.getState().logout();
          useAuthStore.getState().setLoginOpen(true);
        }
      })
      .catch(err => {
        console.error("Failed to verify token on startup", err);
      });
    }
  }, [token]);

  useEffect(() => {
    if (initialHandoffCode && !hasExchanged.current) {
      hasExchanged.current = true;
      setIsExchanging(true);
      // Clean up URL immediately
      window.history.replaceState({}, document.title, window.location.pathname);
      
      fetch(`${AUTH_URL}/api/v2/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exchange", code: initialHandoffCode })
      })
      .then(async res => {
        const text = await res.text();
        try {
          return { status: res.status, ok: res.ok, data: JSON.parse(text) };
        } catch (e) {
          alert(`Login Failed: Not JSON. Status: ${res.status}. Body: ${text.slice(0, 100)}`);
          throw new Error("Not JSON");
        }
      })
      .then(async ({ status, ok, data }) => {
        if (!ok) {
          alert(`Login Failed: HTTP ${status} - ${data.error || JSON.stringify(data)}`);
          return;
        }

        const token = data.token || data.accessToken || data.jwt;
        if (token) {
          let user = data.user || data.profile || data.data;
          
          if (!user || typeof user !== 'object') {
            try {
              const profileRes = await fetch(`${ACCOUNTS_URL}/api/v2/profile`, {
                headers: { "Authorization": `Bearer ${token}` }
              });
              if (profileRes.ok) {
                const profileData = await profileRes.json();
                user = profileData.user || profileData.profile || profileData.data || profileData;
              }
            } catch (err) {
              console.error("Failed to fetch user profile:", err);
            }
          }
          
          if (user && user.id) {
            setAuth(token, user);
            setLoginOpen(false);
          } else {
            alert(`Login Failed: Missing user ID in profile. Keys: ${Object.keys(user || {}).join(',')}`);
          }
        } else {
          alert(`Login Failed: No token in response. Data: ${JSON.stringify(data).slice(0, 100)}`);
        }
      })
      .catch(err => {
        console.error("Handoff fetch error:", err);
        alert(`Login Failed: Network error. Details: ${err.message}`);
      })
      .finally(() => setIsExchanging(false));
    }
  }, [setAuth]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "MATERIO_AUTH" && event.data.token) {
        setAuth(event.data.token, event.data.user);
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [setAuth]);

  if (isExchanging) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <Loader className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-medium">Authenticating with Materio ID...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <GlobalAlert />
      <IframeListener />
      <Routes>
        <Route path="/" element={<Navigate to="/new" replace />} />
        <Route path="/new" element={<ChatLayout />} />
        <Route path="/c/:id" element={<ChatLayout />} />
        <Route path="/share/:id" element={<ChatLayout />} />
        <Route path="/settings" element={<ChatLayout />} />
        <Route path="/settings/:tab" element={<ChatLayout />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/callback" element={<AuthCallback />} />
        <Route path="/oauth/callback" element={<OAuthCallback />} />
      </Routes>
    </BrowserRouter>
  );
}
