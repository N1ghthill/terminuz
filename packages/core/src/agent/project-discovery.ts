import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { execFileAsync } from "../tools/process.js";
import type { PathSecurity } from "../security/path-security.js";
import type { PermissionGateway } from "../security/permission-gateway.js";

export interface ProjectDiscoveryResult {
  /** Formatted numbered list, or empty string when nothing was found. */
  formatted: string;
  /** Absolute paths of discovered projects, in the same order as the list. */
  paths: string[];
}

interface ProjectMatch {
  path: string;
  markers: string[];
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

export class ProjectDiscovery {
  async discover(
    worktree: string,
    inputPath: string,
    pathSecurity: PathSecurity,
    permissions: PermissionGateway,
  ): Promise<ProjectDiscoveryResult> {
    if (!(await isGitAvailable(worktree))) {
      return { formatted: "Git nao esta instalado. Quer que eu instale?", paths: [] };
    }

    const scanInput = inputPath === "." ? (process.env.HOME ?? inputPath) : inputPath;
    const rootPath = await pathSecurity.normalize(scanInput, { enforceAccess: false });
    await permissions.ensure({ operation: "list_projects", kind: "read", path: rootPath });

    const results: ProjectMatch[] = [];
    await walk(rootPath, 3, results, new Set<string>());
    if (results.length === 0) {
      return { formatted: "", paths: [] };
    }

    const sorted = results.sort((a, b) => a.path.localeCompare(b.path));
    const lines = sorted.map((match, i) => `${i + 1}. ${path.basename(match.path)}`);
    return {
      formatted: lines.join("\n") + "\n\nDigite o número para selecionar:",
      paths: sorted.map((m) => m.path),
    };
  }
}

async function walk(
  directory: string,
  depthRemaining: number,
  results: ProjectMatch[],
  seen: Set<string>,
): Promise<void> {
  if (seen.has(directory) || results.length >= 200) return;
  seen.add(directory);

  const entries = await readdir(directory, { withFileTypes: true });
  const markerSet = new Set(entries.filter((e) => e.name === PROJECT_MARKER).map((e) => e.name));
  if (markerSet.size > 0) {
    results.push({ path: directory, markers: Array.from(markerSet).sort() });
  }
  if (depthRemaining <= 0) return;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    if (SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
    const fullPath = path.join(directory, entry.name);
    try {
      const info = await lstat(fullPath);
      if (info.isSymbolicLink()) continue;
      await walk(fullPath, depthRemaining - 1, results, seen);
    } catch {
      continue;
    }
  }
}

async function isGitAvailable(cwd: string): Promise<boolean> {
  try {
    const result = await execFileAsync("git", ["--version"], { cwd, timeoutMs: 5_000 });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}
