import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Settings, ProviderId, Skill, CustomConnector } from "@/types";
import { getPreset } from "@/lib/providers/presets";

const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
const API_URL = import.meta.env.VITE_API_URL || (isLocal ? "http://localhost:3001" : "https://mcp.getmaterio.app");

interface SettingsStore extends Settings {
  mcpEnvironment: "production" | "development";
  apiKeys: Record<string, string>;
  setMcpEnvironment: (env: "production" | "development") => void;
  setAIProvider: (config: Partial<Settings["aiProvider"]>) => void;
  switchProvider: (providerId: ProviderId) => void;
  setTheme: (theme: "light" | "dark" | "system") => void;
  setPersonality: (personality: Settings["personality"]) => void;
  setCustomInstructions: (instructions: string) => void;
  setExaSearchEnabled: (enabled: boolean) => void;
  addSkill: (skill: Omit<Skill, "id" | "createdAt">) => void;
  updateSkill: (id: string, updates: Partial<Skill>) => void;
  deleteSkill: (id: string) => void;
  addCustomNvidiaModel: (model: { slug: string; label: string }) => void;
  deleteCustomNvidiaModel: (slug: string) => void;
  setShowOnlyFreeModels: (enabled: boolean) => void;
  setFetchedModels: (providerId: string, models: string[]) => void;
  addCustomConnector: (connector: Omit<CustomConnector, "id">) => void;
  updateCustomConnector: (id: string, updates: Partial<CustomConnector>) => void;
  deleteCustomConnector: (id: string) => void;
  syncCustomConnectors: (token: string) => Promise<void>;
}

