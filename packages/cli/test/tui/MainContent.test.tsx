import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "ink-testing-library";

vi.mock("../../src/tui/ui/contexts/CompactModeContext.js", () => ({
  useCompactMode: () => ({ compactMode: true }),
}));

vi.mock("../../src/tui/ui/contexts/UIActionsContext.js", () => ({
  useUIActions: () => ({ refreshStatic: vi.fn() }),
}));

import { MainContent } from "../../src/tui/ui/components/MainContent.js";

const strip = (s: string | undefined) => (s ?? "").replace(/\x1b\[[0-9;]*[mGKHFJ]/g, "");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("MainContent empty state", () => {
  it("shows a first-run prompt when there is no visible activity", () => {
    const { lastFrame } = render(
      <MainContent
        history={[]}
        historyRemountKey={0}
        pendingAssistantText=""
        liveToolCalls={[]}
        terminalWidth={120}
        mainAreaWidth={100}
      />,
    );

    const out = strip(lastFrame());
    expect(out).toContain("DeepCode");
    expect(out).toContain("is ready");
    expect(out).toContain("Review the current diff");
    expect(out).toContain("/setup");
    expect(out).toContain("/doctor");
  });

  it("can be disabled while the runtime is still initializing", () => {
    const { lastFrame } = render(
      <MainContent
        history={[]}
        historyRemountKey={0}
        pendingAssistantText=""
        liveToolCalls={[]}
        terminalWidth={120}
        mainAreaWidth={100}
        showEmptyState={false}
      />,
    );

    expect(strip(lastFrame()).trim()).toBe("");
  });

  it("does not show the empty state while assistant text is streaming", () => {
    const { lastFrame } = render(
      <MainContent
        history={[]}
        historyRemountKey={0}
        pendingAssistantText="Working"
        liveToolCalls={[]}
        terminalWidth={120}
        mainAreaWidth={100}
      />,
    );

    const out = strip(lastFrame());
    expect(out).not.toContain("is ready");
    expect(out).toContain("Working");
  });
});
