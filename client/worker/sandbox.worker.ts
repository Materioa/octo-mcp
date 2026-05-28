// QuickJS-based sandbox worker for safe code execution
// Uses Function constructor for isolated JS execution (no QuickJS native binding needed in browser)

interface SandboxRequest {
  id: string;
  code: string;
  language: "javascript" | "typescript";
}

interface SandboxResponse {
  id: string;
  output: string;
  error?: string;
  returnValue?: string;
}

self.onmessage = (e: MessageEvent<SandboxRequest>) => {
  const { id, code, language } = e.data;
  const outputLines: string[] = [];

  try {
    // Create sandboxed console
    const sandboxConsole = {
      log: (...args: unknown[]) =>
        outputLines.push(
          args
            .map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)))
            .join(" ")
        ),
      error: (...args: unknown[]) =>
        outputLines.push(
          "[error] " +
            args
              .map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)))
              .join(" ")
        ),
      warn: (...args: unknown[]) =>
        outputLines.push(
          "[warn] " +
            args
              .map((a) => (typeof a === "object" ? JSON.stringify(a, null, 2) : String(a)))
              .join(" ")
        ),
      table: (data: unknown) => outputLines.push(JSON.stringify(data, null, 2)),
      clear: () => (outputLines.length = 0),
    };

    // Strip TypeScript type annotations if needed (basic)
    let processedCode = code;
    if (language === "typescript") {
      processedCode = code
        .replace(/:\s*(string|number|boolean|any|void|unknown|never)\b/g, "")
        .replace(/<[^>]+>/g, "")
        .replace(/interface\s+\w+\s*\{[^}]*\}/g, "")
        .replace(/type\s+\w+\s*=\s*[^;]+;/g, "");
    }

    // Execute in isolated scope
    const fn = new Function("console", "setTimeout", "setInterval", "fetch", processedCode);

    const result = fn(
      sandboxConsole,
      (cb: () => void, ms: number) => setTimeout(cb, Math.min(ms, 5000)),
      (cb: () => void, ms: number) => setInterval(cb, Math.min(ms, 5000)),
      fetch.bind(self)
    );

    const response: SandboxResponse = {
      id,
      output: outputLines.join("\n"),
      returnValue: result !== undefined ? String(result) : undefined,
    };

    self.postMessage(response);
  } catch (err: any) {
    const response: SandboxResponse = {
      id,
      output: outputLines.join("\n"),
      error: err.message ?? String(err),
    };
    self.postMessage(response);
  }
};
