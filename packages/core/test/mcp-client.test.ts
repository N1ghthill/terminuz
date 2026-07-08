import type { ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { McpClient, type McpSpawn } from "../src/mcp/mcp-client.js";
import { McpManager } from "../src/mcp/mcp-manager.js";
import { adaptMcpTool } from "../src/mcp/mcp-tool-adapter.js";
import { runToolEffect, type ToolContext } from "../src/tools/tool.js";

describe("McpClient", () => {
  it("initializes, lists tools, and calls a tool", async () => {
    const client = new McpClient("node", ["mock-server"], undefined, createMockSpawn());
    try {
      await client.initialize();

      const tools = await client.listTools();
      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe("echo");
      expect(tools[0]?.description).toBe("Echoes the message");

      const result = await client.callTool("echo", { message: "hello" });
      expect(result).toBe("echo: hello");
    } finally {
      client.stop();
    }
  });

  it("rejects when the tool returns isError", async () => {
    const client = new McpClient("node", ["mock-server"], undefined, createMockSpawn({ toolIsError: true }));
    try {
      await client.initialize();
      await expect(client.callTool("echo", { message: "bad" })).rejects.toThrow("MCP tool error");
    } finally {
      client.stop();
    }
  });
});

describe("McpManager", () => {
  it("connects to a server and exposes its tools with a qualified name", async () => {
    const manager = new McpManager(undefined, (server) =>
      new McpClient(server.command, server.args, server.env, createMockSpawn()),
    );
    try {
      const tools = await manager.connect([
        { name: "myserver", command: "node", args: ["mock-server"] },
      ]);

      expect(tools).toHaveLength(1);
      expect(tools[0]?.name).toBe("myserver__echo");
      expect(tools[0]?.description).toBe("Echoes the message");
    } finally {
      manager.stop();
    }
  });

  it("emits app:warn and continues when a server fails to connect", async () => {
    const events = new EventBus();
    const warnings: string[] = [];
    events.on("app:warn", ({ message }) => { warnings.push(message); });

    const manager = new McpManager(events, (server) => {
      if (server.name === "bad") {
        throw new Error("mock connection failure");
      }
      return new McpClient(server.command, server.args, server.env, createMockSpawn());
    });

    const tools = await manager.connect([
      { name: "bad", command: "node", args: ["mock-server"] },
    ]);

    expect(tools).toHaveLength(0);
    expect(warnings.some((message) => message.includes("bad"))).toBe(true);

    manager.stop();
  });
});

describe("adaptMcpTool", () => {
  it("requires dangerous permission before calling the MCP server", async () => {
    const client = new McpClient("node", ["mock-server"], undefined, createMockSpawn());
    try {
      await client.initialize();
      const tool = adaptMcpTool(
        client,
        {
          name: "echo",
          description: "Echoes the message",
          inputSchema: { type: "object", properties: {} },
        },
        "myserver",
      );
      const ensure = vi.fn(async () => undefined);

      const result = await runToolEffect(
        tool.execute({ message: "hello" }, createToolContext({ ensure })),
      );

      expect(result).toBe("echo: hello");
      expect(ensure).toHaveBeenCalledWith(
        expect.objectContaining({
          operation: "mcp myserver echo",
          kind: "mcp",
          details: {
            server: "myserver",
            tool: "echo",
            arguments: { message: "hello" },
          },
        }),
      );
    } finally {
      client.stop();
    }
  });

  it("does not call the MCP server when permission is denied", async () => {
    const client = {
      callTool: vi.fn(async () => "should not run"),
    } as unknown as McpClient;
    const tool = adaptMcpTool(
      client,
      {
        name: "echo",
        description: "Echoes the message",
        inputSchema: { type: "object", properties: {} },
      },
      "myserver",
    );

    await expect(
      runToolEffect(
        tool.execute(
          { message: "hello" },
          createToolContext({
            ensure: vi.fn(async () => {
              throw new Error("Denied");
            }),
          }),
        ),
      ),
    ).rejects.toThrow("Denied");
    expect(client.callTool).not.toHaveBeenCalled();
  });
});

function createToolContext(input: { ensure: (check: unknown) => Promise<void> }): ToolContext {
  return {
    sessionId: "session-test",
    messageId: "msg-test",
    worktree: "/tmp/deepcode-test",
    directory: "/tmp/deepcode-test",
    abortSignal: new AbortController().signal,
    config: {} as ToolContext["config"],
    agentMode: "build",
    cache: {} as ToolContext["cache"],
    permissions: { ensure: input.ensure } as unknown as ToolContext["permissions"],
    pathSecurity: {} as ToolContext["pathSecurity"],
    subagentDepth: 0,
    logActivity: () => undefined,
  };
}

function createMockSpawn(options: { toolIsError?: boolean } = {}): McpSpawn {
  return (() => new FakeMcpProcess(Boolean(options.toolIsError)) as unknown as ChildProcess) as McpSpawn;
}

class FakeMcpProcess extends EventEmitter {
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  exitCode: number | null = null;
  private buffer = "";
  private closed = false;

  constructor(private readonly toolIsError: boolean) {
    super();
    this.stdin.on("data", (chunk) => this.handleChunk(String(chunk)));
    this.stdin.on("end", () => this.shutdown(0));
    Promise.resolve().then(() => this.emit("spawn"));
  }

  kill(): boolean {
    this.stdin.end();
    this.shutdown(0);
    return true;
  }

  private handleChunk(chunk: string): void {
    this.buffer += chunk;
    while (true) {
      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex === -1) break;
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line) continue;
      this.handleMessage(line);
    }
  }

  private handleMessage(line: string): void {
    const message = JSON.parse(line) as {
      id?: number;
      method?: string;
      params?: { name?: string; arguments?: Record<string, unknown> };
    };
    if (message.id === undefined) {
      return;
    }

    if (message.method === "initialize") {
      this.respond(message.id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "mock", version: "1.0.0" },
      });
      return;
    }

    if (message.method === "tools/list") {
      this.respond(message.id, {
        tools: [
          {
            name: "echo",
            description: "Echoes the message",
            inputSchema: {
              type: "object",
              properties: { message: { type: "string" } },
              required: ["message"],
            },
          },
        ],
      });
      return;
    }

    if (message.method === "tools/call" && message.params?.name === "echo") {
      this.respond(message.id, {
        content: [{ type: "text", text: `echo: ${String(message.params.arguments?.message ?? "")}` }],
        isError: this.toolIsError,
      });
      return;
    }

    this.stdout.write(JSON.stringify({
      jsonrpc: "2.0",
      id: message.id,
      error: { code: -32601, message: "Method not found" },
    }) + "\n");
  }

  private respond(id: number, result: unknown): void {
    this.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\n");
  }

  private shutdown(code: number): void {
    if (this.closed) return;
    this.closed = true;
    this.exitCode = code;
    this.stdout.end();
    this.stderr.end();
    this.emit("exit", code);
    this.emit("close", code);
  }
}
