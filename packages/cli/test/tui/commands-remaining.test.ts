import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { CommandContext } from "../../src/tui/ui/commands/types.js";
import { undoCommand, compactCommand } from "../../src/tui/ui/commands/basicCommands.js";
import { doctorCommand } from "../../src/tui/ui/commands/doctorCommand.js";

// ── exportCommand is mocked because exportSession writes to disk ─────────────

vi.mock("../../src/tui/utils/export.js", () => ({
  EXPORT_FORMATS: ["markdown", "json"],
  exportSession: vi.fn(),
}));

import { exportCommand } from "../../src/tui/ui/commands/exportCommand.js";
import { exportSession } from "../../src/tui/utils/export.js";

// ── shared helpers ───────────────────────────────────────────────────────────

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

function msg(role: "user" | "assistant", content: string, i = 0) {
  return { id: `m${i}`, role, content, createdAt: new Date().toISOString() };
}

// ── /undo ────────────────────────────────────────────────────────────────────

describe("undoCommand", () => {
  it("reports nothing to undo when undo returns null", async () => {
    const ctx = makeContext({ undo: vi.fn(async () => null) });
    const result = await undoCommand.action!(ctx, "");
    expect(result).toMatchObject({ type: "message", messageType: "info" });
    expect(result?.type === "message" ? result.content : "").toContain("Nothing to undo");
  });

  it("reports the restored path when undo succeeds", async () => {
    const ctx = makeContext({
      undo: vi.fn(async () => ({ path: "/tmp/foo.ts", restored: true })),
    });
    const result = await undoCommand.action!(ctx, "");
    expect(result).toMatchObject({ type: "message", messageType: "info" });
    expect(result?.type === "message" ? result.content : "").toContain("/tmp/foo.ts");
  });
});

// ── /compact ─────────────────────────────────────────────────────────────────

describe("compactCommand", () => {
  it("calls ui.compact and returns nothing", async () => {
    const compact = vi.fn(async () => {});
    const ctx = makeContext({ compact });
    await compactCommand.action!(ctx, "");
    expect(compact).toHaveBeenCalledOnce();
  });
});

// ── /export ──────────────────────────────────────────────────────────────────

describe("exportCommand", () => {
  beforeEach(() => vi.clearAllMocks());

  it("rejects unknown formats with an error message", async () => {
    const ctx = makeContext({ getMessages: () => [msg("user", "hello", 0)] });
    const result = await exportCommand.action!(ctx, "pdf");
    expect(result).toMatchObject({ type: "message", messageType: "error" });
    expect(result?.type === "message" ? result.content : "").toContain("pdf");
  });

  it("reports nothing to export when there are no messages", async () => {
    const ctx = makeContext({ getMessages: () => [] });
    const result = await exportCommand.action!(ctx, "markdown");
    expect(result).toMatchObject({ type: "message", messageType: "info" });
    expect(result?.type === "message" ? result.content : "").toContain("Nada para exportar");
  });

  it("returns the output path on success", async () => {
    vi.mocked(exportSession).mockResolvedValue("/tmp/session.md");
    const ctx = makeContext({ getMessages: () => [msg("user", "hi", 0)] });
    const result = await exportCommand.action!(ctx, "markdown");
    expect(exportSession).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ type: "message", messageType: "info" });
    expect(result?.type === "message" ? result.content : "").toContain("/tmp/session.md");
  });

  it("defaults to markdown when no format arg is provided", async () => {
    vi.mocked(exportSession).mockResolvedValue("/tmp/out.md");
    const ctx = makeContext({ getMessages: () => [msg("user", "hi", 0)] });
    await exportCommand.action!(ctx, "");
    const call = vi.mocked(exportSession).mock.calls[0]![0];
    expect(call.format).toBe("markdown");
  });

  it("accepts json format", async () => {
    vi.mocked(exportSession).mockResolvedValue("/tmp/out.json");
    const ctx = makeContext({ getMessages: () => [msg("user", "hi", 0)] });
    const result = await exportCommand.action!(ctx, "json");
    expect(result).toMatchObject({ type: "message", messageType: "info" });
  });

  it("returns an error message when exportSession throws", async () => {
    vi.mocked(exportSession).mockRejectedValue(new Error("disk full"));
    const ctx = makeContext({ getMessages: () => [msg("user", "hi", 0)] });
    const result = await exportCommand.action!(ctx, "markdown");
    expect(result).toMatchObject({ type: "message", messageType: "error" });
    expect(result?.type === "message" ? result.content : "").toContain("disk full");
  });
});

