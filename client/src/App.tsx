import { useEffect, useState } from "react";
import { ChatLayout } from "@/components/chat/ChatLayout";
import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Loader } from "lucide-react";

export default function App() {
  const theme = useSettingsStore((s) => s.theme);
  const { setAuth, setLoginOpen } = useAuthStore();
  const [isExchanging, setIsExchanging] = useState(false);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const handoffCode = searchParams.get("handoff");
    
    if (handoffCode) {
      setIsExchanging(true);
      // Clean up URL immediately
      window.history.replaceState({}, document.title, window.location.pathname);
      
      fetch("https://getmaterio.app/api/v2/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "exchange", code: handoffCode })
      })
      .then(res => res.json())
      .then(data => {
        if (data.token && data.user) {
          setAuth(data.token, data.user);
          setLoginOpen(false);
        } else if (data.error) {
          console.error("Handoff exchange failed:", data.error);
        }
      })
      .catch(err => console.error("Handoff fetch error:", err))
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
      <Routes>
        <Route path="/" element={<Navigate to="/new" replace />} />
        <Route path="/new" element={<ChatLayout />} />
        <Route path="/c/:id" element={<ChatLayout />} />
        <Route path="/settings" element={<ChatLayout />} />
        <Route path="/settings/:tab" element={<ChatLayout />} />
      </Routes>
    </BrowserRouter>
  );
}
