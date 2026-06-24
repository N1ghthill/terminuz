import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { nowIso } from "@deepcode/shared";
import { redactSecrets } from "../security/secret-redactor.js";

const DEFAULT_MAX_FIELD_LENGTH = 2_000;

export interface RuntimeLogEntry {
  event: string;
  createdAt?: string;
  sessionId?: string;
  turnId?: string;
  iteration?: number;
  toolCallId?: string;
  taskId?: string;
  parentSessionId?: string;
  details?: Record<string, unknown>;
}

export interface RuntimeLogStats {
  path: string;
  exists: boolean;
  sizeBytes: number;
}

export class RuntimeLogger {
  readonly filePath: string;

  constructor(
    private readonly worktree: string,
    private readonly secretValues: string[] = [],
  ) {
    this.filePath = path.join(this.worktree, ".deepcode", "runtime.log");
  }

  async log(entry: RuntimeLogEntry): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const payload = redactSecrets(
      truncateDeep({ ...entry, createdAt: entry.createdAt ?? nowIso() }),
      {
        secretValues: this.secretValues,
      },
    );
    await appendFile(this.filePath, `${JSON.stringify(payload)}\n`, "utf8");
  }

  async safeLog(entry: RuntimeLogEntry): Promise<void> {
    try {
      await this.log(entry);
    } catch {
      // Observability must never break agent execution.
    }
  }

  async readRecent(limit = 50): Promise<string[]> {
    try {
      const content = await readFile(this.filePath, "utf8");
      return content.trimEnd().split("\n").filter(Boolean).slice(-Math.max(1, limit));
    } catch {
      return [];
    }
  }

  async stats(): Promise<RuntimeLogStats> {
    try {
      const info = await stat(this.filePath);
      return { path: this.filePath, exists: true, sizeBytes: info.size };
    } catch {
      return { path: this.filePath, exists: false, sizeBytes: 0 };
    }
  }
}

function truncateDeep(value: unknown): unknown {
  if (typeof value === "string") {
    return value.length > DEFAULT_MAX_FIELD_LENGTH
      ? `${value.slice(0, DEFAULT_MAX_FIELD_LENGTH)}...`
      : value;
  }
  if (Array.isArray(value)) {
    return value.map(truncateDeep);
  }
  if (value && typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      next[key] = truncateDeep(item);
    }
    return next;
  }
  return value;
}
