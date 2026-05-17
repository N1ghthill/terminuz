import path from "node:path";
import { readdir, lstat } from "node:fs/promises";
import { execFileAsync } from "../tools/process.js";

export interface ProjectInfo {
  path: string;
  branch: string | null;
  isDirty: boolean | null;
}

const PROJECT_MARKER = ".git";

const SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "target",
  "__pycache__",
  "vendor",
]);

export async function discoverGitProjects(
  rootPath: string,
  maxDepth = 3,
): Promise<string[]> {
  const results: string[] = [];
  const seen = new Set<string>();
  await walk(rootPath, maxDepth, results, seen);
  return results.sort((a, b) => a.localeCompare(b));
}

async function walk(
  directory: string,
  depthRemaining: number,
  results: string[],
  seen: Set<string>,
): Promise<void> {
  if (seen.has(directory) || results.length >= 200) return;
  seen.add(directory);

  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }

  if (entries.some((e) => e.name === PROJECT_MARKER)) {
    results.push(directory);
  }

  if (depthRemaining <= 0) return;

  await Promise.all(
    entries
      .filter(
        (e) =>
          e.isDirectory() &&
          !SKIP_DIRS.has(e.name) &&
          !e.name.startsWith("."),
      )
      .map(async (e) => {
        const fullPath = path.join(directory, e.name);
        try {
          const info = await lstat(fullPath);
          if (!info.isSymbolicLink()) {
            await walk(fullPath, depthRemaining - 1, results, seen);
          }
        } catch {
          // skip unreadable entries
        }
      }),
  );
}

async function getGitBranch(projectPath: string): Promise<string | null> {
  try {
    const result = await execFileAsync(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { cwd: projectPath, timeoutMs: 5_000 },
    );
    return result.exitCode === 0 ? result.stdout.trim() : null;
  } catch {
    return null;
  }
}

async function getGitDirty(projectPath: string): Promise<boolean | null> {
  try {
    const result = await execFileAsync(
      "git",
      ["status", "--porcelain"],
      { cwd: projectPath, timeoutMs: 5_000 },
    );
    if (result.exitCode !== 0) return null;
    return result.stdout.trim().length > 0;
  } catch {
    return null;
  }
}

async function enrichOne(projectPath: string): Promise<ProjectInfo> {
  const [branch, isDirty] = await Promise.all([
    getGitBranch(projectPath),
    getGitDirty(projectPath),
  ]);
  return { path: projectPath, branch, isDirty };
}

export async function enrichProjects(
  paths: string[],
  concurrency = 8,
): Promise<ProjectInfo[]> {
  const results: ProjectInfo[] = new Array(paths.length);
  let index = 0;

  async function worker() {
    while (index < paths.length) {
      const i = index++;
      results[i] = await enrichOne(paths[i]!);
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, paths.length) },
    worker,
  );
  await Promise.all(workers);
  return results;
}
