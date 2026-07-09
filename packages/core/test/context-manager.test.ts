import { describe, expect, it } from "vitest";
import { nowIso } from "@terminuz/shared";
import type { Message } from "@terminuz/shared";
import {
  buildSummaryMessage,
  buildSummaryPrompt,
  estimateTokens,
  shouldCompressContext,
  splitForCompression,
} from "../src/agent/context-manager.js";

function makeMessage(role: Message["role"], content: string, source?: Message["source"]): Message {
  return { id: `msg-${Math.random()}`, role, content, source, createdAt: nowIso() };
}

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    const messages = [makeMessage("user", "a".repeat(400), "user")];
    expect(estimateTokens(messages)).toBe(100);
  });

  it("includes tool call arguments in estimate", () => {
    const msg = makeMessage("assistant", "", "assistant");
    msg.toolCalls = [{ id: "tc1", name: "read_file", arguments: { path: "a".repeat(100) } }];
    expect(estimateTokens([msg])).toBeGreaterThan(20);
  });

  it("returns 0 for empty list", () => {
    expect(estimateTokens([])).toBe(0);
  });
});

describe("shouldCompressContext", () => {
  it("returns false when under threshold", () => {
    const messages = [makeMessage("user", "a".repeat(100), "user")];
    expect(shouldCompressContext(messages, 128_000, 0.8)).toBe(false);
  });

  it("returns true when over threshold", () => {
    const messages = [makeMessage("user", "a".repeat(128_000 * 4 * 0.9), "user")];
    expect(shouldCompressContext(messages, 128_000, 0.8)).toBe(true);
  });
});

describe("splitForCompression", () => {
  it("returns null when not enough messages to summarize", () => {
    const messages = [
      makeMessage("user", "hi", "user"),
      makeMessage("assistant", "hello", "assistant"),
    ];
    expect(splitForCompression(messages, 8)).toBeNull();
  });

  it("splits correctly — keeps recent, summarizes old", () => {
    const messages: Message[] = [];
    for (let i = 0; i < 12; i++) {
      messages.push(makeMessage(i % 2 === 0 ? "user" : "assistant", `msg ${i}`, i % 2 === 0 ? "user" : "assistant"));
    }
    const result = splitForCompression(messages, 4);
    expect(result).not.toBeNull();
    expect(result!.toSummarize).toHaveLength(8);
    expect(result!.toKeep).toHaveLength(4);
  });

  it("excludes non-model-context messages from split buckets", () => {
    const messages = [
      makeMessage("user", "internal", "agent_internal"),
      makeMessage("user", "real", "user"),
      makeMessage("assistant", "reply", "assistant"),
      makeMessage("user", "real2", "user"),
      makeMessage("assistant", "reply2", "assistant"),
    ];
    const result = splitForCompression(messages, 2);
    expect(result!.rest).toHaveLength(1); // agent_internal stays in rest
    expect(result!.toSummarize).toHaveLength(2);
    expect(result!.toKeep).toHaveLength(2);
  });
});

describe("buildSummaryPrompt", () => {
  it("includes role labels and content", () => {
    const messages = [makeMessage("user", "fix the bug", "user")];
    const prompt = buildSummaryPrompt(messages);
    expect(prompt).toContain("[user]");
    expect(prompt).toContain("fix the bug");
  });

  it("asks for resumable engineering state", () => {
    const prompt = buildSummaryPrompt([makeMessage("tool", "pnpm test passed", "tool")]);
    expect(prompt).toContain("## Commands And Validation");
    expect(prompt).toContain("## Risks And Open Questions");
    expect(prompt).toContain("next concrete action");
  });
});

describe("buildSummaryMessage", () => {
  it("creates a context_summary source message", () => {
    const msg = buildSummaryMessage("things happened");
    expect(msg.source).toBe("context_summary");
    expect(msg.role).toBe("user");
    expect(msg.content).toContain("things happened");
  });
});
