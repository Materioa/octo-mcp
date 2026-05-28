import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Settings, ProviderId, Skill } from "@/types";
import { getPreset } from "@/lib/providers/presets";

interface SettingsStore extends Settings {
  mcpEnvironment: "production" | "development";
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

const defaultSettings: Settings & { mcpEnvironment: "production" | "development" } = {
  aiProvider: {
    providerId: "openrouter-free",
    baseUrl: "https://openrouter.ai/api/v1",
    apiKey: "",
    model: "openai/gpt-oss-120b:free",
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
        set((s) => ({ aiProvider: { ...s.aiProvider, ...config } })),
      switchProvider: (providerId) => {
        const preset = getPreset(providerId);
        set((s) => ({
          aiProvider: {
            providerId,
            baseUrl: preset.baseUrl,
            apiKey: s.aiProvider.providerId === providerId ? s.aiProvider.apiKey : "",
            model: preset.defaultModel,
          },
        }));
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
