import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const AskUserInputSchema = {
  questions: z.array(
    z.object({
      question: z.string().describe("The question to ask the user"),
      options: z.array(z.string()).describe("A list of choices for the user to select from. If it's a free-text question, this can be empty or have generic options."),
      is_multi_select: z.boolean().default(false).describe("Whether the user can select multiple options.")
    })
  ).describe("The array of questions to present to the user in the modal."),
};

export function registerUserInputTools(server: McpServer) {
  server.registerTool(
    "ask_user_input_v0",
    {
      title: "Ask User Input",
      description: "Use this tool to ask the user one or more multiple-choice or free-text questions. This will pause execution and render an interactive modal in the chat UI. When the user submits the form, execution will resume and the tool will return the user's answers.",
      inputSchema: AskUserInputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (args) => {
      // The frontend client intercepts this tool natively to pause the generator loop.
      // If the backend actually executes this, it means the client failed to intercept it.
      throw new Error("This tool is designed to be intercepted by the chat client. The client did not intercept it, which means it cannot ask the user for input. Please ask the user your questions via plain text in the chat instead.");
    }
  );
}
