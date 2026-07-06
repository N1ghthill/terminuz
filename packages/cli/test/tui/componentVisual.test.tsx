import { describe, it, expect, afterEach, vi } from "vitest";
import React from "react";
import { render, cleanup } from "ink-testing-library";
import { ToolCallStatus, StreamingState } from "../../src/tui/ui/types.js";
import type { IndividualToolCallDisplay } from "../../src/tui/ui/types.js";
import { StickyTodoList } from "../../src/tui/ui/components/StickyTodoList.js";
import { SubagentsPanel } from "../../src/tui/ui/components/SubagentsPanel.js";
import { CompactToolGroupDisplay } from "../../src/tui/ui/components/messages/CompactToolGroupDisplay.js";
import type { TodoItem } from "../../src/tui/ui/components/TodoDisplay.js";
import type { SubagentEntry } from "../../src/tui/ui/contexts/UIStateContext.js";

// StreamingContext throws without a provider — return Idle so spinners render
// their nonRespondingDisplay text instead of the animated spinner.
vi.mock("../../src/tui/ui/contexts/StreamingContext.js", () => ({
  useStreamingContext: () => StreamingState.Idle,
  StreamingContext: { Provider: ({ children }: { children: React.ReactNode }) => children },
}));

const strip = (s: string | undefined) => (s ?? "").replace(/\x1b\[[0-9;]*[mGKHFJ]/g, "");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// ── helpers ─────────────────────────────────────────────────────────────────

function makeTodo(id: string, status: TodoItem["status"], content = `Task ${id}`): TodoItem {
  return { id, content, status };
}

function makeTool(
  name: string,
  status: ToolCallStatus,
  description = "",
): IndividualToolCallDisplay {
  return {
    callId: `call-${name}`,
    name,
    description,
    resultDisplay: undefined,
    status,
    confirmationDetails: undefined,
  };
}

function makeSubagent(partial: Partial<SubagentEntry> = {}): SubagentEntry {
  return {
    taskId: "task-1",
    prompt: "Inspect auth module",
    status: "running",
    startedAt: 1,
    ...partial,
  };
}

// ── StickyTodoList ───────────────────────────────────────────────────────────

describe("StickyTodoList", () => {
  it("renders nothing when todos array is empty", () => {
    const { lastFrame } = render(<StickyTodoList todos={[]} width={80} />);
    expect(strip(lastFrame())).toBe("");
  });

  it("renders a header and pending todo", () => {
    const todos = [makeTodo("1", "pending", "Write tests")];
    const { lastFrame } = render(<StickyTodoList todos={todos} width={80} />);
    const out = strip(lastFrame());
    expect(out).toContain("Tarefas em andamento");
    expect(out).toContain("Write tests");
    expect(out).toContain("○");
  });

  it("shows ◐ icon for in_progress tasks", () => {
    const todos = [makeTodo("1", "in_progress", "Running task")];
    const { lastFrame } = render(<StickyTodoList todos={todos} width={80} />);
    expect(strip(lastFrame())).toContain("◐");
  });

  it("shows ● icon for completed tasks", () => {
    const todos = [makeTodo("1", "completed", "Done task")];
    const { lastFrame } = render(<StickyTodoList todos={todos} width={80} />);
    expect(strip(lastFrame())).toContain("●");
  });

  it("puts in_progress tasks first, completed last", () => {
    const todos = [
      makeTodo("a", "completed", "Done"),
      makeTodo("b", "pending", "Waiting"),
      makeTodo("c", "in_progress", "Active"),
    ];
    const { lastFrame } = render(<StickyTodoList todos={todos} width={80} />);
    const out = strip(lastFrame());
    const activeIdx = out.indexOf("Active");
    const waitingIdx = out.indexOf("Waiting");
    const doneIdx = out.indexOf("Done");
    expect(activeIdx).toBeLessThan(waitingIdx);
    expect(waitingIdx).toBeLessThan(doneIdx);
  });

  it("caps visible items at maxVisibleItems and shows overflow count", () => {
    const todos = Array.from({ length: 7 }, (_, i) => makeTodo(`${i}`, "pending", `Task ${i}`));
    const { lastFrame } = render(<StickyTodoList todos={todos} width={80} maxVisibleItems={3} />);
    const out = strip(lastFrame());
    expect(out).toContain("mais 4");
  });

  it("renders all items when count is within maxVisibleItems", () => {
    const todos = [makeTodo("1", "pending"), makeTodo("2", "pending")];
    const { lastFrame } = render(<StickyTodoList todos={todos} width={80} maxVisibleItems={5} />);
    expect(strip(lastFrame())).not.toContain("mais");
  });
});

// ── SubagentsPanel ──────────────────────────────────────────────────────────

describe("SubagentsPanel", () => {
  it("renders running subagents as a single compact status line", () => {
    const { lastFrame } = render(
      <SubagentsPanel
        mainAreaWidth={80}
        subagents={[makeSubagent({ prompt: "Inspect auth module", currentTool: "read_file" })]}
      />,
    );
    const lines = strip(lastFrame())
      .split("\n")
      .filter((line) => line.trim() !== "");
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("Subagents");
    expect(lines[0]).toContain("1 running");
    expect(lines[0]).toContain("↓ details");
    expect(lines[0]).not.toContain("Inspect auth module");
    expect(lines[0]).not.toContain("read_file");
    expect(lines[0]).not.toContain("╭");
    expect(lines[0]).not.toContain("╰");
  });

  it("does not render volatile subagent output", () => {
    const { lastFrame } = render(
      <SubagentsPanel
        mainAreaWidth={80}
        subagents={[
          makeSubagent({
            currentOutput: "streaming text that changes every chunk",
          }),
        ]}
      />,
    );
    expect(strip(lastFrame())).not.toContain("streaming text that changes every chunk");
  });

  it("escapes ANSI control sequences from rendered subagent detail", () => {
    const { lastFrame } = render(
      <SubagentsPanel
        mainAreaWidth={80}
        subagents={[
          makeSubagent({
            currentTool: "\x1b[2Jread_file",
          }),
        ]}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("\x1b[2J");
    expect(frame).not.toContain("read_file");
  });

  it("keeps the same one-line layout slot before, during, and after execution", () => {
    const empty = render(<SubagentsPanel mainAreaWidth={80} subagents={[]} />);
    const running = render(
      <SubagentsPanel
        mainAreaWidth={80}
        subagents={[makeSubagent({ currentTool: "read_file" })]}
      />,
    );
    const done = render(
      <SubagentsPanel
        mainAreaWidth={80}
        subagents={[makeSubagent({ status: "done", currentTool: undefined })]}
      />,
    );

    const lineCount = (frame: string | undefined) => (frame ?? "").split("\n").length;
    expect(lineCount(empty.lastFrame())).toBe(1);
    expect(lineCount(running.lastFrame())).toBe(1);
    expect(lineCount(done.lastFrame())).toBe(1);
  });
});

// ── CompactToolGroupDisplay ──────────────────────────────────────────────────

describe("CompactToolGroupDisplay", () => {
  it("renders nothing for an empty tool list", () => {
    const { lastFrame } = render(<CompactToolGroupDisplay toolCalls={[]} contentWidth={80} />);
    expect(strip(lastFrame())).toBe("");
  });

  it("shows tool name and description for a single executing tool", () => {
    const tools = [makeTool("ReadFile", ToolCallStatus.Executing, "src/index.ts")];
    const { lastFrame } = render(<CompactToolGroupDisplay toolCalls={tools} contentWidth={80} />);
    const out = strip(lastFrame());
    expect(out).toContain("ReadFile");
    expect(out).toContain("src/index.ts");
  });

  it("shows count suffix (× N) when there are multiple tools", () => {
    const tools = [
      makeTool("ReadFile", ToolCallStatus.Success),
      makeTool("WriteFile", ToolCallStatus.Executing),
    ];
    const { lastFrame } = render(<CompactToolGroupDisplay toolCalls={tools} contentWidth={80} />);
    expect(strip(lastFrame())).toContain("× 2");
  });

  it("uses compactLabel when provided, with tool count", () => {
    const tools = [
      makeTool("ReadFile", ToolCallStatus.Success),
      makeTool("WriteFile", ToolCallStatus.Success),
    ];
    const { lastFrame } = render(
      <CompactToolGroupDisplay
        toolCalls={tools}
        contentWidth={80}
        compactLabel="Read and write files"
      />,
    );
    const out = strip(lastFrame());
    expect(out).toContain("Read and write files");
    expect(out).toContain("2 tools");
  });

  it("does not show count suffix for a single tool with compactLabel", () => {
    const tools = [makeTool("ReadFile", ToolCallStatus.Success)];
    const { lastFrame } = render(
      <CompactToolGroupDisplay toolCalls={tools} contentWidth={80} compactLabel="Read config" />,
    );
    const out = strip(lastFrame());
    expect(out).toContain("Read config");
    expect(out).not.toContain("tools");
  });

  it("prioritises Executing tool as the active tool over Success", () => {
    const tools = [
      makeTool("Done", ToolCallStatus.Success),
      makeTool("Running", ToolCallStatus.Executing),
    ];
    const { lastFrame } = render(<CompactToolGroupDisplay toolCalls={tools} contentWidth={80} />);
    expect(strip(lastFrame())).toContain("Running");
  });

  it("shows Ctrl+O hint for full output", () => {
    const tools = [makeTool("ReadFile", ToolCallStatus.Success)];
    const { lastFrame } = render(<CompactToolGroupDisplay toolCalls={tools} contentWidth={80} />);
    expect(strip(lastFrame())).toContain("Ctrl+O");
  });

  it("only uses the first line of a multi-line description", () => {
    const tool = makeTool("Shell", ToolCallStatus.Executing, "line one\nline two");
    const { lastFrame } = render(<CompactToolGroupDisplay toolCalls={[tool]} contentWidth={80} />);
    const out = strip(lastFrame());
    expect(out).toContain("line one");
    expect(out).not.toContain("line two");
  });
});
