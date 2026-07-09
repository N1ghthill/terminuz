import { mkdir, mkdtemp, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";

const { writeStdoutLine } = vi.hoisted(() => ({
  writeStdoutLine: vi.fn(),
}));

vi.mock("../src/stream-flush.js", () => ({ writeStdoutLine }));

import { uninstallCommand } from "../src/commands/uninstall.js";

let tempDir: string | undefined;

afterEach(async () => {
  vi.clearAllMocks();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("uninstallCommand", () => {
  it("removes session dir and update cache dir", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-uninstall-"));
    const sessionDir = path.join(tempDir, "sessions");
    const updateCacheDir = path.join(tempDir, "update-cache", "terminuz");
    await mkdir(path.join(sessionDir, "deepcode", "sessions"), { recursive: true });
    await writeFile(path.join(sessionDir, "deepcode", "sessions", "s1.json"), "{}");
    await mkdir(updateCacheDir, { recursive: true });
    await writeFile(path.join(updateCacheDir, "update.json"), "{}");

    process.env["DEEPCODE_SESSION_DIR"] = path.join(sessionDir, "deepcode");
    process.env["XDG_CACHE_HOME"] = path.join(tempDir, "update-cache");

    try {
      await uninstallCommand({ cwd: tempDir });
    } finally {
      delete process.env["DEEPCODE_SESSION_DIR"];
      delete process.env["XDG_CACHE_HOME"];
    }

    // Both directories should be gone
    await expect(stat(path.join(sessionDir, "deepcode"))).rejects.toThrow();
    await expect(stat(updateCacheDir)).rejects.toThrow();

    // Should print npm uninstall hint
    const allOutput = writeStdoutLine.mock.calls.flat().join("\n");
    expect(allOutput).toContain("npm uninstall -g terminuz");
  });

  it("also removes .terminuz/ project dir when --project is passed", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-uninstall-"));
    const dotTerminuz = path.join(tempDir, ".terminuz");
    await mkdir(dotTerminuz, { recursive: true });
    await writeFile(path.join(dotTerminuz, "config.json"), "{}");

    process.env["DEEPCODE_SESSION_DIR"] = path.join(tempDir, "sessions");
    process.env["XDG_CACHE_HOME"] = path.join(tempDir, "cache");

    try {
      await uninstallCommand({ cwd: tempDir, project: true });
    } finally {
      delete process.env["DEEPCODE_SESSION_DIR"];
      delete process.env["XDG_CACHE_HOME"];
    }

    await expect(stat(dotTerminuz)).rejects.toThrow();
  });

  it("does not remove .terminuz/ by default", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-uninstall-"));
    const dotTerminuz = path.join(tempDir, ".terminuz");
    await mkdir(dotTerminuz, { recursive: true });
    await writeFile(path.join(dotTerminuz, "config.json"), "{}");

    process.env["DEEPCODE_SESSION_DIR"] = path.join(tempDir, "sessions");
    process.env["XDG_CACHE_HOME"] = path.join(tempDir, "cache");

    try {
      await uninstallCommand({ cwd: tempDir });
    } finally {
      delete process.env["DEEPCODE_SESSION_DIR"];
      delete process.env["XDG_CACHE_HOME"];
    }

    // .terminuz/ must still exist
    const info = await stat(dotTerminuz);
    expect(info.isDirectory()).toBe(true);

    // Should print hint about --project flag
    const allOutput = writeStdoutLine.mock.calls.flat().join("\n");
    expect(allOutput).toContain("--project");
  });
});
