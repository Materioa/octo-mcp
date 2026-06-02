import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Settings, ProviderId, Skill } from "@/types";
import { getPreset } from "@/lib/providers/presets";

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
    }),
    {
      name: "mcp-chat-settings",
    }
  )
);
