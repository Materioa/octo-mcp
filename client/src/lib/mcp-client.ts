import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { MCPTool } from "@/types";

class MCPClientManager {
  private client: Client | null = null;
  private serverUrl: string = "";
  private connecting: Promise<void> | null = null;

  async connect(serverUrl: string): Promise<void> {
    if (this.client && this.serverUrl === serverUrl) return;
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      try {
        this.disconnect();
        this.serverUrl = serverUrl;

        const client = new Client(
          { name: "mcp-chat-client", version: "1.0.0" },
          { capabilities: {} }
        );

        const transport = new StreamableHTTPClientTransport(
          new URL(serverUrl, window.location.origin)
        );

        await client.connect(transport);
        this.client = client;
      } catch (err) {
        this.client = null;
        throw err;
      } finally {
        this.connecting = null;
      }
    })();

    return this.connecting;
  }

  disconnect(): void {
    if (this.client) {
      try {
        this.client.close();
      } catch {}
      this.client = null;
    }
  }

  isConnected(): boolean {
    return this.client !== null;
  }

  async listTools(): Promise<MCPTool[]> {
    if (!this.client) throw new Error("Not connected to MCP server");
    const result = await this.client.listTools();
    return (result.tools ?? []).map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
    }));
  }

  async callTool(
    name: string,
    args: Record<string, unknown>
  ): Promise<string> {
    if (!this.client) throw new Error("Not connected to MCP server");
    const result = await this.client.callTool({ name, arguments: args });
    if (result.content && Array.isArray(result.content)) {
      return result.content
        .map((c: any) => {
          if (c.type === "text") return c.text;
          if (c.type === "image") return `[Image: ${c.mimeType}]`;
          return JSON.stringify(c);
        })
        .join("\n");
    }
    return JSON.stringify(result);
  }

  async listResources(): Promise<any[]> {
    if (!this.client) throw new Error("Not connected to MCP server");
    const result = await this.client.listResources();
    return result.resources ?? [];
  }

  async readResource(uri: string): Promise<string> {
    if (!this.client) throw new Error("Not connected to MCP server");
    const result = await this.client.readResource({ uri });
    return result.contents.map((c: any) => c.text ?? "").join("\n");
  }
}

export const mcpClient = new MCPClientManager();
