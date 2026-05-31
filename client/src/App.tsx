import { useEffect, useState, useRef } from "react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from "react-router-dom";
import { Loader } from "lucide-react";

function IframeListener() {
  const navigate = useNavigate();
  
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === "MATERIO_NAVIGATE" && event.data.path) {
        navigate(event.data.path);
      }
      if (event.data?.type === "MATERIO_SET_QUERY" && event.data.query) {
        window.dispatchEvent(new CustomEvent("materio-set-query", { detail: event.data.query }));
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [navigate]);

  return null;
}

export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  const { setAuth, setLoginOpen } = useAuthStore();
  const [isExchanging, setIsExchanging] = useState(false);

  const hasExchanged = useRef(false);

  // Capture the handoff code synchronously during the very first render.
  // This prevents React Router's <Navigate> from clearing it from the URL before the useEffect runs!
  const [initialHandoffCode] = useState(() => {
    return new URLSearchParams(window.location.search).get("handoff");
  });

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (initialHandoffCode && !hasExchanged.current) {
      hasExchanged.current = true;
      setIsExchanging(true);
      // Clean up URL immediately
      window.history.replaceState({}, document.title, window.location.pathname);
      
      fetch("https://getmaterio.app/api/v2/login", {
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
              const profileRes = await fetch("https://getmaterio.app/api/v2/profile", {
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
          <p className="text-sm text-muted-foreground font-medium">Authenticating with Materio...</p>
        </div>
      </div>
    );
  }

  return (
    <BrowserRouter>
      <IframeListener />
      <Routes>
        <Route path="/" element={<Navigate to="/new" replace />} />
        <Route path="/new" element={<ChatLayout />} />
        <Route path="/c/:id" element={<ChatLayout />} />
        <Route path="/share/:id" element={<ChatLayout />} />
        <Route path="/settings" element={<ChatLayout />} />
        <Route path="/settings/:tab" element={<ChatLayout />} />
      </Routes>
    </BrowserRouter>
  );
}
