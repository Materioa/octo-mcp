interface SandboxResult {
  output: string;
  error?: string;
  returnValue?: string;
}

const worker = new Worker(new URL("../../worker/sandbox.worker.ts", import.meta.url), {
  type: "module",
});

let pendingResolve: ((result: SandboxResult) => void) | null = null;

worker.onmessage = (e) => {
  if (pendingResolve) {
    pendingResolve(e.data as SandboxResult);
    pendingResolve = null;
  }
};

export function executeCode(
  code: string,
  language: "javascript" | "typescript" = "javascript"
): Promise<SandboxResult> {
  return new Promise((resolve) => {
    pendingResolve = resolve;
    worker.postMessage({ id: crypto.randomUUID(), code, language });
  });
}
