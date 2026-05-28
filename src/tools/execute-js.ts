import { z } from "zod";
import vm from "vm";

export const executeJsTool = {
  name: "execute_js",
  description: `Execute arbitrary JavaScript code in a secure Node.js sandbox. 
Use this to run calculations, manipulate data, or test logic.
Returns the console output and the result of the final expression.`,
  inputSchema: {
    code: z.string().describe("The JavaScript code to execute."),
  },
};

export async function handleExecuteJs(args: { code: string }) {
  const { code } = args;
  
  let logs: string[] = [];
  const sandbox = {
    console: {
      log: (...args: any[]) => logs.push(args.map(a => String(a)).join(" ")),
      error: (...args: any[]) => logs.push("ERROR: " + args.map(a => String(a)).join(" ")),
      warn: (...args: any[]) => logs.push("WARN: " + args.map(a => String(a)).join(" ")),
      info: (...args: any[]) => logs.push("INFO: " + args.map(a => String(a)).join(" ")),
    },
    Math,
    Date,
    JSON,
    Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Promise,
    setTimeout: (cb: (...args: any[]) => void, ms: number) => setTimeout(cb, ms),
  };

  try {
    const context = vm.createContext(sandbox);
    // Add a return of the last statement if it's an expression
    const script = new vm.Script(code);
    
    // Execute with a 5 second timeout to prevent infinite loops
    const result = script.runInContext(context, { timeout: 5000 });
    
    let resultStr = "";
    if (result !== undefined) {
      try {
        resultStr = JSON.stringify(result, null, 2);
      } catch {
        resultStr = String(result);
      }
    }
    
    let output = "";
    if (logs.length > 0) {
      output += "Console Output:\n" + logs.join("\n") + "\n\n";
    }
    if (resultStr) {
      output += "Result:\n" + resultStr;
    }
    
    if (!output) {
      output = "Execution completed with no output.";
    }
    
    return {
      content: [{ type: "text" as const, text: output }],
    };
  } catch (err: any) {
    return {
      content: [
        {
          type: "text" as const,
          text: `Error executing JavaScript:\n${err.message}\n${logs.join("\n")}`,
        },
      ],
      isError: true,
    };
  }
}
