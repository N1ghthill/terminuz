import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { getProjectDataPath, type TerminuzConfig } from "@terminuz/shared";
import { collectSecretValues, redactSecrets } from "../security/secret-redactor.js";

export interface CacheLookup<T> {
  hit: boolean;
  value?: T;
}

interface CacheEntry<T> {
  key: string;
  value: T;
  createdAt: number;
  expiresAt: number;
}

export class ToolCache {
  constructor(
    private readonly worktree: string,
    private readonly config: TerminuzConfig,
  ) {}

  async get<T>(namespace: string, keyParts: unknown[]): Promise<CacheLookup<T>> {
    if (!this.config.cache.enabled) return { hit: false };
    const key = cacheKey(namespace, keyParts);
    const filePath = this.filePath(key);
    try {
      const entry = JSON.parse(await readFile(filePath, "utf8")) as CacheEntry<T>;
      if (entry.key !== key || entry.expiresAt < Date.now()) {
        await rm(filePath, { force: true });
        return { hit: false };
      }
      return { hit: true, value: entry.value };
    } catch {
      return { hit: false };
    }
  }

  async set<T>(namespace: string, keyParts: unknown[], value: T): Promise<void> {
    if (!this.config.cache.enabled) return;
    const key = cacheKey(namespace, keyParts);
    const dir = getProjectDataPath(this.worktree, "cache");
    await mkdir(dir, { recursive: true });
    const now = Date.now();
    const entry: CacheEntry<T> = {
      key,
      value: redactSecrets(value, {
        secretValues: collectSecretValues(this.config),
      }) as T,
      createdAt: now,
      expiresAt: now + this.config.cache.ttlSeconds * 1000,
    };
    await writeFile(this.filePath(key), `${JSON.stringify(entry)}\n`, "utf8");
  }

  async clear(): Promise<void> {
    await rm(getProjectDataPath(this.worktree, "cache"), { recursive: true, force: true });
  }

  private filePath(key: string): string {
    return getProjectDataPath(this.worktree, "cache", `${key}.json`);
  }
}

export function cacheKey(namespace: string, keyParts: unknown[]): string {
  return createHash("sha256")
    .update(JSON.stringify([namespace, ...keyParts]))
    .digest("hex");
}
