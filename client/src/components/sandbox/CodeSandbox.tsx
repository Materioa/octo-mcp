import { useState } from "react";
import { executeCode } from "@/lib/sandbox";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface CodeSandboxProps {
  code: string;
  language?: "javascript" | "typescript";
}

export function CodeSandbox({ code, language = "javascript" }: CodeSandboxProps) {
  const [output, setOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  const handleRun = async () => {
    setRunning(true);
    setOutput(null);
    setError(null);
    try {
      const result = await executeCode(code, language);
      if (result.error) {
        setError(result.error);
      } else {
        const parts = [result.output, result.returnValue].filter(Boolean);
        setOutput(parts.join("\n") || "(no output)");
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
          {language}
        </span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 gap-1 text-xs"
          onClick={handleRun}
          disabled={running}
        >
          {running ? (
            <>
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" />
              Running...
            </>
          ) : (
            <>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="12"
                height="12"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Run
            </>
          )}
        </Button>
      </div>
      <pre className="overflow-x-auto bg-background/50 p-3 text-xs">
        <code>{code}</code>
      </pre>
      {(output || error) && (
        <div className="border-t border-border">
          <div className="px-3 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Output
          </div>
          <pre
            className={cn(
              "overflow-x-auto px-3 pb-3 text-xs",
              error ? "text-red-400" : "text-green-400"
            )}
          >
            {error ?? output}
          </pre>
        </div>
      )}
    </div>
  );
}
