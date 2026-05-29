import { z } from "zod";
import vm from "vm";
import PDFDocument from "pdfkit";
// @ts-ignore
import htmlToDocx from "html-to-docx";
import { marked } from "marked";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || "";
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

export const executeJsTool = {
  name: "execute_js",
  description: `Execute arbitrary JavaScript code in a secure Node.js sandbox. 
Use this to run calculations, manipulate data, or test logic.
You have access to:
- pdfkit (class PDFDocument)
- htmlToDocx (function)
- marked (function for markdown)
- Buffer
- uploadBufferToSupabase(buffer, filename, contentType): Promise<string> (returns public URL)

Returns the console output and the result of the final expression. If writing async code, simply return a Promise or await at the top level.

Example PDF Generation:
\`\`\`javascript
const PDFDocument = require('pdfkit');
const doc = new PDFDocument();
const chunks = [];
doc.on('data', chunk => chunks.push(chunk));
const pdfPromise = new Promise(resolve => doc.on('end', resolve));

doc.fontSize(20).text('Hello World', { align: 'center' });
doc.end();

await pdfPromise;
const pdfBuffer = Buffer.concat(chunks);
const url = await uploadBufferToSupabase(pdfBuffer, 'document.pdf', 'application/pdf');
return url;
\`\`\`
`,
  inputSchema: {
    code: z.string().describe("The JavaScript code to execute."),
  },
};

export async function handleExecuteJs(args: { code: string }) {
  const { code } = args;
  
  let logs: string[] = [];
  
  const uploadBufferToSupabase = async (buffer: Buffer, filename: string, contentType: string) => {
    if (!supabase) throw new Error("Supabase is not configured.");
    let res = await supabase.storage.from("artifacts").upload(filename, buffer, { contentType, upsert: true });
    if (res.error && res.error.message.includes("Bucket not found")) {
      await supabase.storage.createBucket("artifacts", { public: true });
      res = await supabase.storage.from("artifacts").upload(filename, buffer, { contentType, upsert: true });
    }
    if (res.error) throw res.error;
    const { data } = supabase.storage.from("artifacts").getPublicUrl(filename);
    return data.publicUrl;
  };

  const sandbox = {
    console: {
      log: (...args: any[]) => logs.push(args.map(a => String(a)).join(" ")),
      error: (...args: any[]) => logs.push("ERROR: " + args.map(a => String(a)).join(" ")),
      warn: (...args: any[]) => logs.push("WARN: " + args.map(a => String(a)).join(" ")),
      info: (...args: any[]) => logs.push("INFO: " + args.map(a => String(a)).join(" ")),
    },
    Math, Date, JSON, Array, Object, String, Number, Boolean, RegExp, Promise,
    Buffer,
    setTimeout: (cb: (...args: any[]) => void, ms: number) => setTimeout(cb, ms),
    pdfkit: PDFDocument,
    htmlToDocx,
    marked,
    uploadBufferToSupabase,
    require: (moduleName: string) => {
      if (moduleName === "pdfkit") return PDFDocument;
      if (moduleName === "html-to-docx") return htmlToDocx;
      if (moduleName === "marked") return marked;
      throw new Error("Module not found or not allowed: " + moduleName);
    }
  };

  try {
    const context = vm.createContext(sandbox);
    // Wrap code in async IIFE to support top-level await and return
    const wrappedCode = `(async () => {\n${code}\n})()`;
    const script = new vm.Script(wrappedCode);
    
    // Execute with a timeout
    let result = script.runInContext(context, { timeout: 15000 });
    
    if (result && typeof result.then === 'function') {
      result = await result;
    }
    
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
