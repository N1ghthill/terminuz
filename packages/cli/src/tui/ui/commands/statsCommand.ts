import { CommandKind, type SlashCommand } from "./types.js";
import type { HistoryItemWithoutId } from "../types.js";

function formatDurationSecs(ms: number): string {
  const totalSecs = Math.floor(ms / 1000);
  if (totalSecs < 60) return `${totalSecs}s`;
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h ${mins % 60}m`;
}

export const statsCommand: SlashCommand = {
  name: "stats",
  description: "Show current session statistics for tokens, messages, and time",
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: (context) => {
    const messages = context.ui.getMessages?.() ?? [];
    const tokenStats = context.ui.getTokenStats?.();

    const now = Date.now();
    const startedAt = tokenStats?.sessionStartedAt ?? now;
    const duration = formatDurationSecs(now - startedAt);

    context.ui.addItem(
      {
        type: "stats",
        duration,
        promptTokens: tokenStats?.lastPromptTokens,
        outputTokens: tokenStats?.lastOutputTokens,
        messageCount: messages.length,
      } as HistoryItemWithoutId,
      now,
    );
  },
};
