// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, cleanup } from "ink-testing-library";
import { StreamingState } from "../../src/tui/ui/types.js";

vi.mock("../../src/tui/ui/contexts/UIStateContext.js", () => ({
  useUIState: vi.fn(),
}));

vi.mock("../../src/tui/ui/hooks/useGitBranchName.js", () => ({
  useGitBranchName: vi.fn(() => null),
}));

import { useUIState } from "../../src/tui/ui/contexts/UIStateContext.js";
import { useGitBranchName } from "../../src/tui/ui/hooks/useGitBranchName.js";
import { AppHeader } from "../../src/tui/ui/components/AppHeader.js";

const strip = (s: string | undefined) => (s ?? "").replace(/\x1b\[[0-9;]*[mGKHFJ]/g, "");

const baseUIState = {
  streamingState: StreamingState.Idle,
  sessionStats: {
    lastPromptTokenCount: 0,
    lastOutputTokenCount: 0,
    totalPromptTokenCount: 0,
    totalOutputTokenCount: 0,
  },
  elapsedTime: 0,
  terminalWidth: 120,
};

const baseProps = {
  version: "1.2.0",
  cwd: "/home/user/project",
  providerLabel: "anthropic › claude-opus",
  mode: "build" as const,
  iterationInfo: null,
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AppHeader", () => {
  beforeEach(() => {
    vi.mocked(useUIState).mockReturnValue(baseUIState as ReturnType<typeof useUIState>);
  });

  it("renders brand name and version", () => {
    const { lastFrame } = render(<AppHeader {...baseProps} />);
    const out = strip(lastFrame());
    expect(out).toContain("DeepCode");
    expect(out).toContain("v1.2.0");
  });

  it("renders provider label", () => {
    const { lastFrame } = render(<AppHeader {...baseProps} />);
    expect(strip(lastFrame())).toContain("anthropic › claude-opus");
  });

  it("renders mode in uppercase", () => {
    const { lastFrame } = render(<AppHeader {...baseProps} />);
    expect(strip(lastFrame())).toContain("BUILD");
  });

  it("renders plan mode in uppercase", () => {
    const { lastFrame } = render(<AppHeader {...baseProps} mode="plan" />);
    expect(strip(lastFrame())).toContain("PLAN");
  });

  it("renders idle status", () => {
    const { lastFrame } = render(<AppHeader {...baseProps} />);
    expect(strip(lastFrame())).toContain("idle");
  });

  it("renders running status when streaming", () => {
    vi.mocked(useUIState).mockReturnValue({
      ...baseUIState,
      streamingState: StreamingState.Responding,
    } as ReturnType<typeof useUIState>);
    const { lastFrame } = render(<AppHeader {...baseProps} />);
    expect(strip(lastFrame())).toContain("running");
  });

  it("renders cwd in row 2", () => {
    const { lastFrame } = render(<AppHeader {...baseProps} />);
    expect(strip(lastFrame())).toContain("/home/user/project");
  });

  it("renders git branch name when present", () => {
    vi.mocked(useGitBranchName).mockReturnValue("feature/test");
    const { lastFrame } = render(<AppHeader {...baseProps} />);
    expect(strip(lastFrame())).toContain("feature/test");
  });

  it("renders session name when provided", () => {
    const { lastFrame } = render(<AppHeader {...baseProps} sessionName="minha-sessão" />);
    expect(strip(lastFrame())).toContain("minha-sessão");
  });

  it("does not render session name when not provided", () => {
    const { lastFrame } = render(<AppHeader {...baseProps} />);
    expect(strip(lastFrame())).not.toContain("minha-sessão");
  });

  it("renders update badge when updateAvailable is set", () => {
    const { lastFrame } = render(<AppHeader {...baseProps} updateAvailable="v1.3.0" />);
    const out = strip(lastFrame());
    expect(out).toContain("update available");
    expect(out).toContain("v1.3.0");
    expect(out).toContain("/update");
  });

  it("does not render update badge when updateAvailable is null", () => {
    const { lastFrame } = render(<AppHeader {...baseProps} updateAvailable={null} />);
    expect(strip(lastFrame())).not.toContain("update available");
  });

  it("renders iteration info when provided", () => {
    const { lastFrame } = render(<AppHeader {...baseProps} iterationInfo={{ round: 2, max: 5 }} />);
    expect(strip(lastFrame())).toContain("iter 2/5");
  });

  it("renders token counts when lastPromptTokenCount > 0", () => {
    vi.mocked(useUIState).mockReturnValue({
      ...baseUIState,
      sessionStats: {
        lastPromptTokenCount: 1500,
        lastOutputTokenCount: 300,
        totalPromptTokenCount: 0,
        totalOutputTokenCount: 0,
      },
    } as ReturnType<typeof useUIState>);
    const { lastFrame } = render(<AppHeader {...baseProps} />);
    const out = strip(lastFrame());
    expect(out).toContain("1.5k");
    expect(out).toContain("300");
  });

  it("keeps a two-line header on narrow terminals when metrics and session name appear", () => {
    vi.mocked(useUIState).mockReturnValue({
      ...baseUIState,
      terminalWidth: 80,
      streamingState: StreamingState.Responding,
      sessionStats: {
        lastPromptTokenCount: 2200,
        lastOutputTokenCount: 479,
        totalPromptTokenCount: 2200,
        totalOutputTokenCount: 479,
      },
    } as ReturnType<typeof useUIState>);

    const { lastFrame } = render(
      <AppHeader
        {...baseProps}
        sessionName="Use exatamente dois subagents code-reviewer para inspecionar"
        iterationInfo={{ round: 1, max: 20 }}
      />,
    );
    const lines = strip(lastFrame())
      .split("\n")
      .filter((line) => line.trim());
    expect(lines).toHaveLength(2);
    expect(lines.join("\n")).not.toContain("session ↑");
    expect(lines.join("\n")).not.toContain("Use exatamente");
  });
});
