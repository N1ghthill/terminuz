import { createId, isModelContextMessage, nowIso, type Message } from "@terminuz/shared";

/** Rough token estimate: ~4 chars per token. Good enough for triggering compression. */
export function estimateTokens(messages: Message[]): number {
  return Math.ceil(
    messages.reduce((sum, m) => {
      let chars = m.content.length;
      if (m.toolCalls) {
        chars += m.toolCalls.reduce(
          (s, tc) => s + tc.name.length + JSON.stringify(tc.arguments).length,
          0,
        );
      }
      return sum + chars;
    }, 0) / 4,
  );
}

export function shouldCompressContext(
  messages: Message[],
  maxContextTokens: number,
  threshold: number,
): boolean {
  return estimateTokens(messages) > maxContextTokens * threshold;
}

/**
 * Splits session messages into two buckets:
 * - `toSummarize`: older model-context messages to be replaced by a summary
 * - `toKeep`: the most recent `keepRecentCount` model-context messages
 *
 * Returns null if there aren't enough messages to summarize.
 */
export function splitForCompression(
  messages: Message[],
  keepRecentCount: number,
): { toSummarize: Message[]; toKeep: Message[]; rest: Message[] } | null {
  const contextMessages = messages.filter(isModelContextMessage);
  if (contextMessages.length <= keepRecentCount) return null;

  const cutoff = contextMessages.length - keepRecentCount;
  const toSummarize = contextMessages.slice(0, cutoff);
  const toKeep = contextMessages.slice(cutoff);
  const rest = messages.filter((m) => !isModelContextMessage(m));

  return { toSummarize, toKeep, rest };
}

export function buildSummaryPrompt(messages: Message[]): string {
  const lines = messages.map((m) => {
    const role = m.role === "tool" ? "tool result" : m.role;
    return `[${role}] ${m.content.slice(0, 1500)}`;
  });
  return [
    "Summarize the following conversation history as durable agent handoff context.",
    "Prefer concrete facts over narrative. Preserve enough state for another agent turn to continue safely without rereading everything.",
    "",
    "Return concise Markdown with these headings:",
    "## Objective",
    "## Decisions",
    "## Files",
    "## Commands And Validation",
    "## Current State",
    "## Risks And Open Questions",
    "## Next Steps",
    "",
    "Capture:",
    "- Files read, created, or edited, with key content changes and paths",
    "- Commands executed, their outcomes, and any failures",
    "- Tool results that affect correctness, permissions, or follow-up work",
    "- User decisions, constraints, rejected approaches, and approvals",
    "- Current state of any ongoing task, including whether work may be incomplete",
    "- Remaining risks, blockers, and the next concrete action",
    "",
    "History:",
    lines.join("\n\n"),
  ].join("\n");
}

export function buildSummaryMessage(summary: string): Message {
  return {
    id: createId("msg"),
    role: "user",
    source: "context_summary",
    content: `[Context summary of earlier conversation]\n${summary}`,
    createdAt: nowIso(),
  };
}
