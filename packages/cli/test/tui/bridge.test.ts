import { describe, it, expect } from "vitest";
import type { Activity, Message, Session, ToolCall } from "@deepcode/shared";
import {
  activityBelongsToSession,
  mapMessagesToHistoryItems,
  reduceToolActivity,
  resolveSlashInvocation,
  restoreHistoryFromSession,
} from "../../src/tui/bridge.js";
import { ToolCallStatus, type IndividualToolCallDisplay } from "../../src/tui/ui/types.js";
import { CommandKind, type SlashCommand } from "../../src/tui/ui/commands/types.js";

let seq = 0;
function msg(partial: Partial<Message> & Pick<Message, "role">): Message {
  seq += 1;
  return {
    id: `m-${seq}`,
    content: "",
    createdAt: "2026-01-01T00:00:00.000Z",
    ...partial,
  };
}

function toolCall(id: string, name: string, args: Record<string, unknown> = {}): ToolCall {
  return { id, name, arguments: args };
}

interface ToolGroupItem {
  type: "tool_group";
  tools: IndividualToolCallDisplay[];
}

describe("activityBelongsToSession", () => {
  const activity = (sessionId?: string): Activity => ({
    id: "activity-1",
    type: "tool_call",
    message: "Calling shell",
    createdAt: "2026-01-01T00:00:00.000Z",
    metadata: sessionId ? { tool: "shell", sessionId } : { tool: "shell" },
  });

  it("keeps parent and legacy unscoped activities", () => {
    expect(activityBelongsToSession(activity("parent"), "parent")).toBe(true);
    expect(activityBelongsToSession(activity(), "parent")).toBe(true);
  });

  it("filters activities emitted by child sessions", () => {
    expect(activityBelongsToSession(activity("child"), "parent")).toBe(false);
  });
});

describe("mapMessagesToHistoryItems", () => {
  it("turns assistant text into a gemini item and skips user messages", () => {
    const items = mapMessagesToHistoryItems([
      msg({ role: "user", content: "hi" }),
      msg({ role: "assistant", content: "hello there" }),
    ]);
    expect(items).toEqual([{ type: "gemini", text: "hello there" }]);
  });

  it("emits a tool_group and patches results by call id", () => {
    const items = mapMessagesToHistoryItems([
      msg({ role: "assistant", content: "", toolCalls: [toolCall("c1", "read_file")] }),
      msg({ role: "tool", toolCallId: "c1", content: "file contents" }),
    ]);
    expect(items).toHaveLength(1);
    const group = items[0] as ToolGroupItem;
    expect(group.type).toBe("tool_group");
    expect(group.tools[0]?.status).toBe(ToolCallStatus.Success);
    expect(group.tools[0]?.resultDisplay).toBe("file contents");
  });

  it("marks a tool result starting with Error as failed", () => {
    const items = mapMessagesToHistoryItems([
      msg({ role: "assistant", content: "", toolCalls: [toolCall("c1", "shell")] }),
      msg({ role: "tool", toolCallId: "c1", content: "Error: command failed" }),
    ]);
    expect((items[0] as ToolGroupItem).tools[0]?.status).toBe(ToolCallStatus.Error);
  });

  it("forces unfinished tools to Success by default", () => {
    const items = mapMessagesToHistoryItems([
      msg({ role: "assistant", content: "", toolCalls: [toolCall("c1", "read_file")] }),
    ]);
    expect((items[0] as ToolGroupItem).tools[0]?.status).toBe(ToolCallStatus.Success);
  });

  it("marks unfinished tools as Canceled when aborted", () => {
    const items = mapMessagesToHistoryItems(
      [msg({ role: "assistant", content: "", toolCalls: [toolCall("c1", "read_file")] })],
      { aborted: true },
    );
    const tool = (items[0] as ToolGroupItem).tools[0];
    expect(tool?.status).toBe(ToolCallStatus.Canceled);
    expect(tool?.resultDisplay).toBe("Cancelled.");
  });

  it("preserves ordering across multiple rounds", () => {
    const items = mapMessagesToHistoryItems([
      msg({ role: "assistant", content: "round one", toolCalls: [toolCall("c1", "read_file")] }),
      msg({ role: "tool", toolCallId: "c1", content: "ok" }),
      msg({ role: "assistant", content: "round two" }),
    ]);
    expect(items.map((item) => item.type)).toEqual(["gemini", "tool_group", "gemini"]);
  });
});

