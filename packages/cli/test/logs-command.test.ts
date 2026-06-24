import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RuntimeLogger } from "@deepcode/core";

const { writeStdoutLine } = vi.hoisted(() => ({
  writeStdoutLine: vi.fn(),
}));

vi.mock("../src/stream-flush.js", () => ({
  writeStdoutLine,
}));

import { logsRecentCommand } from "../src/commands/logs.js";

let tempDir: string | undefined;

afterEach(async () => {
  vi.clearAllMocks();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("logsRecentCommand", () => {
  it("prints recent runtime log entries", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-logs-command-"));
    const logger = new RuntimeLogger(tempDir);
    await logger.log({ event: "one" });
    await logger.log({ event: "two" });

    await logsRecentCommand({ cwd: tempDir, lines: 1 });

    expect(writeStdoutLine).toHaveBeenCalledTimes(1);
    expect(writeStdoutLine.mock.calls[0]?.[0]).toContain('"event":"two"');
  });

  it("prints a friendly message when no entries exist", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-logs-command-"));

    await logsRecentCommand({ cwd: tempDir });

    expect(writeStdoutLine.mock.calls).toEqual([["No runtime log entries found."]]);
  });
});
