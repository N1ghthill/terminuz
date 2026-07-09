import { describe, expect, it } from "vitest";
import type { Message } from "@terminuz/shared";
import { buildReasoningThread } from "../src/agent/subagent-manager.js";

function msg(role: Message["role"], content: string, extra: Partial<Message> = {}): Message {
  return { id: "x", createdAt: new Date().toISOString(), role, content, ...extra };
}

describe("buildReasoningThread", () => {
  it("returns empty array for empty input", () => {
    expect(buildReasoningThread([])).toEqual([]);
  });

  it("keeps user messages unchanged", () => {
    const result = buildReasoningThread([msg("user", "hello")]);
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("user");
    expect(result[0]!.content).toBe("hello");
  });

  it("keeps assistant messages that have text content", () => {
    const result = buildReasoningThread([msg("assistant", "I found the issue")]);
    expect(result).toHaveLength(1);
    expect(result[0]!.content).toBe("I found the issue");
  });

  it("drops tool result messages", () => {
    const messages = [
      msg("user", "read the file"),
      msg("assistant", "", { toolCalls: [{ id: "c1", name: "read_file", arguments: {} }] }),
      msg("tool", "file contents here", { toolCallId: "c1" }),
    ];
    const result = buildReasoningThread(messages);
    expect(result.every((m) => m.role !== "tool")).toBe(true);
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("user");
  });

  it("drops pure tool-call assistant messages (no text content)", () => {
    const messages = [
      msg("user", "do something"),
      msg("assistant", "", { toolCalls: [{ id: "c1", name: "shell", arguments: {} }] }),
      msg("tool", "output", { toolCallId: "c1" }),
      msg("assistant", "done"),
    ];
    const result = buildReasoningThread(messages);
    expect(result.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(result[1]!.content).toBe("done");
  });

  it("keeps assistant messages that have both text and tool calls, stripping toolCalls", () => {
    const messages = [
      msg("user", "analyze this"),
      msg("assistant", "I will read the file now", {
        toolCalls: [{ id: "c1", name: "read_file", arguments: {} }],
      }),
      msg("tool", "huge file content", { toolCallId: "c1" }),
    ];
    const result = buildReasoningThread(messages);
    expect(result.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(result[1]!.content).toBe("I will read the file now");
    expect(result[1]!.toolCalls).toBeUndefined();
  });

  it("merges consecutive same-role messages", () => {
    const messages = [
      msg("user", "first question"),
      msg("user", "second question"),
    ];
    const result = buildReasoningThread(messages);
    expect(result).toHaveLength(1);
    expect(result[0]!.content).toBe("first question\n\nsecond question");
  });

  it("merges consecutive assistant messages when tool results are stripped between them", () => {
    const messages = [
      msg("user", "analyze"),
      msg("assistant", "reading file"),
      msg("tool", "content", { toolCallId: "c1" }),
      msg("assistant", "writing result"),
      msg("tool", "ok", { toolCallId: "c2" }),
      msg("assistant", "all done"),
    ];
    const result = buildReasoningThread(messages);
    expect(result.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(result[1]!.content).toBe("reading file\n\nwriting result\n\nall done");
  });

  it("produces empty thread when all messages are tool calls/results", () => {
    const messages = [
      msg("assistant", "", { toolCalls: [{ id: "c1", name: "shell", arguments: {} }] }),
      msg("tool", "output", { toolCallId: "c1" }),
    ];
    expect(buildReasoningThread(messages)).toEqual([]);
  });

  it("trims whitespace-only assistant content", () => {
    const messages = [
      msg("user", "hi"),
      msg("assistant", "   "),
    ];
    const result = buildReasoningThread(messages);
    expect(result).toHaveLength(1);
    expect(result[0]!.role).toBe("user");
  });

  it("preserves role and source metadata on kept messages", () => {
    const messages = [msg("user", "question", { source: "user" })];
    const result = buildReasoningThread(messages);
    expect(result[0]!.source).toBe("user");
  });
});
