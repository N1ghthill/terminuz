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
    const updateCacheDir = path.join(tempDir, "update-cache", "deepcode-ai");
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
    expect(allOutput).toContain("npm uninstall -g deepcode-ai");
  });

  it("also removes .deepcode/ project dir when --project is passed", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-uninstall-"));
    const dotDeepcode = path.join(tempDir, ".deepcode");
    await mkdir(dotDeepcode, { recursive: true });
    await writeFile(path.join(dotDeepcode, "config.json"), "{}");

    process.env["DEEPCODE_SESSION_DIR"] = path.join(tempDir, "sessions");
    process.env["XDG_CACHE_HOME"] = path.join(tempDir, "cache");

    try {
      await uninstallCommand({ cwd: tempDir, project: true });
    } finally {
      delete process.env["DEEPCODE_SESSION_DIR"];
      delete process.env["XDG_CACHE_HOME"];
    }

    await expect(stat(dotDeepcode)).rejects.toThrow();
  });

  it("does not remove .deepcode/ by default", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-uninstall-"));
    const dotDeepcode = path.join(tempDir, ".deepcode");
    await mkdir(dotDeepcode, { recursive: true });
    await writeFile(path.join(dotDeepcode, "config.json"), "{}");

    process.env["DEEPCODE_SESSION_DIR"] = path.join(tempDir, "sessions");
    process.env["XDG_CACHE_HOME"] = path.join(tempDir, "cache");

    try {
      await uninstallCommand({ cwd: tempDir });
    } finally {
      delete process.env["DEEPCODE_SESSION_DIR"];
      delete process.env["XDG_CACHE_HOME"];
    }

    // .deepcode/ must still exist
    const info = await stat(dotDeepcode);
    expect(info.isDirectory()).toBe(true);

    // Should print hint about --project flag
    const allOutput = writeStdoutLine.mock.calls.flat().join("\n");
    expect(allOutput).toContain("--project");
  });
});
