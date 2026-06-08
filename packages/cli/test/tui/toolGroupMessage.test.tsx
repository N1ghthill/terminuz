import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup } from "ink-testing-library";
import { ToolCallStatus, StreamingState } from "../../src/tui/ui/types.js";
import type { IndividualToolCallDisplay } from "../../src/tui/ui/types.js";
import type { AgentResultDisplay } from "../../src/tui/qwen-core/index.js";

// ── Mutable state for context mocks ─────────────────────────────────────────

const compactModeState = vi.hoisted(() => ({ compactMode: false }));

// ConfigContext throws without a provider — return a minimal stub.
vi.mock("../../src/tui/ui/contexts/ConfigContext.js", () => ({
  useConfig: () => ({
    getDebugMode: () => false,
    getFileFilteringOptions: () => undefined,
    getEnableRecursiveFileSearch: () => false,
    getFileFilteringEnableFuzzySearch: () => false,
    getProjectRoot: () => "/test",
    getTargetDir: () => "/test",
    getWorkingDir: () => "/test",
    getContentGeneratorConfig: () => undefined,
    getAccessibility: () => undefined,
    getIdeMode: () => false,
    isTrustedFolder: () => true,
    getShouldUseNodePtyShell: () => false,
  }),
}));

// StreamingContext throws without a provider — ToolStatusIndicator uses it.
vi.mock("../../src/tui/ui/contexts/StreamingContext.js", () => ({
  useStreamingContext: () => StreamingState.Idle,
  StreamingContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}));

