/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { execFile } from "node:child_process";
import * as nodeFs from "node:fs";
import { access, lstat, open, readFile, stat } from "node:fs/promises";
import * as path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitDiffStats {
  filesCount: number;
  linesAdded: number;
  linesRemoved: number;
}

export interface PerFileStats {
  added: number;
  removed: number;
  isBinary: boolean;
  isUntracked?: boolean;
  isDeleted?: boolean;
  truncated?: boolean;
}

export interface GitDiffResult {
  stats: GitDiffStats;
  perFileStats: Map<string, PerFileStats>;
}

const GIT_TIMEOUT_MS = 5000;
const MAX_FILES = 50;
const MAX_FILES_FOR_DETAILS = 500;
const MAX_DIFF_SIZE_BYTES = 1_000_000;
const UNTRACKED_READ_CAP_BYTES = MAX_DIFF_SIZE_BYTES;
const UNTRACKED_READ_CHUNK_BYTES = 64 * 1024;
const BINARY_SNIFF_BYTES = 8 * 1024;

const EMPTY_STATS: GitDiffStats = {
  filesCount: 0,
  linesAdded: 0,
  linesRemoved: 0,
};

let untrackedOpenFlagsCache: number | undefined;
function getUntrackedOpenFlags(): number {
  if (untrackedOpenFlagsCache === undefined) {
    untrackedOpenFlagsCache =
      (nodeFs.constants?.O_RDONLY ?? 0) | (nodeFs.constants?.O_NOFOLLOW ?? 0);
  }
  return untrackedOpenFlagsCache;
}

export async function fetchGitDiff(cwd: string): Promise<GitDiffResult | null> {
  const gitRoot = await resolveGitRoot(cwd);
  if (!gitRoot) return null;
  if (await isInTransientGitState(gitRoot)) return null;

  const [shortstatOut, untrackedOut] = await Promise.all([
    runGit(
      ["--no-optional-locks", "diff", "--no-ext-diff", "--no-textconv", "HEAD", "--shortstat"],
      gitRoot,
    ),
    runGit(["--no-optional-locks", "ls-files", "-z", "--others", "--exclude-standard"], gitRoot),
  ]);

  const untrackedCount = countNulDelimited(untrackedOut);
  const quickStats = (shortstatOut != null && parseShortstat(shortstatOut)) || EMPTY_STATS;

  if (quickStats.filesCount + untrackedCount > MAX_FILES_FOR_DETAILS) {
    return {
      stats: {
        ...quickStats,
        filesCount: quickStats.filesCount + untrackedCount,
      },
      perFileStats: new Map(),
    };
  }

  const [numstatOut, nameStatusOut] = await Promise.all([
    runGit(
      ["--no-optional-locks", "diff", "--no-ext-diff", "--no-textconv", "HEAD", "--numstat", "-z"],
      gitRoot,
    ),
    runGit(
      [
        "--no-optional-locks",
        "diff",
        "--no-ext-diff",
        "--no-textconv",
        "HEAD",
        "--name-status",
        "-z",
      ],
      gitRoot,
    ),
  ]);

  if (numstatOut == null) return null;
  const { stats, perFileStats } = parseGitNumstat(numstatOut);

  const deletedPaths = nameStatusOut != null ? parseDeletedFromNameStatus(nameStatusOut) : null;
  if (deletedPaths && deletedPaths.size > 0) {
    for (const [filename, entry] of perFileStats) {
      if (deletedPaths.has(filename)) entry.isDeleted = true;
    }
  }

  if (untrackedCount > 0) {
    stats.filesCount += untrackedCount;

    const untrackedPaths = splitNulDelimited(untrackedOut);
    const lineStats = await mapWithConcurrency(untrackedPaths, MAX_FILES, (relPath) =>
      countUntrackedLines(path.join(gitRoot, relPath)),
    );

    for (const lineStat of lineStats) {
      stats.linesAdded += lineStat.added;
    }

    const remainingSlots = Math.max(0, MAX_FILES - perFileStats.size);
    const visibleCount = Math.min(remainingSlots, untrackedPaths.length);

    for (let i = 0; i < visibleCount; i += 1) {
      const relPath = untrackedPaths[i] ?? "";
      const lineStat = lineStats[i] ?? {
        added: 0,
        isBinary: false,
        truncated: false,
      };
      perFileStats.set(relPath, {
        added: lineStat.added,
        removed: 0,
        isBinary: lineStat.isBinary,
        isUntracked: true,
        truncated: lineStat.truncated,
      });
    }
  }

  return { stats, perFileStats };
}

