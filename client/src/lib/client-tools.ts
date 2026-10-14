import { useSettingsStore } from "@/stores/settings";
import { useAuthStore } from "@/stores/auth";
import { useChatStore } from "@/stores/chat";
import { executeCode } from "@/lib/sandbox";
import type { EraserDocument } from "@/lib/eraser/types";

export interface ClientToolDefinition {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, any>;
    required?: string[];
  };
}

export const CLIENT_TOOLS: ClientToolDefinition[] = [
  {
    name: "read_current_pdf",
    description: "Read, search, or inspect content from the currently open PDF in the Oread viewer. Use this to read specific pages, search for keywords or sections across the document, read the user's active page, or get an outline of the document without needing any MCP connector.",
    inputSchema: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["read_page", "get_current_page", "search_text", "get_summary"],
          description: "Action to perform: 'read_page' reads a specific page, 'get_current_page' reads the page currently in view, 'search_text' searches for a word/phrase across pages, 'get_summary' gets the title and page listing."
        },
        pageNumber: {
          type: "number",
          description: "The 1-based page number to read (for 'read_page')."
        },
        query: {
          type: "string",
          description: "Search keyword or phrase to search within the document (for 'search_text')."
        }
      },
      required: ["action"]
    }
  },
  {
    name: "ask_user_input_v0",
    description: "Use this tool to ask the user one or more multiple-choice or free-text questions. This will pause execution and render an interactive modal in the chat UI. When the user submits the form, execution will resume and the tool will return the user's answers.",
    inputSchema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          description: "The array of questions to present to the user in the modal.",
          items: {
            type: "object",
            properties: {
              question: { type: "string", description: "The question to ask the user" },
              options: {
                type: "array",
                items: { type: "string" },
                description: "A list of choices for the user to select from. If free-text, this can be empty or generic options."
              },
              is_multi_select: { type: "boolean", description: "Whether the user can select multiple options." }
            },
            required: ["question", "options"]
          }
        }
      },
      required: ["questions"]
    }
  },
  {
    name: "save_to_memory",
    description: "Save important information about the user, their preferences, or the conversation to long-term memory. You MUST use this tool AUTONOMOUSLY whenever you notice any fact, preference, or piece of information about the user (e.g., 'User likes pizza', 'User is on Windows', 'User works at Acme Corp'). Don't wait for the user to ask you to save it. If the user shares a personal preference, a habit, or a detail about themselves, SAVE IT.",
    inputSchema: {
      type: "object",
      properties: {
        content: { type: "string", description: "The content to save to memory." }
      },
      required: ["content"]
    }
  },
  {
    name: "execute_js",
    description: "Execute arbitrary JavaScript code in a secure sandboxed web worker. Use this to run calculations, manipulate data, evaluate formulas, or test logic. Returns the console output and the evaluated result.",
    inputSchema: {
      type: "object",
      properties: {
        code: { type: "string", description: "The JavaScript code to execute." }
      },
      required: ["code"]
    }
  },
  {
    name: "exa_web_search",
    description: "Perform a live web search using Exa AI to find highly relevant, up-to-date web results and citations.",
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string", description: "The search query or statement to search for" },
        useAutoprompt: { type: "boolean", description: "Whether to use Exa's autoprompt feature to enhance the query (recommended true)" }
      },
      required: ["query"]
    }
  },
  {
    name: "skill_builder",
    description: "Save a new skill to the user's Skills library. Use this when the user asks you to create, write, or save a skill for later reuse. The skill will appear in their Settings > Skills panel and can be auto-loaded in future chats.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Skill identifier in kebab-case (e.g. 'react-expert')" },
        description: { type: "string", description: "One-sentence description of what this skill does and when it triggers (used for auto-detection)" },
        content: { type: "string", description: "Full SKILL.md content including YAML frontmatter (---\\nname: ...\\ndescription: ...\\n---\\n# ...)" },
        trigger: { type: "string", enum: ["slash", "auto", "both"], description: "How the skill is activated: slash=manual /command, auto=keyword match, both=either" }
      },
      required: ["name", "content"]
    }
  },
  {
    name: "generate_eraser_diagram",
    description: "Generate, visualize, or edit architecture diagrams, cloud infrastructure, flowcharts, sequence diagrams, and multi-tier systems using the Eraser Diagrams protocol. The output is rendered in an interactive visual canvas where the user can visually edit, drag, recolor, add shapes, and export as PNG or SVG.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "Title of the architecture diagram" },
        description: { type: "string", description: "Brief overview of what this diagram illustrates" },
        entities: {
          type: "array",
          description: "Array of visual shapes, containers, and service nodes",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unique node id (e.g. 'api_gateway', 'db')" },
              tag: { type: "string", enum: ["Shape", "Group", "Icon", "Textbox"], description: "Tag kind" },
              shape: { type: "string", enum: ["rectangle", "diamond", "cylinder", "parallelogram", "hexagon", "circle", "triangle"], description: "Shape geometry" },
              x: { type: "number", description: "X coordinate (0-1000)" },
              y: { type: "number", description: "Y coordinate (0-800)" },
              width: { type: "number", description: "Width in pixels (e.g. 130)" },
              height: { type: "number", description: "Height in pixels (e.g. 60)" },
              color: { type: "string", enum: ["blue", "purple", "green", "red", "yellow", "orange", "black", "white"], description: "Color palette token" },
              icon: { type: "string", description: "Optional icon glyph: server, database, cloud, user, robot, touch, clock, shield, lock, key, code, ai, sparkle" },
              texts: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    text: { type: "string" },
                    fontSize: { type: "number" }
                  }
                }
              },
              containerId: { type: "string", description: "Parent group id if enclosed in a container" },
              isContainer: { type: "boolean", description: "True if this entity is a container/group" },
              title: {
                type: "object",
                properties: {
                  text: { type: "string" },
                  color: { type: "string" }
                }
              }
            },
            required: ["id", "tag", "x", "y"]
          }
        },
        connections: {
          type: "array",
          description: "Array of directed relationship arrows between entities",
          items: {
            type: "object",
            properties: {
              from: { type: "string", description: "Source entity id" },
              to: { type: "string", description: "Target entity id" },
              label: { type: "string", description: "Connection label (e.g. 'Yes', 'SQL', 'HTTPS')" },
              endArrowhead: { type: "string", enum: ["triangle", "arrow", "none"] },
              lineStyle: { type: "string", enum: ["solid", "dashed", "dotted"] },
              color: { type: "string", enum: ["blue", "purple", "green", "red", "yellow", "orange", "black"] }
            },
            required: ["from", "to"]
          }
        }
      },
      required: ["entities", "connections"]
    }
  }
];