// CompactModeContext — controlled via compactModeState for per-test variation.
vi.mock("../../src/tui/ui/contexts/CompactModeContext.js", () => ({
  useCompactMode: () => compactModeState,
  CompactModeProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// ToolMessage has its own context chain (SettingsContext, etc.) — stub it to
// isolate ToolGroupMessage's own rendering logic. Return null to sidestep
// all downstream context dependencies; the border box from ToolGroupMessage
// itself is enough to assert expanded-mode rendering.
vi.mock("../../src/tui/ui/components/messages/ToolMessage.js", () => ({
  ToolMessage: () => null,
}));

// ToolConfirmationMessage is only reached when there is a Confirming tool.
vi.mock("../../src/tui/ui/components/messages/ToolConfirmationMessage.js", () => ({
  ToolConfirmationMessage: () => {
    const { Text } = require("ink");
    return React.createElement(Text, null, "ConfirmationDialog");
  },
}));

import { ToolGroupMessage } from "../../src/tui/ui/components/messages/ToolGroupMessage.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

const strip = (s: string | undefined) =>
  (s ?? "").replace(/\x1b\[[0-9;]*[mGKHFJ]/g, "");

function makeTool(
  name: string,
  status: ToolCallStatus,
  overrides: Partial<IndividualToolCallDisplay> = {},
): IndividualToolCallDisplay {
  return {
    callId: `call-${name}`,
    name,
    description: "",
    resultDisplay: undefined,
    status,
    confirmationDetails: undefined,
    ...overrides,
  };
}

function makeSubagentTool(
  status: AgentResultDisplay["status"],
): IndividualToolCallDisplay {
  return {
    callId: "call-subagent",
    name: "TaskCreate",
    description: "",
    resultDisplay: {
      type: "task_execution",
      status,
      taskId: "t1",
      prompt: "do something",
    } as unknown as AgentResultDisplay,
    status: ToolCallStatus.Executing,
    confirmationDetails: undefined,
  };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  compactModeState.compactMode = false;
});

// ── Tests ────────────────────────────────────────────────────────────────────

describe("ToolGroupMessage — null for panel-owned live subagent", () => {
  it("renders nothing when isPending and the only tool is a running subagent", () => {
    const { lastFrame } = render(
      <ToolGroupMessage
        groupId={1}
        toolCalls={[makeSubagentTool("running")]}
        contentWidth={80}
        isPending
      />,
    );
    expect(strip(lastFrame())).toBe("");
  });

  it("renders nothing when isPending and the only tool is a background subagent", () => {
    const { lastFrame } = render(
      <ToolGroupMessage
        groupId={1}
        toolCalls={[makeSubagentTool("background")]}
        contentWidth={80}
        isPending
      />,
    );
    expect(strip(lastFrame())).toBe("");
  });
});

describe("ToolGroupMessage — compact mode path", () => {
  it("delegates to CompactToolGroupDisplay (shows Ctrl+O hint) when compactMode is on", () => {
    compactModeState.compactMode = true;
    const tools = [makeTool("ReadFile", ToolCallStatus.Success)];
    const { lastFrame } = render(
      <ToolGroupMessage groupId={1} toolCalls={tools} contentWidth={80} />,
    );
    expect(strip(lastFrame())).toContain("Ctrl+O");
  });

  it("passes compactLabel to CompactToolGroupDisplay", () => {
    compactModeState.compactMode = true;
    const tools = [
      makeTool("ReadFile", ToolCallStatus.Success),
      makeTool("WriteFile", ToolCallStatus.Success),
    ];
    const { lastFrame } = render(
      <ToolGroupMessage
        groupId={1}
        toolCalls={tools}
        contentWidth={80}
        compactLabel="Read and write files"
      />,
    );
    const out = strip(lastFrame());
    expect(out).toContain("Read and write files");
    expect(out).toContain("2 tools");
  });

  it("suppresses compact mode when there is a Confirming tool", () => {
    compactModeState.compactMode = true;
    const tools = [makeTool("WriteFile", ToolCallStatus.Confirming)];
    const { lastFrame } = render(
      <ToolGroupMessage groupId={1} toolCalls={tools} contentWidth={80} />,
    );
    // Confirming forces expanded → ToolMessage stub is rendered, not CompactToolGroupDisplay
    expect(strip(lastFrame())).not.toContain("Ctrl+O");
  });

  it("suppresses compact mode when there is an Error tool", () => {
    compactModeState.compactMode = true;
    const tools = [makeTool("ReadFile", ToolCallStatus.Error)];
    const { lastFrame } = render(
      <ToolGroupMessage groupId={1} toolCalls={tools} contentWidth={80} />,
    );
    expect(strip(lastFrame())).not.toContain("Ctrl+O");
  });

  it("suppresses compact mode when isUserInitiated is true", () => {
    compactModeState.compactMode = true;
    const tools = [makeTool("ReadFile", ToolCallStatus.Success)];
    const { lastFrame } = render(
      <ToolGroupMessage
        groupId={1}
        toolCalls={tools}
        contentWidth={80}
        isUserInitiated
      />,
    );
    expect(strip(lastFrame())).not.toContain("Ctrl+O");
  });
});

describe("ToolGroupMessage — memory-only group summary", () => {
  it("shows 'Recalled N memor...' for read-only memory group", () => {
    const tools = [
      makeTool("ReadFile", ToolCallStatus.Success, { isMemoryOp: "read" }),
      makeTool("ReadFile2", ToolCallStatus.Success, { isMemoryOp: "read" }),
    ];
    const { lastFrame } = render(
      <ToolGroupMessage
        groupId={1}
        toolCalls={tools}
        contentWidth={80}
        memoryReadCount={2}
      />,
    );
    expect(strip(lastFrame())).toContain("Recalled 2");
  });

  it("shows 'Wrote N memor...' for write-only memory group", () => {
    const tools = [
      makeTool("WriteFile", ToolCallStatus.Success, { isMemoryOp: "write" }),
    ];
    const { lastFrame } = render(
      <ToolGroupMessage
        groupId={1}
        toolCalls={tools}
        contentWidth={80}
        memoryWriteCount={1}
      />,
    );
    expect(strip(lastFrame())).toContain("Wrote 1 memory");
  });

  it("shows both counts for mixed memory group", () => {
    const tools = [
      makeTool("ReadFile", ToolCallStatus.Success, { isMemoryOp: "read" }),
      makeTool("WriteFile", ToolCallStatus.Success, { isMemoryOp: "write" }),
    ];
    const { lastFrame } = render(
      <ToolGroupMessage
        groupId={1}
        toolCalls={tools}
        contentWidth={80}
        memoryReadCount={1}
        memoryWriteCount={3}
      />,
    );
    const out = strip(lastFrame());
    expect(out).toContain("Recalled 1");
    expect(out).toContain("Wrote 3");
  });
});

describe("ToolGroupMessage — expanded (non-compact) path", () => {
  it("renders a rounded border box wrapping the tool rows", () => {
    const tools = [
      makeTool("ReadFile", ToolCallStatus.Success),
      makeTool("WriteFile", ToolCallStatus.Executing),
    ];
    const { lastFrame } = render(
      <ToolGroupMessage groupId={1} toolCalls={tools} contentWidth={80} />,
    );
    // Ink's borderStyle="round" produces ╭ / ╰ corners.
    const raw = lastFrame() ?? "";
    expect(raw).toMatch(/╭|╰/);
  });

  it("does not render Ctrl+O hint in non-compact mode", () => {
    const tools = [makeTool("ReadFile", ToolCallStatus.Success)];
    const { lastFrame } = render(
      <ToolGroupMessage groupId={1} toolCalls={tools} contentWidth={80} />,
    );
    expect(strip(lastFrame())).not.toContain("Ctrl+O");
  });
});
