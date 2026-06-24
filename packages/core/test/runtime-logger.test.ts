import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { RuntimeLogger } from "../src/observability/runtime-logger.js";

let tempDir: string | undefined;

afterEach(async () => {
  delete process.env.DEEPCODE_RUNTIME_TEST_TOKEN;
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("RuntimeLogger", () => {
  it("writes redacted JSONL entries and reads recent lines", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-runtime-log-"));
    process.env.DEEPCODE_RUNTIME_TEST_TOKEN = "runtime-secret-token";
    const logger = new RuntimeLogger(tempDir, ["config-secret-token"]);

    await logger.log({
      event: "turn.start",
      sessionId: "session_1",
      details: {
        authorization: "Bearer runtime-secret-token",
        nested: { token: "runtime-secret-token", apiKey: "config-secret-token" },
      },
    });
    await logger.log({ event: "turn.end", sessionId: "session_1", details: { ok: true } });

    const raw = await readFile(path.join(tempDir, ".deepcode", "runtime.log"), "utf8");
    expect(raw).toContain('"event":"turn.start"');
    expect(raw).toContain("[redacted]");
    expect(raw).not.toContain("runtime-secret-token");
    expect(raw).not.toContain("config-secret-token");

    const recent = await logger.readRecent(1);
    expect(recent).toHaveLength(1);
    expect(JSON.parse(recent[0]!) as { event: string }).toMatchObject({ event: "turn.end" });
  });

  it("returns empty recent lines and not-created stats before the log exists", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-runtime-log-"));
    const logger = new RuntimeLogger(tempDir);

    await expect(logger.readRecent()).resolves.toEqual([]);
    await expect(logger.stats()).resolves.toMatchObject({
      exists: false,
      sizeBytes: 0,
    });
  });

  it("rotates the runtime log when it reaches the configured size", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-runtime-log-"));
    const logger = new RuntimeLogger(tempDir, [], { maxBytes: 220, maxFiles: 2 });

    for (let index = 0; index < 6; index += 1) {
      await logger.log({
        event: "turn.iteration.start",
        iteration: index,
        details: { payload: "x".repeat(120) },
      });
    }

    await expect(stat(path.join(tempDir, ".deepcode", "runtime.log"))).resolves.toBeDefined();
    await expect(stat(path.join(tempDir, ".deepcode", "runtime.log.1"))).resolves.toBeDefined();

    const recent = await logger.readRecent(5);
    expect(recent.length).toBeGreaterThan(0);
    expect(recent.at(-1)).toContain('"iteration":5');
  });
});
