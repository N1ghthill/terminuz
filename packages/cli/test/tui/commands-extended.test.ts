import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CommandContext } from "../../src/tui/ui/commands/types.js";
import { yoloCommand, safeCommand } from "../../src/tui/ui/commands/permissionsCommands.js";
import { newCommand } from "../../src/tui/ui/commands/newCommand.js";
import { historyCommand } from "../../src/tui/ui/commands/historyCommand.js";
import { logsCommand } from "../../src/tui/ui/commands/logsCommand.js";
import { statsCommand } from "../../src/tui/ui/commands/statsCommand.js";
import { memoryCommand } from "../../src/tui/ui/commands/memoryCommand.js";

function makeContext(overrides: Partial<CommandContext["ui"]> = {}): CommandContext {
  return {
    executionMode: "interactive",
    services: { config: null, session: null },
    ui: {
      addItem: vi.fn(),
      clear: vi.fn(),
      setDebugMessage: vi.fn(),
      pendingItem: null,
      setPendingItem: vi.fn(),
      loadHistory: vi.fn(),
      toggleVimEnabled: vi.fn(async () => false),
      reloadCommands: vi.fn(),
      undo: vi.fn(async () => null),
      compact: vi.fn(async () => {}),
      ...overrides,
    },
    session: { sessionShellAllowlist: new Set() },
  };
}

// ── /yolo ──────────────────────────────────────────────────────────────────

describe("yoloCommand", () => {
  it("calls setPermissions with all-allow modes", () => {
    const setPermissions = vi.fn();
    const ctx = makeContext({ setPermissions });
    yoloCommand.action!(ctx, "");
    expect(setPermissions).toHaveBeenCalledOnce();
    const modes = setPermissions.mock.calls[0]![0] as Record<string, string>;
    expect(Object.values(modes).every((v) => v === "allow")).toBe(true);
  });

  it("adds an info item to history", () => {
    const setPermissions = vi.fn();
    const ctx = makeContext({ setPermissions });
    yoloCommand.action!(ctx, "");
    expect(ctx.ui.addItem).toHaveBeenCalledOnce();
    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(item.type).toBe("info");
    expect(item.text).toContain("YOLO");
  });

  it("does not crash when setPermissions is absent", () => {
    const ctx = makeContext(); // no setPermissions
    expect(() => yoloCommand.action!(ctx, "")).not.toThrow();
  });
});

// ── /safe ──────────────────────────────────────────────────────────────────

describe("safeCommand", () => {
  it("calls setPermissions with ask-for-write-and-shell modes", () => {
    const setPermissions = vi.fn();
    const ctx = makeContext({ setPermissions });
    safeCommand.action!(ctx, "");
    expect(setPermissions).toHaveBeenCalledOnce();
    const modes = setPermissions.mock.calls[0]![0] as Record<string, string>;
    expect(modes["write"]).toBe("ask");
    expect(modes["shell"]).toBe("ask");
    expect(modes["read"]).toBe("allow");
  });

  it("adds an info item to history", () => {
    const setPermissions = vi.fn();
    const ctx = makeContext({ setPermissions });
    safeCommand.action!(ctx, "");
    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(item.type).toBe("info");
  });
});

// ── /new ───────────────────────────────────────────────────────────────────

describe("newCommand", () => {
  it("calls newSession when available", async () => {
    const newSession = vi.fn(async () => {});
    const ctx = makeContext({ newSession });
    await newCommand.action!(ctx, "");
    expect(newSession).toHaveBeenCalledOnce();
  });

  it("does not crash when newSession is absent", async () => {
    const ctx = makeContext();
    await expect(newCommand.action!(ctx, "")).resolves.not.toThrow();
  });
});

function msg(role: "user" | "assistant", content: string, i = 0) {
  return { id: `m${i}`, role, content, createdAt: new Date().toISOString() };
}

// ── /history ───────────────────────────────────────────────────────────────

describe("historyCommand", () => {
  it("shows a no-messages summary when session is empty", () => {
    const ctx = makeContext({ getMessages: () => [] });
    historyCommand.action!(ctx, "");
    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(item.type).toBe("info");
    expect(item.text).toContain("No messages");
  });

  it("lists up to 5 user messages by default", () => {
    const messages = Array.from({ length: 7 }, (_, i) => msg("user", `prompt ${i + 1}`, i));
    const ctx = makeContext({ getMessages: () => messages });
    historyCommand.action!(ctx, "");
    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    // Should include prompts 3-7 (last 5)
    expect(item.text).toContain("prompt 7");
    expect(item.text).not.toContain("prompt 1");
  });

  it("respects a numeric arg to override shown count", () => {
    const messages = Array.from({ length: 4 }, (_, i) => msg("user", `msg ${i + 1}`, i));
    const ctx = makeContext({ getMessages: () => messages });
    historyCommand.action!(ctx, "2");
    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(item.text).toContain("msg 4");
    expect(item.text).toContain("msg 3");
    expect(item.text).not.toContain("msg 1");
  });

  it("works without getMessages (falls back to empty array)", () => {
    const ctx = makeContext(); // no getMessages
    expect(() => historyCommand.action!(ctx, "")).not.toThrow();
    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(item.text).toContain("No messages");
  });
});

