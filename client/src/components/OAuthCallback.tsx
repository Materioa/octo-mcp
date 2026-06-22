import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader } from "lucide-react";
import { useSettingsStore } from "@/stores/settings";

export function OAuthCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const isProcessing = useRef(false);

  useEffect(() => {
    if (isProcessing.current) return;
    
    const code = searchParams.get("code");
    const errParam = searchParams.get("error");
    
    if (errParam) {
      setError(errParam);
      return;
    }

    if (!code) {
      setError("No authorization code found in URL.");
      return;
    }

    const connectorId = localStorage.getItem("oauth_connector_id");
    const verifier = localStorage.getItem("oauth_verifier");

    if (!connectorId) {
      setError("No OAuth connector ID found in storage. Session may have expired.");
      return;
    }

    const settings = useSettingsStore.getState();
    const connector = settings.customConnectors?.find(c => c.id === connectorId);

    if (!connector) {
      setError("Connector not found in settings.");
      return;
    }

    isProcessing.current = true;

    const exchangeToken = async () => {
      try {
        const body = new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: window.location.origin + "/oauth/callback",
        });

        if (verifier) {
          body.append("code_verifier", verifier);
        }

        const headers: Record<string, string> = {
          "Content-Type": "application/x-www-form-urlencoded"
        };

        if (connector.oauthClientId && connector.oauthClientSecret) {
          headers["Authorization"] = "Basic " + btoa(`${connector.oauthClientId}:${connector.oauthClientSecret}`);
        } else if (connector.oauthClientId) {
          body.append("client_id", connector.oauthClientId);
        }

        const tokenUrl = connector.oauthTokenUrl || "";
        if (!tokenUrl) throw new Error("No token URL configured for this connector.");

        const response = await fetch(tokenUrl, {
          method: "POST",
          headers,
          body
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`Token exchange failed: ${response.status} ${text}`);
        }

        const data = await response.json();
        
        if (!data.access_token) {
          throw new Error("No access_token in response.");
        }

        // Update settings with the token
        settings.updateCustomConnector(connector.id, {
          oauthToken: data.access_token
        });

        // Clean up
        localStorage.removeItem("oauth_connector_id");
        localStorage.removeItem("oauth_verifier");

        // Redirect back to settings
        navigate("/settings/mcp", { replace: true });
      } catch (err: any) {
        console.error("OAuth Exchange Error:", err);
        setError(err.message || "Failed to exchange token.");
      }
    };

    exchangeToken();
  }, [searchParams, navigate]);

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-background text-foreground">
      <div className="flex flex-col items-center gap-4 max-w-md text-center p-6 bg-card border border-border rounded-xl shadow-sm">
        {error ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" x2="12" y1="8" y2="12"/><line x1="12" x2="12.01" y1="16" y2="16"/></svg>
            </div>
            <h2 className="text-xl font-bold">Authentication Failed</h2>
            <p className="text-sm text-muted-foreground">{error}</p>
            <button 
              onClick={() => navigate("/settings/mcp", { replace: true })}
              className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg font-medium"
            >
              Back to Settings
            </button>
          </>
        ) : (
          <>
            <Loader className="h-8 w-8 animate-spin text-primary" />
            <h2 className="text-xl font-bold">Connecting...</h2>
            <p className="text-sm text-muted-foreground">Exchanging authorization code for an access token. Please wait.</p>
          </>
        )}
      </div>
    </div>
  );
}
