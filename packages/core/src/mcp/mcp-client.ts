import { spawn, type ChildProcess } from "node:child_process";
import { createInterface } from "node:readline";

// Keys from process.env that are safe to forward to child MCP processes.
// API keys and credentials are intentionally excluded to prevent exfiltration
// by a malicious or compromised MCP server.
const SAFE_ENV_KEYS = new Set([
  "HOME", "PATH", "LANG", "LANGUAGE", "LC_ALL", "LC_CTYPE",
  "TERM", "TERM_PROGRAM", "COLORTERM",
  "TMPDIR", "TMP", "TEMP",
  "USER", "USERNAME", "LOGNAME",
  "SHELL", "PWD",
  "XDG_RUNTIME_DIR", "XDG_CONFIG_HOME", "XDG_DATA_HOME",
  "NODE_ENV",
]);
const SECRET_KEY_RE = /(api[_-]?key|token|authorization|secret|password|passwd|credential|private[_-]?key)/i;

function buildSafeEnv(extra?: Record<string, string>): Record<string, string> {
  const base: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined && SAFE_ENV_KEYS.has(key) && !SECRET_KEY_RE.test(key)) {
      base[key] = value;
    }
  }
  return { ...base, ...(extra ?? {}) };
}

export interface McpTool {
  name: string;
  description?: string;
  inputSchema: { type: "object"; properties?: Record<string, unknown>; required?: string[] };
}

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: number;
  method: string;
  params?: unknown;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: { code: number; message: string };
}

export type McpSpawn = typeof spawn;

export class McpClient {
  private readonly process: ChildProcess;
  private readonly ready: Promise<void>;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();

  constructor(command: string, args: string[], env?: Record<string, string>, spawnProcess: McpSpawn = spawn) {
    this.process = spawnProcess(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: buildSafeEnv(env),
    });
    this.ready = new Promise((resolve, reject) => {
      this.process.once("spawn", () => resolve());
      this.process.once("error", reject);
    });
    let exitCode: number | null = null;

    const rejectAll = (error: Error) => {
      for (const { reject } of this.pending.values()) reject(error);
      this.pending.clear();
    };
    this.process.on("error", (err) => rejectAll(err));
    this.process.on("exit", (code) => {
      exitCode = code ?? null;
    });

    const rl = createInterface({ input: this.process.stdout!, terminal: false });
    rl.on("line", (line) => {
      if (!line.trim()) return;
      try {
        const msg = JSON.parse(line) as JsonRpcResponse;
        if (msg.id === undefined) return; // notification
        const pending = this.pending.get(msg.id);
        if (!pending) return;
        this.pending.delete(msg.id);
        if (msg.error) {
          pending.reject(new Error(`MCP error ${msg.error.code}: ${msg.error.message}`));
        } else {
          pending.resolve(msg.result);
        }
      } catch {
        // ignore malformed lines
      }
    });
    rl.on("close", () => {
      if (this.pending.size > 0) {
        rejectAll(new Error(`MCP server exited unexpectedly (code ${exitCode ?? this.process.exitCode ?? "null"})`));
      }
    });
  }

  async initialize(): Promise<void> {
    await this.ready;
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      clientInfo: { name: "deepcode", version: "1.0.0" },
    });
    this.notify("notifications/initialized");
  }

  async listTools(): Promise<McpTool[]> {
    const result = (await this.request("tools/list")) as { tools?: McpTool[] };
    return result.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<string> {
    const result = (await this.request("tools/call", { name, arguments: args })) as {
      content: Array<{ type: string; text?: string }>;
      isError?: boolean;
    };
    const text = result.content.map((c) => c.text ?? "").join("");
    if (result.isError) {
      throw new Error(`MCP tool error: ${text}`);
    }
    return text;
  }

  stop(): void {
    this.process.kill();
    for (const { reject } of this.pending.values()) {
      reject(new Error("MCP client stopped"));
    }
    this.pending.clear();
  }

  private async request(method: string, params?: unknown): Promise<unknown> {
    await this.ready;
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      const msg: JsonRpcRequest = { jsonrpc: "2.0", id, method, params };
      this.process.stdin!.write(JSON.stringify(msg) + "\n");
    });
  }

  private notify(method: string, params?: unknown): void {
    const msg: JsonRpcRequest = { jsonrpc: "2.0", method, params };
    this.process.stdin!.write(JSON.stringify(msg) + "\n");
  }
}