export function parseGitNumstat(stdout: string): GitDiffResult {
  const tokens = stdout.split("\0");
  if (tokens.length > 0 && tokens[tokens.length - 1] === "") tokens.pop();

  let added = 0;
  let removed = 0;
  let filesCount = 0;
  const perFileStats = new Map<string, PerFileStats>();
  let pending: { added: number; removed: number; isBinary: boolean } | null = null;
  let renameOld: string | null = null;

  for (const token of tokens) {
    if (pending) {
      if (renameOld === null) {
        renameOld = token;
        continue;
      }
      commitEntry(`${renameOld} => ${token}`, pending.added, pending.removed, pending.isBinary);
      pending = null;
      renameOld = null;
      continue;
    }

    const firstTab = token.indexOf("\t");
    if (firstTab < 0) continue;
    const secondTab = token.indexOf("\t", firstTab + 1);
    if (secondTab < 0) continue;

    const addStr = token.slice(0, firstTab);
    const remStr = token.slice(firstTab + 1, secondTab);
    const filePath = token.slice(secondTab + 1);

    const isBinary = addStr === "-" || remStr === "-";
    const fileAdded = isBinary ? 0 : parseInt(addStr, 10) || 0;
    const fileRemoved = isBinary ? 0 : parseInt(remStr, 10) || 0;

    if (filePath === "") {
      pending = { added: fileAdded, removed: fileRemoved, isBinary };
      continue;
    }

    commitEntry(filePath, fileAdded, fileRemoved, isBinary);
  }

  function commitEntry(
    filePath: string,
    fileAdded: number,
    fileRemoved: number,
    isBinary: boolean,
  ): void {
    filesCount += 1;
    added += fileAdded;
    removed += fileRemoved;

    if (perFileStats.size < MAX_FILES) {
      perFileStats.set(filePath, {
        added: fileAdded,
        removed: fileRemoved,
        isBinary,
      });
    }
  }

  return {
    stats: {
      filesCount,
      linesAdded: added,
      linesRemoved: removed,
    },
    perFileStats,
  };
}

export function parseShortstat(stdout: string): GitDiffStats | null {
  const match = stdout.match(
    /^ ?(\d{1,10}) files? changed(?:, (\d{1,10}) insertions?\(\+\))?(?:, (\d{1,10}) deletions?\(-\))?$/m,
  );
  if (!match) return null;

  return {
    filesCount: parseInt(match[1] ?? "0", 10),
    linesAdded: parseInt(match[2] ?? "0", 10),
    linesRemoved: parseInt(match[3] ?? "0", 10),
  };
}

export function parseDeletedFromNameStatus(stdout: string): Set<string> {
  const tokens = stdout.split("\0");
  if (tokens.length > 0 && tokens[tokens.length - 1] === "") tokens.pop();

  const deleted = new Set<string>();
  let index = 0;

  while (index < tokens.length) {
    const status = tokens[index] ?? "";
    index += 1;
    if (status === "") continue;

    const head = status[0];
    if (head === "R" || head === "C") {
      index += 2;
      continue;
    }

    const filePath = tokens[index] ?? "";
    index += 1;
    if (head === "D" && filePath !== "") {
      deleted.add(filePath);
    }
  }

  return deleted;
}

function countNulDelimited(stdout: string | null): number {
  if (!stdout) return 0;
  let count = 0;
  for (let index = 0; index < stdout.length; index += 1) {
    if (stdout.charCodeAt(index) === 0) count += 1;
  }
  return count;
}

function splitNulDelimited(stdout: string | null): string[] {
  if (!stdout) return [];
  return stdout.split("\0").filter(Boolean);
}

async function resolveGitRoot(cwd: string): Promise<string | null> {
  const output = await runGit(["rev-parse", "--show-toplevel"], cwd);
  const root = output?.trim();
  return root ? root : null;
}

