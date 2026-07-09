import { rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  getProductEnv,
  getProjectDataDir,
  getUserDataDir,
  PRODUCT_ENV,
  PRODUCT_IDENTITY,
} from "@terminuz/shared";
import { writeStdoutLine } from "../stream-flush.js";

export interface UninstallOptions {
  cwd: string;
  /** Also remove .terminuz/ project data in the current directory. */
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

  // 1. Session history
  const sessionDir =
    getProductEnv(PRODUCT_ENV.sessionDir, PRODUCT_ENV.legacy.sessionDir) ??
    getUserDataDir(PRODUCT_IDENTITY.userDataDirName);
  await tryRemove(sessionDir, `sessions  (${sessionDir})`);

  // 2. Update checker cache
  const cacheHome = process.env["XDG_CACHE_HOME"] ?? path.join(os.homedir(), ".cache");
  const updateCacheDir = path.join(cacheHome, PRODUCT_IDENTITY.updateCacheDirName);
  await tryRemove(updateCacheDir, `update cache  (${updateCacheDir})`);

  // 3. Project-local .terminuz/ (opt-in)
  if (options.project) {
    const projectDir = getProjectDataDir(options.cwd);
    await tryRemove(projectDir, `.terminuz/  (${projectDir})`);
  }

  writeStdoutLine("");
  writeStdoutLine("Terminuz - data cleanup");
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
  writeStdoutLine(`  npm uninstall -g ${PRODUCT_IDENTITY.packageName}`);
  if (!options.project) {
    writeStdoutLine("");
    writeStdoutLine("To also remove project data (.terminuz/):");
    writeStdoutLine("  terminuz uninstall --project");
  }
  writeStdoutLine("");
}
