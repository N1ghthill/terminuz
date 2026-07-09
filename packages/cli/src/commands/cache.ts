import { readdir, rm } from "node:fs/promises";
import path from "node:path";
import { getProjectDataPath } from "@terminuz/shared";
import { createRuntime } from "../runtime.js";

import { writeStdoutLine } from "../stream-flush.js";

export async function cacheClearCommand(options: { cwd: string; config?: string }): Promise<void> {
  const runtime = await createRuntime({
    cwd: options.cwd,
    configPath: options.config,
    interactive: false,
  });
  await runtime.cache.clear();
  await writeStdoutLine("Terminuz cache cleared.");
}

export async function cacheTmpClearCommand(options: { cwd: string }): Promise<void> {
  const tmpDir = getProjectDataPath(options.cwd, "tmp");
  let count = 0;
  try {
    const entries = await readdir(tmpDir);
    await Promise.all(
      entries
        .filter((entry) => entry.endsWith(".output"))
        .map(async (entry) => {
          count += 1;
          await rm(path.join(tmpDir, entry), { force: true });
        }),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  await writeStdoutLine(
    `Terminuz temporary tool outputs cleared (${count} file${count === 1 ? "" : "s"}).`,
  );
}