const defaultSettings: Settings & { mcpEnvironment: "production" | "development", apiKeys: Record<string, string> } = {
  apiKeys: {},
  aiProvider: {
    providerId: "openrouter-free",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "",
    model: "openrouter/free",
  },
  theme: "dark",
  personality: "default",
  mcpEnvironment: "production",
  customInstructions: "",
  exaSearchEnabled: false,
  skills: [],
  customNvidiaModels: [],
  showOnlyFreeModels: false,
  fetchedModels: {},
  customConnectors: [],
};

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      ...defaultSettings,
      setMcpEnvironment: (env) => set({ mcpEnvironment: env }),
      setAIProvider: (config) =>
        set((s) => {
          const newAiProvider = { ...s.aiProvider, ...config };
          const newApiKeys = { ...s.apiKeys };
          if (config.apiKey !== undefined) {
            newApiKeys[newAiProvider.providerId] = config.apiKey;
          }
          return { aiProvider: newAiProvider, apiKeys: newApiKeys };
        }),
      switchProvider: (providerId) => {
        const preset = getPreset(providerId);
        set((s) => {
          const newApiKey = s.apiKeys[providerId] || (s.aiProvider.providerId === providerId ? s.aiProvider.apiKey : "");
          return {
            aiProvider: {
              providerId,
              baseUrl: preset.baseUrl,
              apiKey: newApiKey,
              model: preset.defaultModel,
            },
          };
        });
      },
      setTheme: (theme) => {
        if (theme === "system") {
          const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
          document.documentElement.classList.toggle("dark", isDark);
          document.documentElement.classList.toggle("light", !isDark);
        } else {
          document.documentElement.classList.toggle("dark", theme === "dark");
          document.documentElement.classList.toggle("light", theme === "light");
        }
        set({ theme });
      },
      setPersonality: (personality) => set({ personality }),
      setCustomInstructions: (instructions) => set({ customInstructions: instructions }),
      setExaSearchEnabled: (enabled) => set({ exaSearchEnabled: enabled }),
      addSkill: (skillData) => set((state) => ({
        skills: [...state.skills, { 
          ...skillData, 
          id: crypto.randomUUID(), 
          createdAt: Date.now() 
        }]
      })),
      updateSkill: (id, updates) => set((state) => ({
        skills: state.skills.map((s) => s.id === id ? { ...s, ...updates } : s)
      })),
      deleteSkill: (id) => set((state) => ({
        skills: state.skills.filter((s) => s.id !== id)
      })),
      addCustomNvidiaModel: (model) => set((state) => {
        const filtered = (state.customNvidiaModels || []).filter(m => m.slug !== model.slug);
        return {
          customNvidiaModels: [...filtered, model]
        };
      }),
      deleteCustomNvidiaModel: (slug) => set((state) => ({
        customNvidiaModels: (state.customNvidiaModels || []).filter((m) => m.slug !== slug)
      })),
      setShowOnlyFreeModels: (enabled) => set({ showOnlyFreeModels: enabled }),
      setFetchedModels: (providerId, models) => set((state) => ({
        fetchedModels: {
          ...(state.fetchedModels || {}),
          [providerId]: models
        }
      })),
      addCustomConnector: (connectorData) => {
        const id = crypto.randomUUID();
        const newConnector = {
          ...connectorData,
          id
        };
        set((state) => ({
          customConnectors: [...(state.customConnectors || []), newConnector]
        }));
        
        // Sync to DB in background if user logged in
        import("./auth").then((authModule) => {
          const token = authModule.useAuthStore.getState().token;
          if (token) {
            fetch(`${API_URL}/api/db/custom-connectors`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
              },
              body: JSON.stringify(newConnector)
            })
            .then(res => {
              if (res.status === 401) {
                authModule.useAuthStore.getState().logout();
                authModule.useAuthStore.getState().setLoginOpen(true);
              }
            })
            .catch((err) => console.error("Error adding connector to db:", err));
          }
        });
      },
      updateCustomConnector: (id, updates) => {
        set((state) => {
          const updatedList = (state.customConnectors || []).map((c) => {
            if (c.id === id) {
              const updated = { ...c, ...updates };
              
              // Sync to DB in background if user logged in
              import("./auth").then((authModule) => {
                const token = authModule.useAuthStore.getState().token;
                if (token) {
                  fetch(`${API_URL}/api/db/custom-connectors`, {
                    method: "POST",
                    headers: {
                      "Content-Type": "application/json",
                      "Authorization": `Bearer ${token}`
                    },
                    body: JSON.stringify(updated)
                  })
                  .then(res => {
                    if (res.status === 401) {
                      authModule.useAuthStore.getState().logout();
                      authModule.useAuthStore.getState().setLoginOpen(true);
                    }
                  })
                  .catch((err) => console.error("Error updating connector in db:", err));
                }
              });
              return updated;
            }
            return c;
          });
          return { customConnectors: updatedList };
        });
      },
      deleteCustomConnector: (id) => {
        set((state) => ({
          customConnectors: (state.customConnectors || []).filter((c) => c.id !== id)
        }));
        
        // Sync to DB in background if user logged in
        import("./auth").then((authModule) => {
          const token = authModule.useAuthStore.getState().token;
          if (token) {
            fetch(`${API_URL}/api/db/custom-connectors/${id}`, {
              method: "DELETE",
              headers: {
                "Authorization": `Bearer ${token}`
              }
            })
            .then(res => {
              if (res.status === 401) {
                authModule.useAuthStore.getState().logout();
                authModule.useAuthStore.getState().setLoginOpen(true);
              }
            })
            .catch((err) => console.error("Error deleting connector from db:", err));
          }
        });
      },
      syncCustomConnectors: async (token) => {
        try {
          const res = await fetch(`${API_URL}/api/db/custom-connectors`, {
            headers: {
              "Authorization": `Bearer ${token}`
            }
          });
          if (res.status === 401) {
            const authModule = await import("./auth");
            authModule.useAuthStore.getState().logout();
            authModule.useAuthStore.getState().setLoginOpen(true);
            return;
          }
          if (res.ok) {
            const serverConnectors: CustomConnector[] = await res.json();
            
            set((state) => {
              const localConnectors = state.customConnectors || [];
              const merged = [...serverConnectors];
              
              // If there are local connectors that are not on the server, upload them
              const localOnly = localConnectors.filter(
                (lc) => !serverConnectors.some((sc) => sc.id === lc.id)
              );
              
              if (localOnly.length > 0) {
                localOnly.forEach(async (lc) => {
                  try {
                    const postRes = await fetch(`${API_URL}/api/db/custom-connectors`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${token}`
                      },
                      body: JSON.stringify(lc)
                    });
                    if (postRes.status === 401) {
                      const authModule = await import("./auth");
                      authModule.useAuthStore.getState().logout();
                      authModule.useAuthStore.getState().setLoginOpen(true);
                    }
                  } catch (e) {
                    console.error("Failed to upload local-only connector:", e);
                  }
                });
                
                merged.push(...localOnly);
              }
              
              return { customConnectors: merged };
            });
          }
        } catch (err) {
          console.error("Failed to sync custom connectors:", err);
        }
      },
    }),
    {
      name: "mcp-chat-settings",
    }
  )
);
