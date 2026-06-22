import { useState, useEffect, useCallback } from "react";
import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { getMemoryManager } from "@/lib/memory";
import { PROVIDER_PRESETS, getPreset, getModelCounterpart } from "@/lib/providers/presets";
import type { ProviderId, Memory, MCPTool } from "@/types";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { WandSparkles } from "lucide-react";
import { ModelSelector } from "@/components/ui/ModelSelector";

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mcpConnected: boolean;
  tools: MCPTool[];
  defaultTab?: string;
  defaultMobileView?: "list" | "detail";
}

export function SettingsDialog({
  open,
  onOpenChange,
  mcpConnected,
  tools,
  defaultTab = "ai",
  defaultMobileView = "list",
}: SettingsDialogProps) {
  const settings = useSettingsStore();
  const auth = useAuthStore();
  const userId = auth.user?.id || auth.anonymousId;
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [mcpView, setMcpView] = useState<"list" | "detail" | "add-custom">("list");
  const [mobileView, setMobileView] = useState<"list" | "detail">("list");

  const [newConnectorName, setNewConnectorName] = useState("");
  const [newConnectorUrl, setNewConnectorUrl] = useState("");
  const [newConnectorAuthType, setNewConnectorAuthType] = useState<"none" | "api_key" | "oauth">("none");
  const [newConnectorApiKey, setNewConnectorApiKey] = useState("");
  const [newConnectorClientId, setNewConnectorClientId] = useState("");
  const [newConnectorClientSecret, setNewConnectorClientSecret] = useState("");
  const [newConnectorAuthUrl, setNewConnectorAuthUrl] = useState("");
  const [newConnectorTokenUrl, setNewConnectorTokenUrl] = useState("");

  const [localSettings, setLocalSettings] = useState({
    providerId: settings.aiProvider.providerId ?? "openrouter-free",
    baseUrl: settings.aiProvider.baseUrl,
    apiKey: settings.aiProvider.apiKey,
    model: settings.aiProvider.model,
  });

  const [localCustomInstructions, setLocalCustomInstructions] = useState(settings.customInstructions || "");
  const [newSkillName, setNewSkillName] = useState("");
  const [newSkillContent, setNewSkillContent] = useState("");
  const [isAddingSkill, setIsAddingSkill] = useState(false);
  const [newCustomModelSlug, setNewCustomModelSlug] = useState("");
  const [customModelLevel, setCustomModelLevel] = useState<'low' | 'medium' | 'high'>("high");

  // Memory state
  const [memories, setMemories] = useState<Memory[]>([]);
  const [memorySearch, setMemorySearch] = useState("");
  const [memoryLoading, setMemoryLoading] = useState(false);

  // Gemini dynamic models
  const [geminiModels, setGeminiModels] = useState<{name: string, displayName: string}[]>([]);
  const [fetchingGeminiModels, setFetchingGeminiModels] = useState(false);

  useEffect(() => {
    if (open) {
      setLocalSettings({
        providerId: settings.aiProvider.providerId ?? "openrouter-free",
        baseUrl: settings.aiProvider.baseUrl,
        apiKey: settings.aiProvider.apiKey,
        model: settings.aiProvider.model,
      });
      setActiveTab(defaultTab);
      setMcpView("list");
      setMobileView(defaultMobileView);
    }
  }, [open, settings, defaultTab, defaultMobileView]);

  // Load memories when Memory tab is active
  const loadMemories = useCallback(async () => {
    setMemoryLoading(true);
    try {
      const mem = getMemoryManager(import.meta.env.VITE_SUPERMEMORY_API_KEY || "", userId);
      const results = memorySearch
        ? await mem.searchMemories(memorySearch)
        : await mem.listMemories();
      setMemories(results);
    } catch (err) {
      console.error("Failed to load memories:", err);
    } finally {
      setMemoryLoading(false);
    }
  }, [memorySearch, userId]);

  useEffect(() => {
    if (open && activeTab === "memory") {
      loadMemories();
    }
  }, [open, activeTab, loadMemories]);

  useEffect(() => {
    if (localSettings.providerId === "gemini" && localSettings.apiKey) {
      const fetchModels = async () => {
        setFetchingGeminiModels(true);
        try {
          const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${localSettings.apiKey}`);
          if (res.ok) {
            const data = await res.json();
            if (data.models) {
              setGeminiModels(data.models.map((m: any) => ({
                name: m.name.replace('models/', ''),
                displayName: m.displayName
              })));
            }
          }
        } catch (err) {
          console.error("Failed to fetch gemini models", err);
        } finally {
          setFetchingGeminiModels(false);
        }
      };
      
      const t = setTimeout(fetchModels, 500);
      return () => clearTimeout(t);
    } else {
      setGeminiModels([]);
    }
  }, [localSettings.providerId, localSettings.apiKey]);

  const handleDeleteMemory = async (id: string) => {
    try {
      const mem = getMemoryManager(import.meta.env.VITE_SUPERMEMORY_API_KEY || "", userId);
      await mem.deleteMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
    } catch {}
  };

  const currentPreset = getPreset(localSettings.providerId);
  const isFreeBuiltIn = localSettings.providerId === "openrouter-free";

  const handleProviderSwitch = (id: ProviderId) => {
    const preset = getPreset(id);
    setLocalSettings((s) => {
      const savedKey = settings.apiKeys[id];
      return {
        ...s,
        providerId: id,
        baseUrl: preset.baseUrl,
        model: preset.defaultModel,
        apiKey: savedKey || (s.providerId === id ? s.apiKey : ""),
      };
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        onClose={() => onOpenChange(false)} 
        className="max-w-4xl !p-0 overflow-hidden h-[100dvh] max-h-[100dvh] sm:max-h-[85vh] w-full max-w-none !rounded-none sm:!rounded-xl sm:h-[80vh] sm:min-h-[600px] sm:max-w-4xl bg-card border-0 sm:border-border flex flex-col"
      >
        <div className="flex flex-1 w-full relative overflow-hidden">
          {/* Sidebar */}
        <div className={cn(
          "w-full sm:w-[240px] flex-shrink-0 border-r border-border bg-muted/20 flex flex-col p-4 transition-transform duration-300 absolute sm:relative h-full z-10",
          mobileView === "detail" ? "-translate-x-full sm:translate-x-0" : "translate-x-0"
        )}>
          <div className="flex items-center justify-between mb-6 px-2 pt-2">
            <h2 className="text-xl font-bold">Settings</h2>
          </div>
          <div className="flex flex-col space-y-1">
            <button
              onClick={() => { setActiveTab('ai'); setMobileView('detail'); }}
              className={cn(
                'text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3',
                activeTab === 'ai'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <WandSparkles className="w-4 h-4" />
              AI Provider
            </button>
            <button
              onClick={() => { setActiveTab('mcp'); setMobileView('detail'); }}
              className={cn(
                'text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3',
                activeTab === 'mcp'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>
              Connectors
            </button>
            <button
              onClick={() => { setActiveTab('memory'); setMobileView('detail'); }}
              className={cn(
                'text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3',
                activeTab === 'memory'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"/><path d="M12 12v9"/><path d="m8 17 4 4 4-4"/></svg>
              Memory
            </button>
            <button
              onClick={() => { setActiveTab('personalization'); setMobileView('detail'); }}
              className={cn(
                'text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3',
                activeTab === 'personalization'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
              Personalization
            </button>
            <button
              onClick={() => { setActiveTab('skills'); setMobileView('detail'); }}
              className={cn(
                'text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-3',
                activeTab === 'skills'
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 21h12a2 2 0 0 0 2-2v-2H10v2a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v3h4"/><path d="M19 17V5a2 2 0 0 0-2-2H4"/></svg>
              Skills
            </button>
          </div>
        </div>

        {/* Main Content Area */}
        {/* Main Content Area */}
        <div className={cn(
          "flex-1 flex flex-col min-w-0 bg-background h-full absolute sm:relative w-full transition-transform duration-300 z-20",
          mobileView === "list" ? "translate-x-full sm:translate-x-0" : "translate-x-0"
        )}>
          <div className="flex items-center border-b border-border px-4 sm:px-8 py-5 shrink-0 h-[72px] gap-3 bg-background">
            <button 
              className="sm:hidden p-2 -ml-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted/50"
              onClick={() => setMobileView("list")}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
            </button>
            <h3 className="text-xl font-semibold capitalize tracking-tight">
              {activeTab === 'ai' ? 'AI Provider' : activeTab === 'mcp' ? 'Connectors' : activeTab === 'memory' ? 'Memory' : activeTab === 'skills' ? 'Skills' : 'Personalization'}
            </h3>
          </div>

          <ScrollArea className="flex-1 px-8 py-6">
            <div className="max-w-2xl">
              {/* ═══════════════  AI Provider Tab  ═══════════════ */}
              {activeTab === 'ai' && (
                <div className="space-y-6">
                  {/* Free Models Toggle */}
                  <div className="flex items-center justify-between rounded-xl border border-border p-4 bg-muted/20">
                    <div>
                      <div className="font-semibold text-sm text-foreground">Show Only Free Models</div>
                      <div className="text-xs text-muted-foreground mt-0.5">Filter models and endpoints to only show those that are free to use.</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => settings.setShowOnlyFreeModels(!settings.showOnlyFreeModels)}
                      className={cn(
                        "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none",
                        settings.showOnlyFreeModels ? 'bg-orange-500' : 'bg-muted-foreground/30'
                      )}
                    >
                      <span
                        className={cn(
                          "pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out",
                          settings.showOnlyFreeModels ? 'translate-x-4' : 'translate-x-0'
                        )}
                      />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <label className="text-sm font-medium">Provider Configuration</label>
                    <div className="grid grid-cols-2 gap-2">
                      {PROVIDER_PRESETS.map((preset) => (
                        <button
                          key={preset.id}
                          className={cn(
                            'rounded-lg border px-4 py-3 text-left text-sm font-medium transition-colors',
                            localSettings.providerId === preset.id
                              ? 'border-primary bg-primary/5 text-primary'
                              : 'border-border text-muted-foreground hover:border-primary/50 hover:bg-accent/50'
                          )}
                          onClick={() => handleProviderSwitch(preset.id)}
                        >
                          {preset.name}
                        </button>
                      ))}
                    </div>
                  </div>

                  {localSettings.providerId === 'custom' && (
                    <div className="space-y-3">
                      <label className="text-sm font-medium">Base URL</label>
                      <Input
                        value={localSettings.baseUrl}
                        onChange={(e) =>
                          setLocalSettings((s) => ({ ...s, baseUrl: e.target.value }))
                        }
                        placeholder={currentPreset.baseUrl || 'https://api.example.com/v1'}
                        className="h-10"
                      />
                    </div>
                  )}

                  {!isFreeBuiltIn && (
                    <div className="space-y-3">
                      <label className="text-sm font-medium">API Key</label>
                      <Input
                        type="password"
                        value={localSettings.apiKey}
                        onChange={(e) =>
                          setLocalSettings((s) => ({ ...s, apiKey: e.target.value }))
                        }
                        placeholder={currentPreset.keyPlaceholder}
                        className="h-10"
                      />
                    </div>
                  )}

                  <div className="space-y-3">
                    <label className="text-sm font-medium">
                      Model
                      {fetchingGeminiModels && <span className="ml-2 text-xs text-muted-foreground animate-pulse">Fetching models...</span>}
                    </label>
                    {localSettings.providerId === "gemini" && geminiModels.length > 0 ? (
                      <>
                        <ModelSelector
                          value={localSettings.model}
                          onChange={(m) => setLocalSettings((s) => ({ ...s, model: m }))}
                          providerId={localSettings.providerId}
                          models={geminiModels.map(m => m.name)}
                        />
                        {!geminiModels.find(m => m.name === localSettings.model) && (
                          <Input
                            value={localSettings.model}
                            onChange={(e) =>
                              setLocalSettings((s) => ({ ...s, model: e.target.value }))
                            }
                            placeholder="Enter custom model name"
                            className="h-10 mt-2"
                          />
                        )}
                      </>
                    ) : currentPreset.models.length > 0 ? (
                      <>
                        <ModelSelector
                          value={localSettings.model}
                          onChange={(m) => setLocalSettings((s) => ({ ...s, model: m }))}
                          providerId={localSettings.providerId}
                        />
                        {!isFreeBuiltIn && !currentPreset.models.includes(localSettings.model) && (
                          <Input
                            value={localSettings.model}
                            onChange={(e) =>
                              setLocalSettings((s) => ({ ...s, model: e.target.value }))
                            }
                            placeholder="Enter custom model name"
                            className="h-10 mt-2"
                          />
                        )}
                      </>
                    ) : (
                      <Input
                        value={localSettings.model}
                        onChange={(e) =>
                          setLocalSettings((s) => ({ ...s, model: e.target.value }))
                        }
                        placeholder="Enter model name"
                        disabled={isFreeBuiltIn}
                        className="h-10"
                      />
                    )}
                  </div>

                  {localSettings.providerId === "nvidia" && (
                    <div className="space-y-4 rounded-xl border border-border p-4 bg-muted/20 mt-4">
                      <div className="space-y-1">
                        <h4 className="text-sm font-semibold text-foreground">Custom Nvidia Models</h4>
                        <p className="text-xs text-muted-foreground">Add custom models by entering a base slug and selecting a performance/capacity size tier.</p>
                      </div>

                      {/* Added models list */}
                      {settings.customNvidiaModels && settings.customNvidiaModels.length > 0 && (
                        <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                          {settings.customNvidiaModels.map((m) => (
                            <div key={m.slug} className="flex items-center justify-between rounded-lg border border-border bg-background px-3 py-2 text-sm">
                              <div className="flex flex-col">
                                <span className="font-medium text-foreground">{m.label}</span>
                                <span className="text-xs text-muted-foreground font-mono">{m.slug}</span>
                              </div>
                              <button
                                type="button"
                                className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors cursor-pointer"
                                onClick={() => settings.deleteCustomNvidiaModel(m.slug)}
                                title="Remove Model"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Add form */}
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Base Model Slug / Pattern</label>
                          <Input
                            placeholder="e.g. nvidia/nemotron-4-340b-instruct or meta/llama-3.1-70b-instruct"
                            value={newCustomModelSlug}
                            onChange={(e) => setNewCustomModelSlug(e.target.value)}
                            className="h-9 bg-background"
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label className="text-xs font-medium text-muted-foreground">Performance/Capacity Tier</label>
                          <div className="flex gap-2">
                            {(['low', 'medium', 'high'] as const).map((level) => (
                              <button
                                key={level}
                                type="button"
                                className={cn(
                                  "flex-1 py-1.5 px-3 rounded-lg border text-xs font-medium capitalize transition-colors cursor-pointer text-center",
                                  customModelLevel === level
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "border-border text-muted-foreground hover:border-primary/50 hover:bg-accent/50"
                                )}
                                onClick={() => setCustomModelLevel(level)}
                              >
                                {level}
                              </button>
                            ))}
                          </div>
                        </div>

                        {newCustomModelSlug.trim() && (() => {
                          const preview = getModelCounterpart(newCustomModelSlug, customModelLevel);
                          return (
                            <div className="rounded-lg border border-dashed border-border/80 p-2.5 bg-background/50 space-y-1">
                              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider block">Computed Model Preview</span>
                              <div className="text-xs font-medium text-foreground">Label: <span className="text-primary">{preview.label}</span></div>
                              <div className="text-xs font-mono text-muted-foreground truncate">Slug: {preview.slug}</div>
                            </div>
                          );
                        })()}

                        <div className="flex justify-end pt-1">
                          <Button
                            type="button"
                            size="sm"
                            disabled={!newCustomModelSlug.trim()}
                            onClick={() => {
                              if (newCustomModelSlug.trim()) {
                                const finalModel = getModelCounterpart(newCustomModelSlug, customModelLevel);
                                if (finalModel.slug) {
                                  settings.addCustomNvidiaModel(finalModel);
                                  setLocalSettings((s) => ({ ...s, model: finalModel.slug }));
                                  setNewCustomModelSlug("");
                                }
                              }
                            }}
                          >
                            Add Custom Model
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}

                  {(localSettings.providerId !== (settings.aiProvider.providerId ?? "openrouter-free") ||
                    localSettings.baseUrl !== settings.aiProvider.baseUrl ||
                    localSettings.apiKey !== settings.aiProvider.apiKey ||
                    localSettings.model !== settings.aiProvider.model) && (
                    <div className="flex justify-end gap-3 pt-4 border-t border-border mt-6">
                      <Button variant="outline" onClick={() => {
                        setLocalSettings({
                          providerId: settings.aiProvider.providerId ?? "openrouter-free",
                          baseUrl: settings.aiProvider.baseUrl,
                          apiKey: settings.aiProvider.apiKey,
                          model: settings.aiProvider.model,
                        });
                      }}>
                        Cancel
                      </Button>
                      <Button onClick={() => {
                        settings.setAIProvider({
                          providerId: localSettings.providerId as ProviderId,
                          baseUrl: localSettings.baseUrl,
                          apiKey: localSettings.apiKey,
                          model: localSettings.model,
                        });
                      }}>
                        Save Provider
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* ═══════════════  MCP Server Tab  ═══════════════ */}
              {activeTab === 'mcp' && (
                <div className="space-y-6">
                  {mcpView === 'list' ? (
                    <div className="space-y-4">
                      <div 
                        className="cursor-pointer rounded-xl border border-border bg-card p-5 hover:border-primary/50 hover:shadow-sm transition-all group"
                        onClick={() => setMcpView('detail')}
                      >
                        <div className="flex items-center gap-5">
                          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-accent p-2.5">
                            <img src="/app.png" alt="Materio Logo" className="h-full w-full object-contain" />
                          </div>
                          <div className="flex-1">
                            <h3 className="font-semibold text-lg">Materio</h3>
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className={cn('inline-block h-2 w-2 rounded-full shadow-sm', mcpConnected ? 'bg-green-500 shadow-green-500/50' : 'bg-red-500 shadow-red-500/50')} />
                              <span className="text-sm text-muted-foreground font-medium">{mcpConnected ? 'Connected' : 'Disconnected'} • {tools.length} Tools</span>
                            </div>
                          </div>
                          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground group-hover:text-foreground transition-colors"><path d="m9 18 6-6-6-6"/></svg>
                        </div>
                      </div>

                      {settings.customConnectors?.map(connector => (
                        <div 
                          key={connector.id}
                          className="cursor-pointer rounded-xl border border-border bg-card p-5 hover:border-primary/50 hover:shadow-sm transition-all group flex items-center justify-between"
                        >
                          <div className="flex items-center gap-5">
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-muted p-2.5">
                              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M12 22v-5"/><path d="M9 8V2"/><path d="M15 8V2"/><path d="M18 8v5a4 4 0 0 1-4 4h-4a4 4 0 0 1-4-4V8Z"/></svg>
                            </div>
                            <div>
                              <h3 className="font-semibold text-lg">{connector.name}</h3>
                              <div className="flex items-center gap-2 mt-1.5">
                                <span className="text-sm text-muted-foreground font-medium truncate max-w-[200px] sm:max-w-xs">{connector.url}</span>
                                {connector.authType === "oauth" && !connector.oauthToken && (
                                  <span className="text-xs bg-yellow-500/20 text-yellow-600 px-2 py-0.5 rounded-full font-semibold">Requires Auth</span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {connector.authType === "oauth" && !connector.oauthToken && (
                              <Button 
                                variant="outline" 
                                size="sm" 
                                className="h-8"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  // Trigger OAuth Flow
                                  const verifier = crypto.randomUUID().replace(/-/g, "");
                                  localStorage.setItem("oauth_verifier", verifier);
                                  localStorage.setItem("oauth_connector_id", connector.id);
                                  
                                  const authorizeUrl = new URL(connector.oauthAuthUrl || "");
                                  authorizeUrl.searchParams.set("client_id", connector.oauthClientId || "");
                                  authorizeUrl.searchParams.set("redirect_uri", window.location.origin + "/oauth/callback");
                                  authorizeUrl.searchParams.set("response_type", "code");
                                  authorizeUrl.searchParams.set("state", crypto.randomUUID());
                                  authorizeUrl.searchParams.set("code_challenge", verifier); // Need actual S256 in real prod, but Materio allows plain verifier if server supports it, wait actually Materio doc says native PKCE supported.
                                  authorizeUrl.searchParams.set("code_challenge_method", "plain");
                                  window.location.href = authorizeUrl.toString();
                                }}
                              >
                                Connect
                              </Button>
                            )}
                            <button
                              type="button"
                              className="rounded-lg p-2 text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
                              onClick={(e) => {
                                e.stopPropagation();
                                settings.deleteCustomConnector(connector.id);
                              }}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            </button>
                          </div>
                        </div>
                      ))}

                      <Button 
                        variant="outline" 
                        className="w-full border-dashed py-8 flex flex-col items-center gap-2 hover:border-primary hover:bg-accent/50"
                        onClick={() => setMcpView('add-custom')}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
                        <span className="font-semibold text-foreground">Add Custom Connector</span>
                      </Button>
                    </div>
                  ) : mcpView === 'add-custom' ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                      <button onClick={() => setMcpView('list')} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                        Back to servers
                      </button>

                      <div>
                        <h2 className="text-2xl font-bold">Add Custom Connector</h2>
                        <p className="text-sm text-muted-foreground mt-1">Connect to any external MCP server to expand your capabilities.</p>
                      </div>

                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Connector Name</label>
                          <Input 
                            placeholder="e.g. My Internal DB" 
                            value={newConnectorName}
                            onChange={e => setNewConnectorName(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium">Server URL (SSE Endpoint)</label>
                          <Input 
                            placeholder="https://..." 
                            value={newConnectorUrl}
                            onChange={e => setNewConnectorUrl(e.target.value)}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-sm font-medium">Authentication Type</label>
                          <div className="flex gap-2">
                            {(['none', 'api_key', 'oauth'] as const).map((type) => (
                              <button
                                key={type}
                                type="button"
                                className={cn(
                                  "flex-1 py-2 px-3 rounded-lg border text-sm font-medium transition-colors text-center",
                                  newConnectorAuthType === type
                                    ? "border-primary bg-primary/5 text-primary"
                                    : "border-border text-muted-foreground hover:border-primary/50 hover:bg-accent/50"
                                )}
                                onClick={() => setNewConnectorAuthType(type)}
                              >
                                {type === 'none' ? 'None' : type === 'api_key' ? 'API Key' : 'OAuth'}
                              </button>
                            ))}
                          </div>
                        </div>

                        {newConnectorAuthType === 'api_key' && (
                          <div className="space-y-2 animate-in fade-in duration-300">
                            <label className="text-sm font-medium">API Key (Sent as Bearer token)</label>
                            <Input 
                              type="password"
                              placeholder="sk-..." 
                              value={newConnectorApiKey}
                              onChange={e => setNewConnectorApiKey(e.target.value)}
                            />
                          </div>
                        )}

                        {newConnectorAuthType === 'oauth' && (
                          <div className="space-y-4 animate-in fade-in duration-300 p-4 rounded-xl border border-border bg-muted/20">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Callback URL</label>
                              <div className="flex gap-2">
                                <Input readOnly value={window.location.origin + "/oauth/callback"} className="bg-muted font-mono text-xs" />
                                <Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(window.location.origin + "/oauth/callback")}>
                                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                                </Button>
                              </div>
                              <p className="text-xs text-muted-foreground">Register this exact callback URL in your external OAuth provider.</p>
                            </div>

                            <div className="space-y-2 pt-2">
                              <label className="text-sm font-medium">Client ID</label>
                              <Input 
                                placeholder="client_..." 
                                value={newConnectorClientId}
                                onChange={e => setNewConnectorClientId(e.target.value)}
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium">Client Secret (Optional)</label>
                              <Input 
                                type="password"
                                placeholder="secret_..." 
                                value={newConnectorClientSecret}
                                onChange={e => setNewConnectorClientSecret(e.target.value)}
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium">Authorization URL</label>
                              <Input 
                                placeholder="https://example.com/oauth/authorize" 
                                value={newConnectorAuthUrl}
                                onChange={e => setNewConnectorAuthUrl(e.target.value)}
                              />
                            </div>

                            <div className="space-y-2">
                              <label className="text-sm font-medium">Token URL</label>
                              <Input 
                                placeholder="https://example.com/oauth/token" 
                                value={newConnectorTokenUrl}
                                onChange={e => setNewConnectorTokenUrl(e.target.value)}
                              />
                            </div>
                          </div>
                        )}

                        <div className="pt-4 flex justify-end gap-3">
                          <Button variant="outline" onClick={() => setMcpView('list')}>Cancel</Button>
                          <Button 
                            disabled={!newConnectorName.trim() || !newConnectorUrl.trim() || (newConnectorAuthType === 'oauth' && (!newConnectorClientId || !newConnectorAuthUrl || !newConnectorTokenUrl))}
                            onClick={() => {
                              settings.addCustomConnector({
                                name: newConnectorName,
                                url: newConnectorUrl,
                                authType: newConnectorAuthType,
                                apiKey: newConnectorApiKey,
                                oauthClientId: newConnectorClientId,
                                oauthClientSecret: newConnectorClientSecret,
                                oauthAuthUrl: newConnectorAuthUrl,
                                oauthTokenUrl: newConnectorTokenUrl,
                              });
                              setNewConnectorName("");
                              setNewConnectorUrl("");
                              setNewConnectorAuthType("none");
                              setNewConnectorApiKey("");
                              setNewConnectorClientId("");
                              setNewConnectorClientSecret("");
                              setNewConnectorAuthUrl("");
                              setNewConnectorTokenUrl("");
                              setMcpView('list');
                            }}
                          >
                            Add Connector
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                      <button onClick={() => setMcpView('list')} className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                        Back to servers
                      </button>
                      
                      <div className="flex items-center gap-5 pb-2">
                        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-accent p-3 shadow-sm">
                          <img src="/app.png" alt="Materio Logo" className="h-full w-full object-contain" />
                        </div>
                        <div>
                          <h2 className="text-2xl font-bold">Materio</h2>
                          <p className="text-sm text-muted-foreground mt-1">API endpoints converted to MCP tools from openapi.json</p>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <h3 className="text-base font-semibold">Available Tools ({tools.length})</h3>
                        <div className="w-full rounded-xl border border-border p-3 bg-muted/30">
                          <div className="flex flex-wrap gap-2 max-h-[160px] overflow-y-auto">
                            {tools.map(t => (
                              <div key={t.name} className="rounded-lg bg-background border border-border px-3 py-1.5 text-sm font-medium text-foreground shadow-sm" title={t.description}>
                                {t.name}
                              </div>
                            ))}
                            {tools.length === 0 && (
                              <span className="text-sm text-muted-foreground py-2 px-1">
                                {mcpConnected ? 'No tools exported by server.' : 'Connect to server to view tools.'}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="mt-6 rounded-xl bg-card border border-border overflow-hidden">
                        <div className="flex justify-between items-center p-4 border-b border-border/50">
                          <span className="text-sm font-medium text-muted-foreground">Author</span>
                          <span className="text-sm font-semibold text-foreground">Materio</span>
                        </div>
                        <div className="flex justify-between items-center p-4 border-b border-border/50">
                          <span className="text-sm font-medium text-muted-foreground">URL</span>
                          <a href={import.meta.env.VITE_MCP_DISPLAY_URL || import.meta.env.VITE_MCP_SERVER_URL || 'https://mcp.getmaterio.app/mcp'} target="_blank" rel="noreferrer" className="text-sm hover:underline text-foreground">
                            {(import.meta.env.VITE_MCP_DISPLAY_URL || import.meta.env.VITE_MCP_SERVER_URL || 'https://mcp.getmaterio.app/mcp').replace(/^https?:\/\//, '')}
                          </a>
                        </div>
                        <div className="flex justify-between items-center p-4 border-b border-border/50">
                          <span className="text-sm font-medium text-muted-foreground">Privacy Policy</span>
                          <a href="https://getmaterio.app/privacy" target="_blank" rel="noreferrer" className="text-sm hover:underline text-foreground">getmaterio.app/privacy</a>
                        </div>
                        <div className="flex justify-between items-center p-4">
                          <span className="text-sm font-medium text-muted-foreground">Version</span>
                          <span className="text-sm text-foreground">1.0.0</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ═══════════════  Memory Tab  ═══════════════ */}
              {activeTab === 'memory' && (
                <div className="space-y-6">
                  <div className="space-y-3">
                    <label className="text-sm font-medium">Search Stored Memories</label>
                    <Input
                      placeholder="Search across all conversations…"
                      value={memorySearch}
                      onChange={(e) => setMemorySearch(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && loadMemories()}
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-3">
                    <h3 className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                      Results
                      <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{memories.length}</span>
                    </h3>
                    {memoryLoading ? (
                      <div className="flex items-center justify-center py-10">
                        <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                      </div>
                    ) : memories.length === 0 ? (
                      <div className="py-10 text-center rounded-xl border border-dashed border-border bg-muted/10">
                        <p className="text-sm text-muted-foreground">
                          {memorySearch ? 'No matching memories found' : 'No memories stored yet'}
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {memories.map((mem) => (
                          <div
                            key={mem.id}
                            className="group relative rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors shadow-sm"
                          >
                            <p className="pr-8 text-sm leading-relaxed text-foreground">
                              {mem.content}
                            </p>
                            <p className="mt-2 text-xs font-medium text-muted-foreground">
                              {new Date(mem.createdAt).toLocaleDateString()}
                            </p>
                            <button
                              className="absolute right-3 top-3 hidden rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block transition-colors"
                              onClick={() => handleDeleteMemory(mem.id)}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ═══════════════  Personalization Tab  ═══════════════ */}
              {activeTab === 'personalization' && (
                <div className="space-y-6">
                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Appearance</h4>
                    <div className="flex items-center justify-between rounded-xl border border-border p-4 bg-muted/20">
                      <div>
                        <div className="font-medium">Theme</div>
                        <div className="text-sm text-muted-foreground mt-0.5">Toggle between light and dark mode.</div>
                      </div>
                      <div className="flex bg-muted/50 rounded-full p-1 border border-border/50">
                        <button
                          onClick={() => settings.setTheme("system")}
                          title="System"
                          className={cn(
                            "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200 flex items-center justify-center",
                            settings.theme === "system" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                        </button>
                        <button
                          onClick={() => settings.setTheme("light")}
                          title="Light"
                          className={cn(
                            "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200 flex items-center justify-center",
                            settings.theme === "light" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
                        </button>
                        <button
                          onClick={() => settings.setTheme("dark")}
                          title="Dark"
                          className={cn(
                            "px-4 py-1.5 rounded-full text-xs font-medium transition-all duration-200 flex items-center justify-center",
                            settings.theme === "dark" ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"
                          )}
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/></svg>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Personality</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {[
                        { id: "friendly", name: "Friendly", desc: "Warm, conversational, and approachable responses." },
                        { id: "nerdy", name: "Nerdy", desc: "Highly technical, detailed, and precise answers." },
                        { id: "explainer", name: "Explainer", desc: "Explains complex concepts in simple, easy terms." },
                      ].map((p) => (
                        <button
                          key={p.id}
                          onClick={() => settings.setPersonality(p.id as any)}
                          className={cn(
                            "flex flex-col items-start p-4 rounded-xl border text-left transition-all",
                            settings.personality === p.id 
                              ? "border-brand bg-brand/5 shadow-sm" 
                              : "border-border bg-card hover:bg-accent/50"
                          )}
                        >
                          <span className={cn("text-sm font-semibold", settings.personality === p.id ? "text-brand" : "text-foreground")}>
                            {p.name}
                          </span>
                          <span className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                            {p.desc}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-4">
                    <h4 className="text-sm font-medium">Custom Instructions</h4>
                    <Textarea 
                      placeholder="What would you like Materio to know about you to provide better responses?"
                      className="min-h-[120px] resize-none"
                      value={localCustomInstructions}
                      onChange={(e) => setLocalCustomInstructions(e.target.value)}
                    />
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-muted-foreground">These instructions will be appended to the AI's system prompt.</p>
                      {localCustomInstructions !== (settings.customInstructions || "") && (
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => setLocalCustomInstructions(settings.customInstructions || "")}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={() => settings.setCustomInstructions(localCustomInstructions)}>
                            Save Instructions
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* ═══════════════  Skills Tab  ═══════════════ */}
              {activeTab === 'skills' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <h4 className="text-sm font-medium">Your Skills</h4>
                      <p className="text-xs text-muted-foreground">Manage custom skills that provide specialized context to the AI.</p>
                    </div>
                    <Button onClick={() => setIsAddingSkill(!isAddingSkill)} variant="outline" size="sm">
                      {isAddingSkill ? "Cancel" : "Add Skill"}
                    </Button>
                  </div>

                  {isAddingSkill && (
                    <div className="space-y-3 rounded-xl border border-border p-4 bg-muted/10 animate-in fade-in slide-in-from-top-2">
                      <Input 
                        placeholder="Skill Name (e.g. Next.js Expert)" 
                        value={newSkillName} 
                        onChange={(e) => setNewSkillName(e.target.value)} 
                        className="bg-background"
                      />
                      <Textarea 
                        placeholder="Paste SKILL.md content here..." 
                        value={newSkillContent} 
                        onChange={(e) => setNewSkillContent(e.target.value)} 
                        className="min-h-[200px] font-mono text-xs bg-background" 
                      />
                      <Button 
                        disabled={!newSkillName.trim() || !newSkillContent.trim()}
                        onClick={() => { 
                          settings.addSkill({name: newSkillName.trim(), content: newSkillContent.trim()}); 
                          setNewSkillName("");
                          setNewSkillContent("");
                          setIsAddingSkill(false); 
                        }}
                      >
                        Save Skill
                      </Button>
                    </div>
                  )}

                  <div className="space-y-3">
                    {settings.skills.length === 0 && !isAddingSkill && (
                      <div className="py-10 text-center rounded-xl border border-dashed border-border bg-muted/10">
                        <p className="text-sm text-muted-foreground">No skills added yet.</p>
                      </div>
                    )}
                    {settings.skills.map(skill => (
                      <div key={skill.id} className="group relative rounded-xl border border-border bg-card p-4 hover:border-primary/30 transition-colors shadow-sm">
                        <h5 className="font-medium text-sm text-foreground">{skill.name}</h5>
                        <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{skill.content}</p>
                        <button
                          className="absolute right-3 top-3 hidden rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive group-hover:block transition-colors"
                          onClick={() => settings.deleteSkill(skill.id)}
                          title="Delete skill"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>
        </div>
        </div>
        
      </DialogContent>
    </Dialog>
  );
}