// ── /stats ─────────────────────────────────────────────────────────────────

describe("statsCommand", () => {
  it("adds a stats history item", () => {
    const startedAt = Date.now() - 65_000; // 65 seconds ago
    const ctx = makeContext({
      getMessages: () => [msg("user", "hello", 0), msg("assistant", "world", 1)],
      getTokenStats: () => ({
        lastPromptTokens: 100,
        lastOutputTokens: 50,
        sessionStartedAt: startedAt,
      }),
    });
    statsCommand.action!(ctx, "");
    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(item.type).toBe("stats");
    expect(item.promptTokens).toBe(100);
    expect(item.outputTokens).toBe(50);
    expect(item.messageCount).toBe(2);
    expect(item.duration).toMatch(/m/); // "1m 5s"
  });

  it("works when getMessages and getTokenStats are absent", () => {
    const ctx = makeContext();
    expect(() => statsCommand.action!(ctx, "")).not.toThrow();
    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(item.type).toBe("stats");
    expect(item.messageCount).toBe(0);
  });
});

// ── /memory ────────────────────────────────────────────────────────────────
// Use a real tmp directory so we don't need to mock ESM built-ins.

function memoryDir(cwd: string): string {
  const slug = cwd.replace(/\//g, "-");
  return path.join(os.homedir(), ".claude", "projects", slug, "memory");
}

describe("memoryCommand", () => {
  let tmpCwd: string;
  let memDir: string;

  beforeEach(() => {
    tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "deepcode-mem-test-"));
    memDir = memoryDir(tmpCwd);
  });

  afterEach(() => {
    fs.rmSync(memDir, { recursive: true, force: true });
  });

  it("shows memory index content when MEMORY.md exists", () => {
    const content = "# Memory Index\n- [Foo](foo.md) — test entry";
    fs.mkdirSync(memDir, { recursive: true });
    fs.writeFileSync(path.join(memDir, "MEMORY.md"), content, "utf8");

    const ctx = makeContext({ getCwd: () => tmpCwd });
    memoryCommand.action!(ctx, "");

    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(item.type).toBe("info");
    expect(item.text).toContain("1 entry");
    expect(item.text).toContain(content);
  });

  it("reports no memory when directory does not exist", () => {
    // memDir not created
    const ctx = makeContext({ getCwd: () => tmpCwd });
    memoryCommand.action!(ctx, "");

    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(item.type).toBe("info");
    expect(item.text).toContain("No memory");
  });

  it("reports missing MEMORY.md when memory dir exists but file does not", () => {
    fs.mkdirSync(memDir, { recursive: true });
    // MEMORY.md intentionally not written

    const ctx = makeContext({ getCwd: () => tmpCwd });
    memoryCommand.action!(ctx, "");

    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(item.text).toContain("MEMORY.md was not found");
  });

  it("reports empty index when MEMORY.md is blank", () => {
    fs.mkdirSync(memDir, { recursive: true });
    fs.writeFileSync(path.join(memDir, "MEMORY.md"), "   ", "utf8");

    const ctx = makeContext({ getCwd: () => tmpCwd });
    memoryCommand.action!(ctx, "");

    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(item.text).toContain("MEMORY.md is empty");
  });
});

// ── /logs ──────────────────────────────────────────────────────────────────

describe("logsCommand", () => {
  it("returns recent runtime log entries", async () => {
    const ctx = makeContext({
      getRuntimeLogsRecent: vi.fn(async () => ['{"event":"turn.start"}']),
    });

    const result = await logsCommand.action!(ctx, "recent 1");

    expect(result).toMatchObject({
      type: "message",
      messageType: "info",
      content: '{"event":"turn.start"}',
    });
    expect(ctx.ui.getRuntimeLogsRecent).toHaveBeenCalledWith(1);
  });

  it("returns usage error for unknown args", async () => {
    const result = await logsCommand.action!(makeContext(), "tail");
    expect(result).toMatchObject({ type: "message", messageType: "error" });
  });

  it("exports runtime logs", async () => {
    const exportRuntimeLogs = vi.fn(async () => ({ path: "/tmp/runtime-log.jsonl", bytes: 123 }));
    const result = await logsCommand.action!(makeContext({ exportRuntimeLogs }), "export");

    expect(result).toMatchObject({
      type: "message",
      messageType: "info",
      content: expect.stringContaining("/tmp/runtime-log.jsonl"),
    });
    expect(exportRuntimeLogs).toHaveBeenCalledWith(undefined);
  });
});