describe("reduceToolActivity", () => {
  function activity(type: string, metadata?: Record<string, unknown>): Activity {
    return {
      id: "a-1",
      type,
      message: `${type} event`,
      metadata,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
  }

  it("appends an executing entry on tool_call", () => {
    const next = reduceToolActivity(
      [],
      activity("tool_call", { tool: "read_file", args: { path: "a" } }),
    );
    expect(next).toHaveLength(1);
    expect(next[0]?.name).toBe("read_file");
    expect(next[0]?.status).toBe(ToolCallStatus.Executing);
  });

  it("marks subagent activity so the live tool renderer can delegate it to the subagent panel", () => {
    const next = reduceToolActivity(
      [],
      activity("tool_call", {
        tool: "task",
        activityKind: "subagent",
        args: { prompt: "inspect the auth module", subagent_type: "code-reviewer" },
      }),
    );
    expect(next).toHaveLength(1);
    expect(next[0]?.resultDisplay).toMatchObject({
      type: "task_execution",
      status: "running",
      subagentName: "code-reviewer",
      taskPrompt: "inspect the auth module",
    });
  });

  it("removes completed subagent activity from the live tool list", () => {
    const start = reduceToolActivity(
      [],
      activity("tool_call", {
        tool: "task",
        activityKind: "subagent",
        args: { prompt: "inspect the auth module" },
      }),
    );
    const done = reduceToolActivity(
      start,
      activity("tool_result", {
        tool: "task",
        activityKind: "subagent",
        result: "done",
      }),
    );
    expect(done).toEqual([]);
  });

  it("removes failed subagent activity from the live tool list", () => {
    const start = reduceToolActivity(
      [],
      activity("tool_call", {
        tool: "task",
        activityKind: "subagent",
        args: { prompt: "inspect the auth module" },
      }),
    );
    const failed = reduceToolActivity(
      start,
      activity("tool_error", {
        tool: "task",
        activityKind: "subagent",
        error: "boom",
      }),
    );
    expect(failed).toEqual([]);
  });

  it("resolves the oldest executing entry on tool_result", () => {
    const start = reduceToolActivity([], activity("tool_call", { tool: "shell" }));
    const done = reduceToolActivity(
      start,
      activity("tool_result", { tool: "shell", result: "done" }),
    );
    expect(done[0]?.status).toBe(ToolCallStatus.Success);
    expect(done[0]?.resultDisplay).toBe("done");
  });

  it("marks the entry as Error on tool_error", () => {
    const start = reduceToolActivity([], activity("tool_call", { tool: "shell" }));
    const failed = reduceToolActivity(
      start,
      activity("tool_error", { tool: "shell", error: "boom" }),
    );
    expect(failed[0]?.status).toBe(ToolCallStatus.Error);
    expect(failed[0]?.resultDisplay).toBe("boom");
  });

  it("ignores non-tool activities", () => {
    const prev: IndividualToolCallDisplay[] = [];
    expect(reduceToolActivity(prev, activity("info"))).toBe(prev);
  });

  it("ignores a result with no matching executing entry", () => {
    const prev: IndividualToolCallDisplay[] = [];
    expect(reduceToolActivity(prev, activity("tool_result", { tool: "shell", result: "x" }))).toBe(
      prev,
    );
  });
});

describe("subagent containment invariants", () => {
  function activity(type: string, metadata?: Record<string, unknown>): Activity {
    return {
      id: "a-1",
      type,
      message: `${type} event`,
      metadata,
      createdAt: "2026-01-01T00:00:00.000Z",
    };
  }

  it("filters child session activities from the parent live tool list", () => {
    // Child session activities carry a non-matching sessionId in metadata
    const childActivity = activity("tool_call", {
      tool: "read_file",
      sessionId: "child-session-1",
    });
    // When activityBelongsToSession returns false, the parent TUI skips it
    // entirely — verify the external check rejects child session activities.
    expect(activityBelongsToSession(childActivity, "parent-session")).toBe(false);
  });

  it("does not render subagent tool_call inline when subagent panel owns it", () => {
    // Subagent activities use activityKind: "subagent" so reduceToolActivity
    // creates an AgentResultDisplay (task_execution) instead of plain text.
    const subagentCall = activity("tool_call", {
      tool: "task",
      activityKind: "subagent",
      args: { prompt: "review the auth module", subagent_type: "code-reviewer" },
    });
    const result = reduceToolActivity([], subagentCall);
    expect(result[0]?.resultDisplay).toBeDefined();
    // It should be a task_execution object, not a plain string
    expect(result[0]?.resultDisplay).toMatchObject({ type: "task_execution" });
    // The SubagentsPanel owns the visual for this entry — it should not render
    // as a regular inline tool block
    expect(typeof result[0]?.resultDisplay).toBe("object");
  });

  it("does not leak raw subagent output into parent history on mapMessagesToHistoryItems", () => {
    // When a subagent completes, its tool result message enters the parent
    // session's messages. mapMessagesToHistoryItems should produce a tool_group
    // with the subagent result as summary text, not as separate gemini/inline.
    const messages: Message[] = [
      {
        id: "msg-1",
        role: "assistant",
        content: "Let me inspect the codebase.",
        createdAt: "2026-01-01T00:00:00.000Z",
        toolCalls: [
          { id: "call-task-1", name: "task", arguments: { prompt: "review auth", subagent_type: "code-reviewer" } },
        ],
      },
      {
        id: "msg-2",
        role: "tool",
        toolCallId: "call-task-1",
        content: "Summary: reviewed auth module\nIssues found:\n- Hardcoded secret",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
    ];
    const items = mapMessagesToHistoryItems(messages);
    // Produces gemini for text + tool_group for the task call
    expect(items).toHaveLength(2);
    expect(items[0]?.type).toBe("gemini");
    expect(items[0]).toMatchObject({ type: "gemini", text: "Let me inspect the codebase." });
    const group = items[1] as { type: string; tools: Array<{ name: string; resultDisplay: string }> };
    expect(group.type).toBe("tool_group");
    // The result should be a plain text summary, not raw dump
    expect(group.tools[0]?.resultDisplay).toContain("Summary");
  });

  it("does not show subagent-chunk as assistant streaming text in parent TUI", () => {
    // Subagent chunks are emitted via subagent:chunk event, not onChunk.
    // The parent TUI should never receive subagent text as pendingAssistantText.
    // This invariant is enforced by SubagentManager routing — verify the bridge
    // does not accidentally promote subagent content to assistant items.
    const subagentToolResult: Message = {
      id: "msg-sub",
      role: "tool",
      toolCallId: "call-task-1",
      content: "Raw subagent output with lots of detail lines\nline 2\nline 3",
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    const items = mapMessagesToHistoryItems([subagentToolResult]);
    // A lone tool result without an assistant message has no matching callId
    // and should produce no history items.
    expect(items).toHaveLength(0);
  });

  it("leaves a terminal summary for cancelled subagents, not a raw dump", () => {
    // When a subagent is cancelled with no tool result message, the tool
    // status should be Canceled and resultDisplay should indicate cancellation.
    const messages: Message[] = [
      {
        id: "msg-1",
        role: "assistant",
        content: "",
        createdAt: "2026-01-01T00:00:00.000Z",
        toolCalls: [
          { id: "call-cancel", name: "task", arguments: { prompt: "long running task" } },
        ],
      },
    ];
    const items = mapMessagesToHistoryItems(messages, { aborted: true });
    expect(items).toHaveLength(1);
    const group = items[0] as { type: string; tools: Array<{ status: string; resultDisplay: string }> };
    expect(group.type).toBe("tool_group");
    expect(group.tools[0]?.status).toBe(ToolCallStatus.Canceled);
    expect(group.tools[0]?.resultDisplay).toBe("Cancelled.");
  });
});

describe("restoreHistoryFromSession", () => {
  function session(messages: Message[]): Session {
    return {
      id: "session-test-id",
      worktree: "/tmp/test",
      provider: "anthropic",
      model: "claude-3-5-sonnet",
      status: "idle",
      messages,
      activities: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      metadata: {},
    };
  }

  it("produces user + gemini items for a simple single-turn session", () => {
    const collected: ReturnType<typeof mapMessagesToHistoryItems> = [];
    restoreHistoryFromSession(
      session([
        msg({ role: "user", content: "hello" }),
        msg({ role: "assistant", content: "hi there" }),
      ]),
      (item) => collected.push(item),
    );
    expect(collected).toHaveLength(2);
    expect(collected[0]).toEqual({ type: "user", text: "hello" });
    expect(collected[1]).toEqual({ type: "gemini", text: "hi there" });
  });

  it("handles multiple turns preserving order", () => {
    const collected: ReturnType<typeof mapMessagesToHistoryItems> = [];
    restoreHistoryFromSession(
      session([
        msg({ role: "user", content: "turn 1" }),
        msg({ role: "assistant", content: "reply 1" }),
        msg({ role: "user", content: "turn 2" }),
        msg({ role: "assistant", content: "reply 2" }),
      ]),
      (item) => collected.push(item),
    );
    expect(collected.map((i) => [i.type, "text" in i ? i.text : ""])).toEqual([
      ["user", "turn 1"],
      ["gemini", "reply 1"],
      ["user", "turn 2"],
      ["gemini", "reply 2"],
    ]);
  });

  it("skips blank user messages", () => {
    const collected: ReturnType<typeof mapMessagesToHistoryItems> = [];
    restoreHistoryFromSession(
      session([
        msg({ role: "user", content: "   " }),
        msg({ role: "assistant", content: "hello" }),
      ]),
      (item) => collected.push(item),
    );
    expect(collected).toHaveLength(1);
    expect(collected[0]?.type).toBe("gemini");
  });

  it("returns nothing for a session with no messages", () => {
    const collected: ReturnType<typeof mapMessagesToHistoryItems> = [];
    restoreHistoryFromSession(session([]), (item) => collected.push(item));
    expect(collected).toHaveLength(0);
  });

  it("includes tool_group items from a tool-call turn", () => {
    const collected: ReturnType<typeof mapMessagesToHistoryItems> = [];
    restoreHistoryFromSession(
      session([
        msg({ role: "user", content: "run it" }),
        msg({ role: "assistant", content: "", toolCalls: [toolCall("c1", "bash")] }),
        msg({ role: "tool", toolCallId: "c1", content: "ok" }),
      ]),
      (item) => collected.push(item),
    );
    expect(collected.map((i) => i.type)).toEqual(["user", "tool_group"]);
  });
});

describe("resolveSlashInvocation", () => {
  const cmd = (name: string, extra: Partial<SlashCommand> = {}): SlashCommand => ({
    name,
    description: name,
    kind: CommandKind.BUILT_IN,
    ...extra,
  });
  const commands: SlashCommand[] = [
    cmd("help"),
    cmd("auth", { altNames: ["login"] }),
    cmd("model"),
  ];

  it("resolves a plain command", () => {
    const result = resolveSlashInvocation("/help", commands);
    expect(result?.command.name).toBe("help");
    expect(result?.args).toBe("");
  });

  it("matches alt names case-insensitively", () => {
    expect(resolveSlashInvocation("/LOGIN", commands)?.command.name).toBe("auth");
  });

  it("extracts the argument string", () => {
    const result = resolveSlashInvocation("/model claude-opus-4-7", commands);
    expect(result?.command.name).toBe("model");
    expect(result?.args).toBe("claude-opus-4-7");
  });

  it("returns null for an unknown command", () => {
    expect(resolveSlashInvocation("/nope", commands)).toBeNull();
  });

  it("walks into sub-commands", () => {
    const withSub: SlashCommand[] = [cmd("memory", { subCommands: [cmd("add"), cmd("list")] })];
    const result = resolveSlashInvocation("/memory add some note", withSub);
    expect(result?.command.name).toBe("add");
    expect(result?.name).toBe("memory add");
    expect(result?.args).toBe("some note");
  });
});
