/**
 * File-search engine — stand-in for Qwen's `FileSearchFactory`/`FileSearch`.
 *
 * Backs the TUI's `@path` completion. Crawls the project tree (skipping common
 * vendored/build dirs and dot-directories) and fuzzy-matches with `fzf`. Faithful
 * to the API the TUI consumes; lighter than Qwen's gitignore-aware crawler.
 */

import fs from "node:fs";
import path from "node:path";
import { AsyncFzf } from "fzf";

export interface SearchOptions {
  signal?: AbortSignal;
  maxResults?: number;
}

export interface FileSearch {
  initialize(): Promise<void>;
  search(pattern: string, options?: SearchOptions): Promise<string[]>;
}

export interface FileSearchOptions {
  projectRoot: string;
  ignoreDirs?: string[];
  useGitignore?: boolean;
  useQwenignore?: boolean;
  cache?: boolean;
  cacheTtl?: number;
  enableRecursiveFileSearch?: boolean;
  enableFuzzySearch?: boolean;
  maxDepth?: number;
}

const DEFAULT_IGNORE_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".turbo",
  ".next",
  ".cache",
]);

const MAX_FILES = 20000;

class ProjectFileSearch implements FileSearch {
  private files: string[] = [];
  private fzf: AsyncFzf<string[]> | undefined;

  constructor(private readonly options: FileSearchOptions) {}

  async initialize(): Promise<void> {
    const root = this.options.projectRoot;
    const ignore = new Set([...DEFAULT_IGNORE_DIRS, ...(this.options.ignoreDirs ?? [])]);
    const maxDepth =
      this.options.maxDepth ?? (this.options.enableRecursiveFileSearch === false ? 1 : 24);
    const out: string[] = [];

    const walk = (dir: string, rel: string, depth: number): void => {
      if (depth > maxDepth || out.length >= MAX_FILES) return;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        if (out.length >= MAX_FILES) return;
        const relPath = rel ? `${rel}/${entry.name}` : entry.name;
        if (entry.isDirectory()) {
          if (ignore.has(entry.name) || entry.name.startsWith(".")) continue;
          walk(path.join(dir, entry.name), relPath, depth + 1);
        } else if (entry.isFile()) {
          out.push(relPath);
        }
      }
    };

    walk(root, "", 0);
    this.files = out;
    if (this.options.enableFuzzySearch !== false) {
      this.fzf = new AsyncFzf(this.files);
    }
  }

  async search(pattern: string, options?: SearchOptions): Promise<string[]> {
    const max = options?.maxResults ?? 50;
    if (!pattern) return this.files.slice(0, max);
    if (this.fzf) {
      try {
        const results = await this.fzf.find(pattern);
        return results.slice(0, max).map((r) => r.item);
      } catch {
        // AsyncFzf throws on aborted/superseded searches — fall through.
        return [];
      }
    }
    const lower = pattern.toLowerCase();
    return this.files.filter((file) => file.toLowerCase().includes(lower)).slice(0, max);
  }
}

export class FileSearchFactory {
  static create(options: FileSearchOptions): FileSearch {
    return new ProjectFileSearch(options);
  }
}
