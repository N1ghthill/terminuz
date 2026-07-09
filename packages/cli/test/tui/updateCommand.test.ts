import { afterEach, describe, it, expect, vi } from "vitest";

const { checkForUpdate, isNewer } = vi.hoisted(() => ({
  checkForUpdate: vi.fn(),
  isNewer: vi.fn(),
}));

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("../../src/update-checker.js", () => ({ checkForUpdate, isNewer }));
vi.mock("../../src/version.js", () => ({ VERSION: "1.2.60" }));

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return { ...actual, execFile: execFileMock };
});

import type { CommandContext } from "../../src/tui/ui/commands/types.js";
import { updateCommand } from "../../src/tui/ui/commands/updateCommand.js";

afterEach(() => vi.clearAllMocks());

function makeContext(overrides: Partial<CommandContext> = {}): CommandContext {
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
    },
    session: { sessionShellAllowlist: new Set<string>() },
    ...overrides,
  };
}

// ── info mode (no args) ──────────────────────────────────────────────────────

describe("updateCommand — info mode (/update with no args)", () => {
  it("shows current version and registry failure when npm is unreachable", async () => {
    checkForUpdate.mockResolvedValue(null);
    const result = await updateCommand.action!(makeContext(), "");
    expect(result).toMatchObject({ type: "message", messageType: "info" });
    const content = result?.type === "message" ? result.content : "";
    expect(content).toContain("1.2.60");
    expect(content).toContain("npm registry");
  });

  it("shows install hint via /update latest when a newer latest exists", async () => {
    checkForUpdate.mockResolvedValue({ latest: "1.2.61", stable: "1.2.60" });
    isNewer.mockImplementation((_cur: string, cand: string) => cand === "1.2.61");

    const result = await updateCommand.action!(makeContext(), "");
    const content = result?.type === "message" ? result.content : "";
    expect(content).toContain("/update latest");
    expect(content).toContain("1.2.61");
  });

  it("shows install hint via /update stable when a newer stable exists", async () => {
    checkForUpdate.mockResolvedValue({ latest: "1.2.62", stable: "1.2.62" });
    isNewer.mockReturnValue(true);

    const result = await updateCommand.action!(makeContext(), "");
    const content = result?.type === "message" ? result.content : "";
    expect(content).toContain("/update stable");
    expect(content).toContain("npm install -g --tag stable terminuz");
  });

  it("shows up-to-date status when no newer version exists", async () => {
    checkForUpdate.mockResolvedValue({ latest: "1.2.60", stable: "1.2.60" });
    isNewer.mockReturnValue(false);

    const result = await updateCommand.action!(makeContext(), "");
    const content = result?.type === "message" ? result.content : "";
    expect(content).toContain("current or newer");
    expect(content).not.toContain("/update latest");
  });

  it("shows 'not published yet' when stable channel is absent", async () => {
    checkForUpdate.mockResolvedValue({ latest: "1.2.60", stable: null });
    isNewer.mockReturnValue(false);

    const result = await updateCommand.action!(makeContext(), "");
    const content = result?.type === "message" ? result.content : "";
    expect(content).toContain("not published yet");
  });
});

// ── install mode (/update latest | /update stable) ───────────────────────────

describe("updateCommand — install mode", () => {
  it("returns confirm_action when called with 'stable' before confirmation", async () => {
    const result = await updateCommand.action!(makeContext(), "stable");
    expect(result).toMatchObject({ type: "confirm_action" });
    const confirm = result as Extract<typeof result, { type: "confirm_action" }>;
    expect(String(confirm.prompt)).toContain("stable");
  });

  it("returns confirm_action when called with 'latest' before confirmation", async () => {
    const result = await updateCommand.action!(makeContext(), "latest");
    expect(result).toMatchObject({ type: "confirm_action" });
  });

  it("runs npm install and returns success after confirmation", async () => {
    execFileMock.mockImplementation(
      (
        _cmd: string,
        _args: string[],
        _opts: object,
        cb: (err: null, result: { stdout: string; stderr: string }) => void,
      ) => {
        cb(null, { stdout: "added 1 package", stderr: "" });
      },
    );

    const result = await updateCommand.action!(
      makeContext({
        overwriteConfirmed: true,
        invocation: { raw: "/update stable", name: "update", args: "stable" },
      }),
      "stable",
    );

    expect(execFileMock).toHaveBeenCalledWith(
      "npm",
      ["install", "-g", "--tag", "stable", "terminuz"],
      { timeout: 120_000 },
      expect.any(Function),
    );
    expect(result).toMatchObject({ type: "message", messageType: "info" });
    const content = result?.type === "message" ? result.content : "";
    expect(content).toContain("installed");
    expect(content).toContain("Restart");
  });

  it("returns an error message when npm install fails", async () => {
    execFileMock.mockImplementation(
      (_cmd: string, _args: string[], _opts: object, cb: (err: Error) => void) => {
        cb(new Error("permission denied"));
      },
    );

    const result = await updateCommand.action!(makeContext({ overwriteConfirmed: true }), "latest");

    expect(result).toMatchObject({ type: "message", messageType: "error" });
    const content = result?.type === "message" ? result.content : "";
    expect(content).toContain("permission denied");
  });

  it("treats an unrecognized tag as info mode, not install", async () => {
    checkForUpdate.mockResolvedValue(null);
    const result = await updateCommand.action!(makeContext(), "bogus");
    expect(result).toMatchObject({ type: "message", messageType: "info" });
  });
});