// ── /doctor ──────────────────────────────────────────────────────────────────

describe("doctorCommand", () => {
  let tmpCwd: string;

  beforeEach(() => {
    tmpCwd = fs.mkdtempSync(path.join(os.tmpdir(), "deepcode-doctor-test-"));
  });

  afterEach(() => {
    fs.rmSync(tmpCwd, { recursive: true, force: true });
  });

  it("adds a doctor history item with checks and summary", () => {
    const ctx = makeContext({ getCwd: () => tmpCwd });
    doctorCommand.action!(ctx, "");
    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(item.type).toBe("doctor");
    expect(Array.isArray(item.checks)).toBe(true);
    expect(item.summary).toMatchObject({ pass: expect.any(Number), warn: expect.any(Number), fail: expect.any(Number) });
  });

  it("includes environment checks", () => {
    const ctx = makeContext({ getCwd: () => tmpCwd });
    doctorCommand.action!(ctx, "");
    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const names = (item.checks as Array<{ name: string }>).map((c) => c.name);
    expect(names).toContain("Node.js");
    expect(names).toContain("Working directory");
  });

  it("detects a git repo when .git exists", () => {
    fs.mkdirSync(path.join(tmpCwd, ".git"));
    const ctx = makeContext({ getCwd: () => tmpCwd });
    doctorCommand.action!(ctx, "");
    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const gitCheck = (item.checks as Array<{ name: string; status: string }>)
      .find((c) => c.name === "Git repository");
    expect(gitCheck?.status).toBe("pass");
  });

  it("warns when .git is absent", () => {
    const ctx = makeContext({ getCwd: () => tmpCwd });
    doctorCommand.action!(ctx, "");
    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const gitCheck = (item.checks as Array<{ name: string; status: string }>)
      .find((c) => c.name === "Git repository");
    expect(gitCheck?.status).toBe("warn");
  });

  it("includes runtime checks when getRuntimeDiagnostics is provided", () => {
    const diag = {
      provider: "anthropic",
      model: "claude-opus-4-7",
      hasApiKey: true,
      mcpConnected: 0,
      mcpTotal: 0,
      agentMode: "build",
    };
    const ctx = makeContext({ getCwd: () => tmpCwd, getRuntimeDiagnostics: () => diag });
    doctorCommand.action!(ctx, "");
    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const names = (item.checks as Array<{ name: string }>).map((c) => c.name);
    expect(names).toContain("Provider");
    expect(names).toContain("Model");
    expect(names).toContain("API key");
  });

  it("marks API key as fail when missing", () => {
    const diag = {
      provider: "openai",
      model: "gpt-4",
      hasApiKey: false,
      mcpConnected: 0,
      mcpTotal: 0,
      agentMode: "build",
    };
    const ctx = makeContext({ getCwd: () => tmpCwd, getRuntimeDiagnostics: () => diag });
    doctorCommand.action!(ctx, "");
    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const keyCheck = (item.checks as Array<{ name: string; status: string }>)
      .find((c) => c.name === "API key");
    expect(keyCheck?.status).toBe("fail");
  });

  it("skips runtime checks when getRuntimeDiagnostics is absent", () => {
    const ctx = makeContext({ getCwd: () => tmpCwd });
    doctorCommand.action!(ctx, "");
    const [item] = (ctx.ui.addItem as ReturnType<typeof vi.fn>).mock.calls[0]!;
    const names = (item.checks as Array<{ name: string }>).map((c) => c.name);
    expect(names).not.toContain("Provider");
  });
});