export const CLIENT_TOOL_NAMES = new Set(CLIENT_TOOLS.map((t) => t.name));

export function isClientTool(name: string): boolean {
  return CLIENT_TOOL_NAMES.has(name);
}

export interface ClientToolContext {
  isTemporary?: boolean;
  onUpdateEraserDiagram?: (diagram: EraserDocument) => void;
  onResolveUserInput?: (resolveFn: (data: any) => string) => Promise<string>;
}

export async function executeClientTool(
  name: string,
  args: any,
  context?: ClientToolContext
): Promise<string> {
  switch (name) {
    case "ask_user_input_v0": {
      if (context?.onResolveUserInput) {
        return await context.onResolveUserInput((data) => JSON.stringify(data));
      }
      return JSON.stringify({ error: "ask_user_input_v0 handler not configured in client context." });
    }

    case "skill_builder": {
      try {
        const { name: skillName, description, content, trigger } = args;
        if (!skillName || !content) {
          throw new Error("skill_builder requires 'name' and 'content' fields");
        }
        useSettingsStore.getState().addSkill({
          name: String(skillName),
          description: description ? String(description) : undefined,
          content: String(content),
          trigger: (trigger as any) || "both",
        });
        return JSON.stringify({
          success: true,
          message: `Skill "${skillName}" has been saved to your Skills library.`,
        });
      } catch (e: any) {
        return JSON.stringify({ success: false, error: e.message });
      }
    }

    case "generate_eraser_diagram": {
      try {
        const { title, description, entities, connections } = args;
        const docData: EraserDocument = {
          title: title || "Architecture Diagram",
          description: description || "",
          entities: Array.isArray(entities) ? entities : [],
          connections: Array.isArray(connections) ? connections : [],
        };
        if (context?.onUpdateEraserDiagram) {
          context.onUpdateEraserDiagram(docData);
        }
        return JSON.stringify({
          success: true,
          message: `Eraser diagram "${docData.title}" created with ${docData.entities.length} entities and ${docData.connections.length} connections.`,
          diagram: docData,
        });
      } catch (e: any) {
        return JSON.stringify({ success: false, error: e.message });
      }
    }

    case "save_to_memory": {
      if (context?.isTemporary) {
        return JSON.stringify({ result: "Memory saved successfully (Incognito Mode)." });
      }

      const auth = useAuthStore.getState();
      const userId = auth.user?.id || auth.anonymousId || "anonymous";
      const apiKey = (import.meta as any).env?.VITE_SUPERMEMORY_API_KEY;

      if (!apiKey) {
        return JSON.stringify({
          result: "Memory accepted locally (VITE_SUPERMEMORY_API_KEY not configured).",
        });
      }

      try {
        const res = await fetch("https://api.supermemory.ai/v3/memories", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            content: args.content,
            containerTag: `user-${userId}`,
            metadata: {},
          }),
        });

        if (!res.ok) {
          const errText = await res.text();
          return JSON.stringify({ error: `Supermemory API error ${res.status}: ${errText}` });
        }

        return JSON.stringify({ result: "Successfully saved to memory." });
      } catch (err: any) {
        return JSON.stringify({ error: `Error saving memory: ${err.message}` });
      }
    }

    case "execute_js": {
      try {
        const { code } = args;
        if (!code) throw new Error("No code provided to execute_js.");
        const sandboxRes = await executeCode(code, "javascript");

        let output = "";
        if (sandboxRes.output) {
          output += "Console Output:\n" + sandboxRes.output + "\n\n";
        }
        if (sandboxRes.returnValue !== undefined) {
          output += "Result:\n" + sandboxRes.returnValue;
        }
        if (sandboxRes.error) {
          output += (output ? "\n" : "") + "Error: " + sandboxRes.error;
        }
        if (!output.trim()) {
          output = "Execution completed with no output.";
        }

        return output;
      } catch (err: any) {
        return `Error executing JavaScript in sandbox: ${err.message}`;
      }
    }

    case "exa_web_search": {
      const apiKey = (import.meta as any).env?.VITE_EXA_API_KEY;
      if (!apiKey) {
        return "Error: VITE_EXA_API_KEY environment variable is not configured on the client.";
      }

      try {
        const response = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            query: args.query,
            useAutoprompt: args.useAutoprompt ?? true,
            numResults: 5,
            contents: {
              text: { maxCharacters: 1500 },
            },
          }),
        });

        if (!response.ok) {
          throw new Error(`Exa API Error: ${response.status} ${response.statusText}`);
        }

        const data = (await response.json()) as any;
        if (!data.results || data.results.length === 0) {
          return "No relevant web results found.";
        }

        return data.results
          .map(
            (r: any) => `Title: ${r.title}\nURL: ${r.url}\nContent Snippet:\n${r.text}`
          )
          .join("\n\n---\n\n");
      } catch (err: any) {
        return `Web search failed: ${err.message}`;
      }
    }

    case "read_current_pdf": {
      const currentPdf = useChatStore.getState().currentPdf;
      if (!currentPdf) {
        return JSON.stringify({
          error: "No PDF document is currently open in the Oread viewer."
        });
      }

      const { action, pageNumber, query } = args;

      if (action === "get_current_page") {
        const pageNum = currentPdf.currentPage || 1;
        const pageObj = currentPdf.pages?.find((p) => p.pageNumber === pageNum);
        return JSON.stringify({
          title: currentPdf.title,
          currentPage: pageNum,
          totalPages: currentPdf.numPages,
          text: pageObj ? pageObj.text : (currentPdf.text ? currentPdf.text.slice(0, 3000) : "No text extracted for this page.")
        });
      }

      if (action === "read_page") {
        const num = Number(pageNumber) || currentPdf.currentPage || 1;
        const pageObj = currentPdf.pages?.find((p) => p.pageNumber === num);
        if (pageObj) {
          return JSON.stringify({
            title: currentPdf.title,
            pageNumber: num,
            totalPages: currentPdf.numPages,
            text: pageObj.text
          });
        }
        return JSON.stringify({
          title: currentPdf.title,
          pageNumber: num,
          totalPages: currentPdf.numPages,
          text: currentPdf.text ? currentPdf.text.slice(0, 4000) : "No text extracted for this page."
        });
      }

      if (action === "search_text" && query) {
        const q = String(query).toLowerCase();
        const matches: any[] = [];
        if (currentPdf.pages && currentPdf.pages.length > 0) {
          for (const p of currentPdf.pages) {
            if (p.text.toLowerCase().includes(q)) {
              const idx = p.text.toLowerCase().indexOf(q);
              const snippet = p.text.slice(Math.max(0, idx - 100), Math.min(p.text.length, idx + 200));
              matches.push({ pageNumber: p.pageNumber, snippet: snippet.trim() });
              if (matches.length >= 6) break;
            }
          }
        } else if (currentPdf.text && currentPdf.text.toLowerCase().includes(q)) {
          const idx = currentPdf.text.toLowerCase().indexOf(q);
          const snippet = currentPdf.text.slice(Math.max(0, idx - 100), Math.min(currentPdf.text.length, idx + 200));
          matches.push({ snippet: snippet.trim() });
        }

        return JSON.stringify({
          title: currentPdf.title,
          query,
          matchCount: matches.length,
          matches: matches.length > 0 ? matches : "No matches found in the document."
        });
      }

      return JSON.stringify({
        title: currentPdf.title,
        numPages: currentPdf.numPages,
        currentPage: currentPdf.currentPage,
        hasFullText: !!currentPdf.text
      });
    }

    default:
      throw new Error(`Unknown client tool: ${name}`);
  }
}
