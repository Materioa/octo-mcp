import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useAuthStore } from "@/stores/auth";
import { exchangeHandoffCode } from "@/lib/auth-api";

const AUTH_URL = import.meta.env.VITE_MATERIO_AUTH_URL || "https://auth.getmaterio.app";
const ACCOUNTS_URL = import.meta.env.VITE_MATERIO_ACCOUNTS_URL || "https://accounts.getmaterio.app";

export function AuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const isExchanging = useRef(false);

  useEffect(() => {
    if (isExchanging.current) return;

    const code = searchParams.get("code") || searchParams.get("handoff");
    const errParam = searchParams.get("error");

    if (errParam) {
      setError(errParam);
      return;
    }

    if (!code) {
      // Redirect to Auth login
      const callback = `${window.location.origin}/auth/callback`;
      window.location.href = `${AUTH_URL}/login?callback=${encodeURIComponent(callback)}`;
      return;
    }

    isExchanging.current = true;

    // Exchange the code via proxy / direct fallback
    exchangeHandoffCode(code)
      .then(({ token, user }) => {
        useAuthStore.getState().setAuth(token, user);
        useAuthStore.getState().setLoginOpen(false);
        navigate("/new", { replace: true });
      })
      .catch((err) => {
        console.error("Auth callback error:", err);
        setError(err.message || "Failed to complete login");
      });
  }, [searchParams, navigate]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground p-4">
      {error ? (
        <div className="max-w-md w-full rounded-2xl border border-destructive/20 bg-destructive/5 p-6 text-center space-y-4">
          <p className="text-base font-semibold text-destructive">Authentication Error</p>
          <p className="text-sm text-muted-foreground">{error}</p>
          <div className="pt-2">
            <button
              onClick={() => {
                const callback = `${window.location.origin}/auth/callback`;
                window.location.href = `${AUTH_URL}/login?callback=${encodeURIComponent(callback)}`;
              }}
              className="px-4 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:opacity-90 transition-opacity cursor-pointer"
            >
              Try Again
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground font-medium">Signing in with Materio ID...</p>
        </div>
      )}
    </div>
  );
}
