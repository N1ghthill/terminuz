import { render } from "ink";
import { readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import React from "react";
import { getUserDataDir } from "@deepcode/shared";
import { SessionsApp } from "../tui/sessions/SessionsApp.js";

export async function sessionsCommand(options: { cwd: string }): Promise<void> {
  const storageDir = process.env.DEEPCODE_SESSION_DIR ?? getUserDataDir("deepcode");
  // Render TUI on stderr so stdout stays clean: deepcode chat --resume "$(deepcode sessions)"
  const { waitUntilExit } = render(
    React.createElement(SessionsApp, { cwd: options.cwd, storageDir }),
    { stdout: process.stderr, stderr: process.stderr },
  );
  await waitUntilExit();
}

export async function sessionsClearCommand(options: {
  cwd: string;
  all?: boolean;
  olderThanDays?: number;
}): Promise<void> {
  const storageBase = process.env.DEEPCODE_SESSION_DIR ?? path.join(options.cwd, ".deepcode");
  const dir = path.join(storageBase, "sessions");
  let entries: string[];
  try {
    entries = (await readdir(dir)).filter((f) => f.endsWith(".json"));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      process.stdout.write("No sessions directory found.\n");
      return;
    }
    throw error;
  }

  const cutoffMs = options.all
    ? Infinity
    : (options.olderThanDays ?? 30) * 24 * 60 * 60 * 1000;

  const now = Date.now();
  let deleted = 0;

  for (const entry of entries) {
    const filePath = path.join(dir, entry);
    let shouldDelete: boolean;
    if (options.all) {
      shouldDelete = true;
    } else {
      const info = await stat(filePath).catch(() => null);
      const ageMs = info ? now - info.mtimeMs : Infinity;
      shouldDelete = ageMs >= cutoffMs;
    }
    if (shouldDelete) {
      await rm(filePath, { force: true });
      deleted += 1;
    }
  }

  const label = options.all
    ? "all"
    : `older than ${options.olderThanDays ?? 30} days`;
  process.stdout.write(`Deleted ${deleted} session${deleted !== 1 ? "s" : ""} (${label}).\n`);
}
