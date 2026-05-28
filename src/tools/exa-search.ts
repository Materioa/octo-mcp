import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

export function registerExaSearch(server: McpServer) {
  server.tool(
    "exa_web_search",
    "Perform a live web search using Exa AI to find highly relevant and high-quality results. Restricted to Plus/Super users.",
    {
      query: z.string().describe("The search query or statement to search for"),
      useAutoprompt: z.boolean().optional().describe("Whether to use Exa's autoprompt feature to enhance the query (recommended true)"),
    },
    async ({ query, useAutoprompt }) => {
      const apiKey = process.env.EXA_API_KEY;
      if (!apiKey) {
        return {
          content: [{ type: "text", text: "Error: EXA_API_KEY environment variable is not configured on the server." }],
          isError: true,
        };
      }

      try {
        const response = await fetch("https://api.exa.ai/search", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": apiKey,
          },
          body: JSON.stringify({
            query,
            useAutoprompt: useAutoprompt ?? true,
            numResults: 5,
            contents: {
              text: { maxCharacters: 1500 }
            }
          }),
        });

        if (!response.ok) {
          throw new Error(`Exa API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.results || data.results.length === 0) {
          return {
            content: [{ type: "text", text: "No relevant web results found." }],
          };
        }

        const formattedResults = data.results.map((r: any) => 
          `Title: ${r.title}\nURL: ${r.url}\nContent Snippet:\n${r.text}`
        ).join("\n\n---\n\n");

        return {
          content: [{ type: "text", text: formattedResults }],
        };
      } catch (err: any) {
        return {
          content: [{ type: "text", text: `Web search failed: ${err.message}` }],
          isError: true,
        };
      }
    }
  );
}
