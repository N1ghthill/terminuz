import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getUserDataDir } from "@deepcode/shared";
import { writeStdoutLine } from "../stream-flush.js";

export interface UninstallOptions {
  cwd: string;
  /** Also remove .deepcode/ project config and cache in the current directory. */
  project?: boolean;
}

export async function uninstallCommand(options: UninstallOptions): Promise<void> {
  const removed: string[] = [];
  const failed: string[] = [];

  async function tryRemove(target: string, label: string): Promise<void> {
    try {
      await rm(target, { recursive: true, force: true });
      removed.push(label);
    } catch {
      failed.push(label);
    }
  }

  // 1. Session history (~/.local/share/deepcode/)
  const sessionDir = process.env["DEEPCODE_SESSION_DIR"] ?? getUserDataDir("deepcode");
  await tryRemove(sessionDir, `sessions  (${sessionDir})`);

  // 2. Update checker cache (~/.cache/deepcode-ai/)
  const cacheHome = process.env["XDG_CACHE_HOME"] ?? path.join(os.homedir(), ".cache");
  const updateCacheDir = path.join(cacheHome, "deepcode-ai");
  await tryRemove(updateCacheDir, `update cache  (${updateCacheDir})`);

  // 3. Project-local .deepcode/ (opt-in)
  if (options.project) {
    const projectDir = path.join(options.cwd, ".deepcode");
    await tryRemove(projectDir, `.deepcode/  (${projectDir})`);
  }

  writeStdoutLine("");
  writeStdoutLine("DeepCode - data cleanup");
  writeStdoutLine("-".repeat(40));

  if (removed.length > 0) {
    writeStdoutLine("");
    writeStdoutLine("Removed:");
    for (const item of removed) {
      writeStdoutLine(`  ✓ ${item}`);
    }
  }

  if (failed.length > 0) {
    writeStdoutLine("");
    writeStdoutLine("Failed (missing permission or already removed):");
    for (const item of failed) {
      writeStdoutLine(`  ✗ ${item}`);
    }
  }

  writeStdoutLine("");
  writeStdoutLine("To remove the binary:");
  writeStdoutLine("  npm uninstall -g deepcode-ai");
  if (!options.project) {
    writeStdoutLine("");
    writeStdoutLine("To also remove project config (.deepcode/):");
    writeStdoutLine("  deepcode uninstall --project");
  }
  writeStdoutLine("");
}
