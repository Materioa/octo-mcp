import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useLoginWithChatGPT } from "@opencoredev/loginwithchatgpt-react";
import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { Loader2, CheckCircle2, AlertTriangle, ExternalLink, Copy, ArrowLeft } from "lucide-react";

interface LoginDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message?: string;
}

export function LoginDialog({ open, onOpenChange, message }: LoginDialogProps) {
  const [showChatGPTAuth, setShowChatGPTAuth] = useState(false);
  const settings = useSettingsStore();

  const handleRedirect = () => {
    const callbackUrl = encodeURIComponent(window.location.origin);
    window.location.href = `https://getmaterio.app/account?callback=${callbackUrl}`;
  };

  const apiBase = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? "" : "https://mcp.getmaterio.app");
  const {
    status,
    user,
    userCode,
    verificationUrl,
    login,
    copyCode,
  } = useLoginWithChatGPT({
    basePath: `${apiBase}/api/chatgpt`
  });

  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    copyCode();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Automatically start login flow when switching to ChatGPT auth view
  useEffect(() => {
    if (showChatGPTAuth && status === "unauthenticated") {
      login();
    }
  }, [showChatGPTAuth, status]);

  // When successfully authenticated, configure ChatGPT provider, fetch models, and close the modal
  useEffect(() => {
    if (status === "authenticated") {
      const fetchModelsAndSetProvider = async () => {
        try {
          const response = await fetch(`${apiBase}/api/chatgpt/models`, {
            credentials: "include"
          });
          if (response.ok) {
            const data = await response.json();
            if (data.models && Array.isArray(data.models) && data.models.length > 0) {
              // 1. Store fetched models
              settings.setFetchedModels("chatgpt", data.models);
              
              // 2. Select default model
              const selectedModel = data.models.includes("gpt-4o") ? "gpt-4o" : data.models[0];
              
              // 3. Save as current active provider
              settings.setAIProvider({
                providerId: "chatgpt",
                baseUrl: "/api/chatgpt",
                apiKey: "",
                model: selectedModel
              });
            }
          }
        } catch (error) {
          console.error("Failed to fetch ChatGPT models:", error);
        } finally {
          // 4. Close the dialog
          onOpenChange(false);
          setShowChatGPTAuth(false);
        }
      };
      fetchModelsAndSetProvider();
    }
  }, [status]);

  // Reset view when dialog closes
  useEffect(() => {
    if (!open) {
      setShowChatGPTAuth(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* 
        Concentric Radius Formula: 
        Outer Radius = Inner Radius + Padding
        Padding: 16px (!p-4)
        Inner button radius: 8px (!rounded-[8px])
        Outer dialog radius: 24px (!rounded-[24px])
      */}
      <DialogContent className="sm:max-w-md !p-4 !rounded-[24px] !squircle-[24px] sm:!rounded-[24px] sm:!squircle-[24px]">
        {!showChatGPTAuth ? (
          <>
            <DialogHeader className="p-2">
              <DialogTitle className="text-xl font-bold">Sign in to Materio Chat</DialogTitle>
              <DialogDescription className="text-sm mt-1">
                {message || "Login to sync your chats and unlock higher message limits."}
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 flex flex-col gap-3">
              <Button onClick={handleRedirect} className="w-full h-12 text-base !rounded-[8px] cursor-pointer">
                Sign In with Materio
              </Button>
              
              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-border"></div>
                <span className="flex-shrink mx-3 text-xs text-muted-foreground uppercase font-semibold tracking-wider">or</span>
                <div className="flex-grow border-t border-border"></div>
              </div>

              <Button 
                variant="outline" 
                onClick={() => setShowChatGPTAuth(true)} 
                className="w-full h-12 text-base !rounded-[8px] border-border hover:bg-accent/50 cursor-pointer"
              >
                Use ChatGPT Account (Free)
              </Button>

              {import.meta.env.DEV && (
                <Button 
                  variant="secondary" 
                  onClick={() => {
                    const authStore = useAuthStore.getState();
                    authStore.setAuth("test_token", {
                      id: "test-user-id",
                      username: "testuser",
                      name: "Test User",
                      email: "test@example.com",
                      hasAdminPrivileges: true,
                      isPlusUser: true,
                    });
                    authStore.setLoginOpen(false);
                    onOpenChange(false);
                  }} 
                  className="w-full h-12 text-base !rounded-[8px] cursor-pointer bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20"
                >
                  Developer Login (Test Mode)
                </Button>
              )}

              <p className="text-xs text-center text-muted-foreground mt-2">
                You will be securely redirected to Materio to authenticate.
              </p>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="p-2 flex flex-row items-center gap-3">
              <button 
                onClick={() => setShowChatGPTAuth(false)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
              <div>
                <DialogTitle className="text-lg font-bold">ChatGPT Authentication</DialogTitle>
                <DialogDescription className="text-xs mt-0.5">
                  Use your own ChatGPT subscription limits for free.
                </DialogDescription>
              </div>
            </DialogHeader>

            <div className="mt-4 space-y-4">
              {status === "loading" && (
                <div className="flex flex-col items-center justify-center py-6 gap-3 text-sm text-muted-foreground">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  Checking connection status...
                </div>
              )}

              {(status === "unauthenticated" || status === "connecting" || status === "pending") && (
                <div className="space-y-4">
                  {status === "pending" ? (
                    <div className="space-y-3 text-xs text-muted-foreground bg-muted/20 p-3 rounded-xl border border-border/50">
                      <div className="flex items-center gap-2 text-sm font-semibold text-amber-500 mb-1">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Awaiting confirmation...
                      </div>

                      <div className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">1</span>
                        <div className="leading-5">
                          Open the OpenAI authorization page:
                          <a 
                            href={verificationUrl} 
                            target="_blank" 
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 text-primary hover:underline font-semibold ml-1 cursor-pointer"
                          >
                            Confirm on OpenAI <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>

                      <div className="flex items-start gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-foreground">2</span>
                        <div className="flex-1 leading-5">
                          Enter or confirm this temporary code:
                          <div className="mt-1.5 flex items-center gap-2">
                            <span className="font-mono font-bold text-base text-foreground bg-background px-3 py-1 rounded-md border border-border select-all tracking-wider">
                              {userCode}
                            </span>
                            <Button 
                              variant="outline" 
                              size="sm" 
                              onClick={handleCopy}
                              className="h-8 px-2.5 gap-1 text-xs !rounded-[6px] cursor-pointer"
                            >
                              <Copy className="w-3.5 h-3.5" />
                              {copied ? "Copied" : "Copy"}
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
                      <span className="text-sm text-muted-foreground font-medium">Requesting authentication code...</span>
                    </div>
                  )}
                </div>
              )}

              {status === "expired" && (
                <div className="flex flex-col items-center justify-center py-4 space-y-3 text-center">
                  <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <AlertTriangle className="w-4 h-4" />
                    Verification Code Expired
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The verification window has timed out. Please try again.
                  </p>
                  <Button onClick={() => login()} className="!rounded-[8px] cursor-pointer">
                    Generate New Code
                  </Button>
                </div>
              )}

              {status === "error" && (
                <div className="flex flex-col items-center justify-center py-4 space-y-3 text-center">
                  <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
                    <AlertTriangle className="w-4 h-4" />
                    Authentication Error
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Something went wrong during authentication. Please retry.
                  </p>
                  <Button onClick={() => login()} className="!rounded-[8px] cursor-pointer">
                    Retry Authentication
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
