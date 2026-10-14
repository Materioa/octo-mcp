import { useState, useEffect } from "react";
import { useSettingsStore } from "@/stores/settings";
import { getPreset, getAvailableModels } from "@/lib/providers/presets";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface ModelSelectorProps {
  value?: string;
  onChange?: (model: string) => void;
  providerId?: string;
  models?: string[];
  placement?: "top" | "bottom" | "auto";
}

export function ModelSelector({ value, onChange, providerId, models, placement = "auto" }: ModelSelectorProps) {
  const settings = useSettingsStore();
  
  const currentProviderId = providerId ?? settings.aiProvider.providerId ?? "openrouter-free";
  const preset = getPreset(currentProviderId);
  const currentModel = value ?? settings.aiProvider.model;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (currentProviderId === 'gemini' && !models) {
      const fetchGeminiModels = async () => {
        const key = settings.apiKeys['gemini'] || settings.aiProvider.apiKey;
        if (!key) return;
        try {
          const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
          if (!response.ok) {
            console.warn("Failed to fetch Gemini models:", response.status, response.statusText);
            return;
          }
          const data = await response.json();
          if (data.models) {
            const geminiFetched = data.models.filter((m: any) => m.name.includes("models/gemini") || m.name.includes("models/learnlm")).map((m: any) => m.name.replace("models/", ""));
            settings.setFetchedModels(currentProviderId, geminiFetched);
          }
        } catch (error) {
          console.error("Failed to fetch Gemini models:", error);
        }
      };
      fetchGeminiModels();
    } else if (currentProviderId === 'chatgpt' && !models) {
      const fetchChatgptModels = async () => {
        try {
          const apiBase = import.meta.env.VITE_API_URL
            || (import.meta.env.DEV ? "" : "https://mcp.getmaterio.app");
          const response = await fetch(`${apiBase}/backend-api/chatgpt/models`, {
            credentials: "include"
          });
          if (response.ok) {
            const data = await response.json();
            if (data.models && Array.isArray(data.models)) {
              settings.setFetchedModels(currentProviderId, data.models);
            }
          }
        } catch (error) {
          console.error("Failed to fetch ChatGPT models:", error);
        }
      };
      fetchChatgptModels();
    } else if (currentProviderId !== 'openrouter-free' && !models) {
      const fetchModels = async () => {
        const key = settings.apiKeys[currentProviderId] || settings.aiProvider.apiKey;
        const baseUrl = preset.baseUrl || settings.aiProvider.baseUrl;
        if (!key || !baseUrl) return;
        try {
          const apiBase = import.meta.env.VITE_API_URL
            || (import.meta.env.DEV ? "" : "https://mcp.getmaterio.app");
          const proxyUrl = `${apiBase}/backend-api/chat/models`;

          const response = await fetch(proxyUrl, {
            headers: {
              "X-Target-Url": baseUrl,
              Authorization: `Bearer ${key}`
            }
          });
          if (response.ok) {
            const data = await response.json();
            if (data.data && Array.isArray(data.data)) {
              const modelIds = data.data.map((m: any) => m.id);
              settings.setFetchedModels(currentProviderId, modelIds);
            }
          }
        } catch (error) {
          console.error(`Failed to fetch models for ${currentProviderId}:`, error);
        }
      };
      fetchModels();
    }
  }, [currentProviderId, models, settings.apiKeys, settings.aiProvider.apiKey, preset.baseUrl, settings.aiProvider.baseUrl]);

  const modelDisplay = (() => {
    const m = currentModel;
    const short = m.includes("/") ? m.split("/").pop()! : m;
    return short
      .replace(/-instruct$/i, "")
      .replace(/-20\d{6}$/, "")
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
  })();

  const currentModelDisplay = (() => {
    const m = currentModel;
    const customModel = settings.customNvidiaModels?.find((cm: any) => cm.slug === m);
    if (customModel) return customModel.label;
    if (m === "openai/gpt-oss-120b:free") return "GPT OSS";
    if (m === "google/gemma-4-31b-it:free") return "Gemma 4";
    if (m === "meta-llama/llama-3.3-70b-instruct:free") return "Llama 3.3";
    if (m === "z-ai/glm-4.5-air:free") return "GLM 4.5 Air";
    if (m === "deepseek/deepseek-v4-flash:free") return "DeepSeek v4";
    if (m === "minimax/minimax-m2.5:free") return "MiniMax M2.5";
    if (m === "nvidia/nemotron-3-nano-30b-a3b:free" || m === "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free") return "Nemotron 3 Nano";
    if (m === "moonshotai/kimi-k2.6:free") return "Kimi K2.6";
    if (m === "qwen/qwen3-coder:free") return "Qwen 3 Coder";
    if (m === "qwen/qwen-2.5-coder-32b-instruct:free") return "Qwen 2.5 Coder";
    if (m === "openrouter/free") return "Best";
    return modelDisplay;
  })();

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[13px] font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground select-none"
        >
          {currentModelDisplay}
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><path d="m6 9 6 6 6-6" /></svg>
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent 
        side={placement === "auto" ? undefined : placement} 
        align="start" 
        className="w-56 max-h-60 overflow-y-auto z-[110] bg-popover text-popover-foreground shadow-md p-1"
      >
        {(() => {
          const baseModels = models ?? getAvailableModels(currentProviderId, settings);

          if (baseModels.length === 0) {
            return (
              <div className="px-3 py-4 text-center text-xs text-muted-foreground select-none">
                No free models available.
              </div>
            );
          }

          const modelsToDisplay = [currentModel, ...baseModels.filter(m => m !== currentModel)];
          return modelsToDisplay.filter(m => m !== "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free").filter((v, i, a) => a.indexOf(v) === i).map((m) => {
            let label = m;
            const customModel = settings.customNvidiaModels?.find((cm: any) => cm.slug === m);
            if (customModel) {
              label = customModel.label;
            } else if (m === "openai/gpt-oss-120b:free") label = "GPT OSS";
            else if (m === "google/gemma-4-31b-it:free") label = "Gemma 4";
            else if (m === "meta-llama/llama-3.3-70b-instruct:free") label = "Llama 3.3";
            else if (m === "z-ai/glm-4.5-air:free") label = "GLM 4.5 Air";
            else if (m === "deepseek/deepseek-v4-flash:free") label = "DeepSeek v4";
            else if (m === "minimax/minimax-m2.5:free") label = "MiniMax M2.5";
            else if (m === "nvidia/nemotron-3-nano-30b-a3b:free") label = "Nemotron 3 Nano";
            else if (m === "moonshotai/kimi-k2.6:free") label = "Kimi k2.6";
            else if (m === "qwen/qwen3-coder:free") label = "Qwen 3 Coder";
            else if (m === "qwen/qwen-2.5-coder-32b-instruct:free") label = "Qwen 2.5 Coder";
            else if (m === "openrouter/free") label = "Best";
            else {
              const short = m.includes("/") ? m.split("/").pop()! : m;
              label = short
                .replace(/-instruct$/i, "")
                .replace(/-20\d{6}$/, "")
                .split("-")
                .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                .join(" ");
            }

            let isSelected = currentModel === m;
            if (m === "nvidia/nemotron-3-nano-30b-a3b:free" && currentModel === "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free") {
              isSelected = true;
            }

            return (
              <div key={m} className="flex flex-col mb-1 last:mb-0">
                <DropdownMenuItem
                  onSelect={(e) => {
                    if (m === "nvidia/nemotron-3-nano-30b-a3b:free" && isSelected) {
                      e.preventDefault(); // keep open if clicking parent of reasoning
                    } else {
                      if (onChange) onChange(m);
                      else settings.setAIProvider({ ...settings.aiProvider, model: m });
                    }
                  }}
                  className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-sm font-medium cursor-pointer ${isSelected ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}
                >
                  <span>{label}</span>
                  {isSelected && (
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-foreground"><path d="M20 6 9 17l-5-5" /></svg>
                  )}
                </DropdownMenuItem>
                
                {m === "nvidia/nemotron-3-nano-30b-a3b:free" && isSelected && (
                    <div className="flex items-center justify-between px-3 py-1.5 mx-2 mt-1 mb-1 rounded bg-secondary/30">
                      <span className="text-[11px] text-muted-foreground font-medium">Reasoning Mode</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          const isReasoning = currentModel === "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
                          const nextModel = isReasoning ? "nvidia/nemotron-3-nano-30b-a3b:free" : "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free";
                          if (onChange) {
                            onChange(nextModel);
                          } else {
                            settings.setAIProvider({
                              ...settings.aiProvider,
                              model: nextModel
                            });
                          }
                        }}
                        className={`relative inline-flex h-3.5 w-6 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                          currentModel === "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" ? 'bg-brand' : 'bg-muted-foreground/30'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            currentModel === "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free" ? 'translate-x-2.5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </div>
                  )}
              </div>
            );
          });
        })()}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
