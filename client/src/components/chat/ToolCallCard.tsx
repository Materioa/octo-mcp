import { useState } from "react";
import type { ToolCall } from "@/types";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/stores/settings";
import { mcpClient } from "@/lib/mcp-client";

interface ToolCallGroupProps {
  toolCalls: ToolCall[];
}

export function ToolCallGroup({ toolCalls }: ToolCallGroupProps) {
  const [open, setOpen] = useState(false);
  const settings = useSettingsStore();

  if (!toolCalls || toolCalls.length === 0) return null;

  const isMultiple = toolCalls.length > 1;
  const isRunning = toolCalls.some(tc => tc.status === "running");

  const firstTool = toolCalls[0];
  const serverId = firstTool ? mcpClient.getToolServerId(firstTool.name) : undefined;
  
  let iconElement = null;
  if (serverId === "main") {
    iconElement = <img src="/app.png" alt="Materio" className="w-3.5 h-3.5 object-contain" />;
  } else if (serverId) {
    const conn = settings.customConnectors?.find(c => c.id === serverId);
    if (conn?.icon) {
      iconElement = <img src={conn.icon} alt={conn.name} className="w-3.5 h-3.5 rounded-sm object-cover" />;
    }
  }

  if (!iconElement) {
    iconElement = (
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn(isRunning && "animate-pulse text-brand")}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
    );
  }

  return (
    <div className="w-full max-w-2xl tool-call-block">
      <button
        className="flex w-fit items-center gap-2 px-1 py-1.5 hover:bg-muted/40 rounded transition-colors text-[13px] font-medium text-muted-foreground/80 mb-2"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-2">
          {iconElement}
        </div>
        
        <div className="flex-1 font-medium">
          {isRunning ? (
            <span className="text-brand animate-pulse">
              Calling {toolCalls.find(tc => tc.status === "running")?.name || "tool"}...
            </span>
          ) : isMultiple ? (
            <span>{toolCalls.length} tools executed</span>
          ) : (
            <span>{toolCalls[0]?.name || "Unknown Tool"} executed</span>
          )}
        </div>

      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn("transition-transform duration-200 opacity-50 ml-1", open ? "rotate-180" : "")}><path d="m6 9 6 6 6-6"/></svg>
      </button>

      {open && (
        <div className="pl-3 border-l-2 border-border/50 max-h-[500px] overflow-y-auto mb-4">
          {toolCalls.map((tc, idx) => (
            <div key={tc.id} className={cn("p-3", idx > 0 && "border-t border-border")}>
              <div className="mb-2 flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary/50" />
                  {tc.name}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5",
                    tc.status === "completed" && "bg-green-500/10 text-green-500",
                    tc.status === "running" && "bg-yellow-500/10 text-yellow-500",
                    tc.status === "pending" && "bg-zinc-500/10 text-zinc-500",
                    tc.status === "error" && "bg-red-500/10 text-red-500"
                  )}
                >
                  {tc.status}
                </span>
              </div>
              <div className="space-y-2">
                <div className="rounded-md bg-background/50 border border-border/50 p-2">
                  <div className="mb-1 text-[10px] uppercase text-muted-foreground">Arguments</div>
                  <pre className="overflow-x-auto text-[11px] text-foreground/80">
                    {JSON.stringify(tc.args, null, 2)}
                  </pre>
                </div>
                {(tc.result || tc.error) && (
                  <div className={cn(
                    "rounded-md border p-2",
                    tc.error ? "border-red-500/20 bg-red-500/5" : "border-border/50 bg-background/50"
                  )}>
                    <div className={cn(
                      "mb-1 text-[10px] uppercase",
                      tc.error ? "text-red-400" : "text-muted-foreground"
                    )}>
                      {tc.error ? "Error" : "Result"}
                    </div>
                    <pre className={cn(
                      "overflow-x-auto text-[11px]",
                      tc.error ? "text-red-400" : "text-foreground/80"
                    )}>
                      {tc.error ?? tc.result}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