async function resolveGitDir(gitRoot: string): Promise<string | null> {
  const dotGit = path.join(gitRoot, ".git");
  try {
    const fileStat = await stat(dotGit);
    if (fileStat.isDirectory()) return dotGit;
    if (!fileStat.isFile()) return null;
    const content = await readFile(dotGit, "utf8");
    const match = content.match(/^gitdir:\s*(.+?)\s*$/m);
    if (!match || !match[1]) return null;
    const raw = match[1];
    return path.isAbsolute(raw) ? raw : path.resolve(gitRoot, raw);
  } catch {
    return null;
  }
}

async function isInTransientGitState(gitRoot: string): Promise<boolean> {
  const gitDir = await resolveGitDir(gitRoot);
  if (!gitDir) return false;

  const transientPaths = [
    "MERGE_HEAD",
    "CHERRY_PICK_HEAD",
    "REVERT_HEAD",
    "rebase-merge",
    "rebase-apply",
  ];

  const checks = await Promise.all(
    transientPaths.map((entry) =>
      access(path.join(gitDir, entry))
        .then(() => true)
        .catch(() => false),
    ),
  );

  return checks.some(Boolean);
}

interface UntrackedLineStats {
  added: number;
  isBinary: boolean;
  truncated: boolean;
}

async function countUntrackedLines(absolutePath: string): Promise<UntrackedLineStats> {
  let fileStat;
  try {
    fileStat = await lstat(absolutePath);
  } catch {
    return { added: 0, isBinary: true, truncated: false };
  }

  if (!fileStat.isFile()) {
    return { added: 0, isBinary: true, truncated: false };
  }

  let fileHandle;
  try {
    fileHandle = await open(absolutePath, getUntrackedOpenFlags());
  } catch {
    return { added: 0, isBinary: true, truncated: false };
  }

  try {
    const buffer = Buffer.allocUnsafe(UNTRACKED_READ_CHUNK_BYTES);
    let totalRead = 0;
    let lines = 0;
    let lastByte = -1;
    let sniffedBytes = 0;

    while (totalRead < UNTRACKED_READ_CAP_BYTES) {
      const remaining = UNTRACKED_READ_CAP_BYTES - totalRead;
      const toRead = Math.min(buffer.length, remaining);
      const { bytesRead } = await fileHandle.read(buffer, 0, toRead, totalRead);
      if (bytesRead === 0) break;

      if (sniffedBytes < BINARY_SNIFF_BYTES) {
        const sniffEnd = Math.min(bytesRead, BINARY_SNIFF_BYTES - sniffedBytes);
        for (let index = 0; index < sniffEnd; index += 1) {
          if (buffer[index] === 0) {
            return { added: 0, isBinary: true, truncated: false };
          }
        }
        sniffedBytes += sniffEnd;
      }

      for (let index = 0; index < bytesRead; index += 1) {
        if (buffer[index] === 0x0a) lines += 1;
      }

      lastByte = buffer[bytesRead - 1] ?? -1;
      totalRead += bytesRead;
    }

    if (totalRead === 0) {
      return { added: 0, isBinary: false, truncated: false };
    }

    let truncated = false;
    if (totalRead >= UNTRACKED_READ_CAP_BYTES) {
      const { size } = await fileHandle.stat();
      truncated = size > totalRead;
    }

    if (!truncated && lastByte !== 0x0a) {
      lines += 1;
    }

    return { added: lines, isBinary: false, truncated };
  } catch {
    return { added: 0, isBinary: true, truncated: false };
  } finally {
    await fileHandle.close().catch(() => {});
  }
}

async function mapWithConcurrency<T, TResult>(
  items: readonly T[],
  limit: number,
  mapper: (item: T) => Promise<TResult>,
): Promise<TResult[]> {
  if (items.length === 0) return [];

  const effectiveLimit = Math.max(1, limit);
  const results: TResult[] = new Array(items.length);

  for (let start = 0; start < items.length; start += effectiveLimit) {
    const batch = items.slice(start, start + effectiveLimit);
    const mapped = await Promise.all(batch.map((item) => mapper(item)));
    for (let offset = 0; offset < mapped.length; offset += 1) {
      results[start + offset] = mapped[offset] as TResult;
    }
  }

  return results;
}

async function runGit(args: string[], cwd: string): Promise<string | null> {
  const fullArgs = ["-c", "core.quotepath=false", ...args];
  try {
    const { stdout } = await execFileAsync("git", fullArgs, {
      cwd,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      windowsHide: true,
      encoding: "utf8",
    });
    return stdout;
  } catch {
    return null;
  }
}
