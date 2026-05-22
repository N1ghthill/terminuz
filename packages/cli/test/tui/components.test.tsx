import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "ink-testing-library";
import { ApprovalMode } from "@deepcode/tui-shim";

// Mocked before any imports that depend on it (vitest hoists vi.mock)
vi.mock("../../src/tui/ui/hooks/useKeypress.js", () => ({
  useKeypress: vi.fn(),
}));

import { useKeypress } from "../../src/tui/ui/hooks/useKeypress.js";
import { ContextUsageDisplay } from "../../src/tui/ui/components/ContextUsageDisplay.js";
import { AutoAcceptIndicator } from "../../src/tui/ui/components/AutoAcceptIndicator.js";
import {
  UserMessage,
  UserShellMessage,
  ThinkMessage,
} from "../../src/tui/ui/components/messages/ConversationMessages.js";
import {
  PermissionsDialog,
  type PermissionModes,
} from "../../src/tui/ui/components/PermissionsDialog.js";

// Strip ANSI escape codes for clean text assertions.
const strip = (s: string | undefined) =>
  (s ?? "").replace(/\x1b\[[0-9;]*[mGKHFJ]/g, "");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── ContextUsageDisplay ─────────────────────────────────────────────────────

describe("ContextUsageDisplay", () => {
  it("renders nothing when promptTokenCount is 0", () => {
    const { lastFrame } = render(
      <ContextUsageDisplay promptTokenCount={0} terminalWidth={120} contextWindowSize={128_000} />,
    );
    expect(strip(lastFrame())).toBe("");
  });

  it("shows percentage when tokens are within the limit", () => {
    const { lastFrame } = render(
      <ContextUsageDisplay promptTokenCount={12_800} terminalWidth={120} contextWindowSize={128_000} />,
    );
    expect(strip(lastFrame())).toContain("10.0");
    expect(strip(lastFrame())).toContain("% context used");
  });

  it("shows abbreviated label on narrow terminals (< 100 cols)", () => {
    const { lastFrame } = render(
      <ContextUsageDisplay promptTokenCount={12_800} terminalWidth={80} contextWindowSize={128_000} />,
    );
    expect(strip(lastFrame())).toContain("% used");
    expect(strip(lastFrame())).not.toContain("% context used");
  });

  it("shows >100 when usage exceeds the context window", () => {
    const { lastFrame } = render(
      <ContextUsageDisplay promptTokenCount={200_000} terminalWidth={120} contextWindowSize={128_000} />,
    );
    expect(strip(lastFrame())).toContain(">100");
  });

  it("shows exactly 100.0% at boundary", () => {
    const { lastFrame } = render(
      <ContextUsageDisplay promptTokenCount={128_000} terminalWidth={120} contextWindowSize={128_000} />,
    );
    // 128000/128000 = 1.0 — not > 1, so formatPercentageUsed returns "100.0"
    expect(strip(lastFrame())).toContain("100.0");
  });
});

// ── AutoAcceptIndicator ─────────────────────────────────────────────────────

describe("AutoAcceptIndicator", () => {
  it("renders nothing for DEFAULT mode", () => {
    const { lastFrame } = render(<AutoAcceptIndicator approvalMode={ApprovalMode.DEFAULT} />);
    expect(strip(lastFrame()).trim()).toBe("");
  });

  it("shows YOLO mode label", () => {
    const { lastFrame } = render(<AutoAcceptIndicator approvalMode={ApprovalMode.YOLO} />);
    expect(strip(lastFrame())).toContain("YOLO mode");
  });

  it("shows auto-accept edits label for AUTO_EDIT", () => {
    const { lastFrame } = render(<AutoAcceptIndicator approvalMode={ApprovalMode.AUTO_EDIT} />);
    expect(strip(lastFrame())).toContain("auto-accept edits");
  });

  it("shows plan mode label for PLAN", () => {
    const { lastFrame } = render(<AutoAcceptIndicator approvalMode={ApprovalMode.PLAN} />);
    expect(strip(lastFrame())).toContain("plan mode");
  });
});

// ── ConversationMessages ────────────────────────────────────────────────────

describe("UserMessage", () => {
  it("renders with > prefix", () => {
    const { lastFrame } = render(<UserMessage text="hello world" />);
    const out = strip(lastFrame());
    expect(out).toContain(">");
    expect(out).toContain("hello world");
  });
});

describe("UserShellMessage", () => {
  it("renders with $ prefix and strips leading !", () => {
    const { lastFrame } = render(<UserShellMessage text="!ls -la" />);
    const out = strip(lastFrame());
    expect(out).toContain("$");
    expect(out).toContain("ls -la");
    expect(out).not.toContain("!");
  });

  it("renders without stripping when text has no leading !", () => {
    const { lastFrame } = render(<UserShellMessage text="ls -la" />);
    const out = strip(lastFrame());
    expect(out).toContain("$");
    expect(out).toContain("ls -la");
  });
});

describe("ThinkMessage", () => {
  it("renders ◉ pensando… header and content with │ prefix", () => {
    const { lastFrame } = render(
      <ThinkMessage text="Analisando o problema" isPending={false} contentWidth={80} />,
    );
    const out = strip(lastFrame());
    expect(out).toContain("◉ pensando");
    expect(out).toContain("│");
    expect(out).toContain("Analisando o problema");
  });
});

// ── PermissionsDialog ───────────────────────────────────────────────────────

const DEFAULT_MODES: PermissionModes = {
  read: "allow",
  write: "ask",
  gitLocal: "allow",
  shell: "ask",
  dangerous: "deny",
};

function lastHandler() {
  const calls = vi.mocked(useKeypress).mock.calls;
  const last = calls.at(-1);
  return last?.[0] as ((key: { name: string; ctrl: boolean }) => void) | undefined;
}

describe("PermissionsDialog", () => {
  it("renders all permission keys and their current modes", () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const { lastFrame } = render(
      <PermissionsDialog current={DEFAULT_MODES} onSave={onSave} onClose={onClose} />,
    );
    const out = strip(lastFrame());
    expect(out).toContain("read");
    expect(out).toContain("write");
    expect(out).toContain("git local");
    expect(out).toContain("shell");
    expect(out).toContain("dangerous");
    expect(out).toContain("allow");
    expect(out).toContain("ask");
    expect(out).toContain("deny");
  });

  it("shows focus indicator › on the first row by default", () => {
    const { lastFrame } = render(
      <PermissionsDialog current={DEFAULT_MODES} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(strip(lastFrame())).toContain("›");
  });

  it("calls onClose when Esc is pressed", () => {
    const onClose = vi.fn();
    render(<PermissionsDialog current={DEFAULT_MODES} onSave={vi.fn()} onClose={onClose} />);
    lastHandler()?.({ name: "escape", ctrl: false });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows 'no edits' save label when nothing has changed", () => {
    const { lastFrame } = render(
      <PermissionsDialog current={DEFAULT_MODES} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    expect(strip(lastFrame())).toContain("sem edições");
  });

  it("renders the keyboard hint line", () => {
    const { lastFrame } = render(
      <PermissionsDialog current={DEFAULT_MODES} onSave={vi.fn()} onClose={vi.fn()} />,
    );
    const out = strip(lastFrame());
    expect(out).toContain("navegar");
    expect(out).toContain("Esc cancelar");
  });
});
