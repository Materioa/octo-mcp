import { useState } from "react";
import type { ToolCall } from "@/types";
import { cn } from "@/lib/utils";

interface ToolCallGroupProps {
  toolCalls: ToolCall[];
}

export function ToolCallGroup({ toolCalls }: ToolCallGroupProps) {
  const [open, setOpen] = useState(false);

  if (!toolCalls || toolCalls.length === 0) return null;

  const isMultiple = toolCalls.length > 1;
  const isRunning = toolCalls.some(tc => tc.status === "running");

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border bg-card shadow-sm">
      <button
        className={cn(
          "flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors hover:bg-accent/50",
          isRunning && "animate-pulse bg-accent/20"
        )}
        onClick={() => setOpen(!open)}
      >
        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
          </svg>
        </div>
        
        <div className="flex-1 font-medium text-foreground">
          {isMultiple ? (
            <span>{toolCalls.length} tools executed</span>
          ) : (
            <span>{toolCalls[0]?.name || "Unknown Tool"}</span>
          )}
        </div>

        {isRunning && (
          <span className="text-xs text-muted-foreground animate-pulse mr-2">
            Executing...
          </span>
        )}

        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn(
            "shrink-0 text-muted-foreground transition-transform duration-200",
            open && "rotate-180"
          )}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      {open && (
        <div className="border-t border-border bg-muted/20">
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
