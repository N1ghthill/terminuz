import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export interface LanguageServerConfig {
  languages: string[];
  command: string;
  args: string[];
  fileExtensions: string[];
}

export interface WorkspaceSymbol {
  name: string;
  kind: number;
  containerName?: string;
  file: string;
  line: number;
  column: number;
}

interface PendingRequest {
  resolve(value: unknown): void;
  reject(error: Error): void;
}

export class LspClient {
  private process: ChildProcessWithoutNullStreams | null = null;
  private nextId = 1;
  private buffer = Buffer.alloc(0);
  private readonly pending = new Map<number, PendingRequest>();

  constructor(
    private readonly server: LanguageServerConfig,
    private readonly rootPath: string,
  ) {}

  async start(): Promise<void> {
    this.process = spawn(this.server.command, this.server.args, {
      cwd: this.rootPath,
      stdio: "pipe",
      env: process.env,
    });
    this.process.stdout.on("data", (chunk: Buffer) => this.consume(chunk));
    this.process.stderr.on("data", () => undefined);
    this.process.on("error", (error) => this.rejectAll(error));
    this.process.on("exit", (code) => {
      this.rejectAll(new Error(`Language server exited with code ${code ?? "unknown"}`));
    });

    await this.request("initialize", {
      processId: process.pid,
      rootUri: toFileUri(this.rootPath),
      workspaceFolders: [{ uri: toFileUri(this.rootPath), name: path.basename(this.rootPath) }],
      capabilities: {
        workspace: {
          symbol: {
            symbolKind: { valueSet: Array.from({ length: 26 }, (_, index) => index + 1) },
          },
        },
      },
    });
    this.notify("initialized", {});
  }

  async searchSymbols(query: string): Promise<WorkspaceSymbol[]> {
    const result = await this.request("workspace/symbol", { query });
    if (!Array.isArray(result)) return [];
    return result.flatMap((symbol: any) => {
      const uri = symbol.location?.uri ?? symbol.location?.targetUri;
      const range = symbol.location?.range ?? symbol.location?.targetSelectionRange;
      if (typeof uri !== "string" || !range?.start) return [];
      return [
        {
          name: String(symbol.name ?? ""),
          kind: Number(symbol.kind ?? 0),
          containerName: symbol.containerName,
          file: fromFileUri(uri),
          line: Number(range.start.line ?? 0) + 1,
          column: Number(range.start.character ?? 0) + 1,
        },
      ];
    });
  }

  async stop(): Promise<void> {
    if (!this.process) return;
    try {
      await this.request("shutdown", null);
      this.notify("exit", null);
    } finally {
      this.process.kill();
      this.process = null;
    }
  }

  private request(method: string, params: unknown): Promise<unknown> {
    const id = this.nextId++;
    this.send({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.delete(id)) {
          reject(new Error(`LSP request timed out: ${method}`));
        }
      }, 15_000).unref();
    });
  }

  private notify(method: string, params: unknown): void {
    this.send({ jsonrpc: "2.0", method, params });
  }

  private send(payload: unknown): void {
    if (!this.process) throw new Error("Language server is not running");
    const body = Buffer.from(JSON.stringify(payload), "utf8");
    const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "ascii");
    this.process.stdin.write(Buffer.concat([header, body]));
  }

  private consume(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (true) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = this.buffer.slice(0, headerEnd).toString("ascii");
      const lengthMatch = header.match(/Content-Length:\s*(\d+)/i);
      if (!lengthMatch) {
        this.buffer = this.buffer.slice(headerEnd + 4);
        continue;
      }
      const length = Number(lengthMatch[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + length;
      if (this.buffer.length < bodyEnd) return;
      const raw = this.buffer.slice(bodyStart, bodyEnd).toString("utf8");
      this.buffer = this.buffer.slice(bodyEnd);
      this.handleMessage(
        JSON.parse(raw) as { id?: number; result?: unknown; error?: { message?: string } },
      );
    }
  }

  private handleMessage(message: {
    id?: number;
    result?: unknown;
    error?: { message?: string };
  }): void {
    if (typeof message.id !== "number") return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(message.error.message ?? "LSP request failed"));
      return;
    }
    pending.resolve(message.result);
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
  }
}

export function pickLanguageServer(
  servers: LanguageServerConfig[],
  rootPath: string,
  queryPath: string,
): LanguageServerConfig | undefined {
  const extension = path.extname(queryPath);
  const byExtension = servers.find((server) => server.fileExtensions.includes(extension));
  if (byExtension) return byExtension;
  const projectFiles: Array<[string, string]> = [
    ["package.json", "typescript"],
    ["tsconfig.json", "typescript"],
    ["pyproject.toml", "python"],
    ["Cargo.toml", "rust"],
    ["go.mod", "go"],
  ];
  const detected = projectFiles.find(([file]) => pathExists(path.join(rootPath, file)))?.[1];
  return detected ? servers.find((server) => server.languages.includes(detected)) : servers[0];
}

function pathExists(filePath: string): boolean {
  return existsSync(filePath);
}

function toFileUri(filePath: string): string {
  return `file://${path.resolve(filePath).replaceAll(path.sep, "/")}`;
}

function fromFileUri(uri: string): string {
  return decodeURIComponent(uri.replace(/^file:\/\//, ""));
}
