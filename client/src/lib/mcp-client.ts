import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import type { MCPTool, CustomConnector } from "@/types";

const isLocal = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
const defaultApiUrl = isLocal ? "http://localhost:3001" : "https://mcp.getmaterio.app";
const API_URL = import.meta.env.VITE_API_URL || defaultApiUrl;

export interface ConnectOptions {
  mainServerUrl: string;
  customConnectors: CustomConnector[];
}

class MCPClientManager {
  private clients: Map<string, Client> = new Map();
  private connecting: Promise<void> | null = null;
  // Map of toolName -> serverId for routing
  private toolRouting: Map<string, string> = new Map();

  async connectAll(options: ConnectOptions): Promise<void> {
    if (this.connecting) return this.connecting;

    this.connecting = (async () => {
      try {
        this.disconnect();
        this.toolRouting.clear();

        const connectPromises: Promise<void>[] = [];

        // Connect Main Server
        const connectMain = async () => {
          try {
            const client = new Client(
              { name: "mcp-chat-client", version: "1.0.0" },
              { capabilities: {} }
            );
            const transport = new StreamableHTTPClientTransport(
              new URL(options.mainServerUrl, window.location.origin),
              { requestInit: { headers: { "X-Materio-Client": "true", "Accept": "application/json, text/event-stream" } } }
            );
            await client.connect(transport);
            this.clients.set("main", client);
            // Pre-fetch tools to populate routing
            const toolsRes = await client.listTools();
            for (const t of toolsRes.tools ?? []) {
              this.toolRouting.set(t.name, "main");
            }
          } catch (err) {
            console.error("Failed to connect to main MCP server:", err);
          }
        };
        connectPromises.push(connectMain());

        // Connect Custom Connectors
        for (const connector of options.customConnectors) {
          const connectCustom = async () => {
            try {
              const headers: Record<string, string> = {
                "Accept": "application/json, text/event-stream"
              };
              if (connector.authType === "api_key" && connector.apiKey) {
                headers["Authorization"] = `Bearer ${connector.apiKey}`;
              } else if (connector.authType === "oauth" && connector.oauthToken) {
                headers["Authorization"] = `Bearer ${connector.oauthToken}`;
              }



              const client = new Client(
                { name: "mcp-chat-client", version: "1.0.0" },
                { capabilities: {} }
              );
              const proxyUrl = new URL("/backend-api/mcp-proxy", API_URL);
              proxyUrl.searchParams.set("target", connector.url);
              
              const isSse = connector.url.toLowerCase().includes("/sse") || connector.url.toLowerCase().includes("transport=sse");
              const transport = isSse
                ? new SSEClientTransport(
                    proxyUrl,
                    {
                      requestInit: { headers }
                    }
                  )
                : new StreamableHTTPClientTransport(
                    proxyUrl,
                    { requestInit: { headers } }
                  );
              await client.connect(transport);
              this.clients.set(connector.id, client);

              // Pre-fetch tools
              const toolsRes = await client.listTools();
              for (const t of toolsRes.tools ?? []) {
                // Main server takes precedence if collision occurs
                if (!this.toolRouting.has(t.name)) {
                  this.toolRouting.set(t.name, connector.id);
                }
              }
            } catch (err) {
              console.error(`Failed to connect to custom MCP server ${connector.name}:`, err);
            }
          };
          connectPromises.push(connectCustom());
        }

        await Promise.allSettled(connectPromises);
      } finally {
        this.connecting = null;
      }
    })();

    return this.connecting;
  }

  disconnect(): void {
    for (const [_, client] of this.clients.entries()) {
      try {
        client.close();
      } catch {}
    }
    this.clients.clear();
    this.toolRouting.clear();
  }

  isConnected(): boolean {
    return this.clients.size > 0;
  }

  getToolServerId(name: string): string | undefined {
    return this.toolRouting.get(name);
  }

  async listTools(): Promise<MCPTool[]> {
    if (this.clients.size === 0) throw new Error("Not connected to any MCP server");
    
    const allTools: MCPTool[] = [];
    const seenNames = new Set<string>();

    for (const [id, client] of this.clients.entries()) {
      try {
        const result = await client.listTools();
        for (const t of result.tools ?? []) {
          if (!seenNames.has(t.name)) {
            seenNames.add(t.name);
            this.toolRouting.set(t.name, id);
            allTools.push({
              name: t.name,
              description: t.description ?? "",
              inputSchema: (t.inputSchema ?? {}) as Record<string, unknown>,
              serverId: id,
            });
          }
        }
      } catch (err) {
        console.error(`Error listing tools for client ${id}:`, err);
      }
    }
    return allTools;
  }

  async listPrompts(): Promise<any[]> {
    const allPrompts: any[] = [];
    for (const [id, client] of this.clients.entries()) {
      try {
        const result = await client.listPrompts();
        for (const p of result.prompts ?? []) {
          allPrompts.push({
            name: p.name,
            description: p.description ?? "",
            arguments: p.arguments ?? [],
            serverId: id,
          });
        }
      } catch (err) {
        // ignore if not supported
      }
    }
    return allPrompts;
  }

  async getPrompt(name: string, args?: Record<string, string>): Promise<any> {
    for (const [id, client] of this.clients.entries()) {
      try {
        const promptsRes = await client.listPrompts();
        if (promptsRes.prompts?.some((p: any) => p.name === name)) {
          return await client.getPrompt({ name, arguments: args });
        }
      } catch {}
    }
    throw new Error(`Prompt ${name} not found on any connected server`);
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    if (this.clients.size === 0) throw new Error("Not connected to any MCP server");
    
    const targetId = this.toolRouting.get(name);
    if (!targetId) throw new Error(`Tool ${name} not found on any connected server`);

    const client = this.clients.get(targetId);
    if (!client) throw new Error(`Server ${targetId} for tool ${name} is disconnected`);

    const result = await client.callTool({ name, arguments: args });
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
    const allResources: any[] = [];
    for (const [id, client] of this.clients.entries()) {
      try {
        const result = await client.listResources();
        allResources.push(...(result.resources ?? []));
      } catch (err) {
        console.error(`Error listing resources for client ${id}:`, err);
      }
    }
    return allResources;
  }

  async readResource(uri: string): Promise<string> {
    // We try sequentially
    for (const [_, client] of this.clients.entries()) {
      try {
        const result = await client.readResource({ uri });
        if (result.contents && result.contents.length > 0) {
          return result.contents.map((c: any) => c.text ?? "").join("\n");
        }
      } catch (err) {
        // Ignore and try next client
      }
    }
    throw new Error(`Resource ${uri} could not be read from any connected server`);
  }
}

export const mcpClient = new MCPClientManager();
