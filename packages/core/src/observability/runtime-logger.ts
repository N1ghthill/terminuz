import { appendFile, mkdir, readFile, rename, rm, stat } from "node:fs/promises";
import path from "node:path";
import { nowIso } from "@deepcode/shared";
import { redactSecrets } from "../security/secret-redactor.js";

const DEFAULT_MAX_FIELD_LENGTH = 2_000;
const DEFAULT_MAX_LOG_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_ROTATED_FILES = 3;

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

export interface RuntimeLoggerOptions {
  maxBytes?: number;
  maxFiles?: number;
}

export class RuntimeLogger {
  readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();
  private readonly maxBytes: number;
  private readonly maxFiles: number;

  constructor(
    private readonly worktree: string,
    private readonly secretValues: string[] = [],
    options: RuntimeLoggerOptions = {},
  ) {
    this.filePath = path.join(this.worktree, ".deepcode", "runtime.log");
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_LOG_BYTES;
    this.maxFiles = options.maxFiles ?? DEFAULT_MAX_ROTATED_FILES;
  }

  async log(entry: RuntimeLogEntry): Promise<void> {
    const operation = this.writeQueue.then(() => this.writeEntry(entry));
    this.writeQueue = operation.catch(() => undefined);
    await operation;
  }

  private async writeEntry(entry: RuntimeLogEntry): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    await this.rotateIfNeeded();
    const payload = redactSecrets(
      truncateDeep({ ...entry, createdAt: entry.createdAt ?? nowIso() }),
      {
        secretValues: this.secretValues,
      },
    );
    await appendFile(this.filePath, `${JSON.stringify(payload)}\n`, "utf8");
  }

  private async rotateIfNeeded(): Promise<void> {
    if (this.maxBytes <= 0) return;

    let sizeBytes = 0;
    try {
      sizeBytes = (await stat(this.filePath)).size;
    } catch {
      return;
    }

    if (sizeBytes < this.maxBytes) return;

    if (this.maxFiles <= 0) {
      await rm(this.filePath, { force: true });
      return;
    }

    for (let index = this.maxFiles; index >= 1; index -= 1) {
      const source = index === 1 ? this.filePath : `${this.filePath}.${index - 1}`;
      const target = `${this.filePath}.${index}`;
      if (index === this.maxFiles) {
        await rm(target, { force: true });
      }
      try {
        await rename(source, target);
      } catch {
        // Missing rotated files are expected while the log is still young.
      }
    }
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
