import type { McpServerConfig } from "@terminuz/shared";
import type { EventBus } from "../events/event-bus.js";
import type { ToolDefinition } from "../tools/tool.js";
import { McpClient } from "./mcp-client.js";
import { adaptMcpTool } from "./mcp-tool-adapter.js";

export class McpManager {
  private readonly clients: Array<{ name: string; client: McpClient }> = [];

  constructor(
    private readonly events?: EventBus,
    private readonly clientFactory: (server: McpServerConfig) => McpClient = (server) =>
      new McpClient(server.command, server.args, server.env),
  ) {}

  async connect(servers: McpServerConfig[]): Promise<ToolDefinition[]> {
    const tools: ToolDefinition[] = [];
    for (const server of servers) {
      try {
        const client = this.clientFactory(server);
        await client.initialize();
        const mcpTools = await client.listTools();
        this.clients.push({ name: server.name, client });
        for (const tool of mcpTools) {
          tools.push(adaptMcpTool(client, tool, server.name));
        }
      } catch (error) {
        this.events?.emit("app:warn", {
          message: `MCP server "${server.name}" failed to connect: ${error instanceof Error ? error.message : String(error)}`,
        });
      }
    }
    return tools;
  }

  get connectedCount(): number {
    return this.clients.length;
  }

  stop(): void {
    for (const { client } of this.clients) {
      try {
        client.stop();
      } catch {
        // ignore errors during shutdown
      }
    }
    this.clients.length = 0;
  }
}
