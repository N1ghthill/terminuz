import { CommandKind, type MessageActionReturn, type SlashCommand } from "./types.js";

export const logsCommand: SlashCommand = {
  name: "logs",
  description: "Show recent runtime log entries",
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  subCommands: [
    {
      name: "recent",
      description: "Show recent runtime log entries",
      kind: CommandKind.BUILT_IN,
      supportedModes: ["interactive"] as const,
      action: async (context, args): Promise<MessageActionReturn> => {
        const limit = parseLimit(args);
        const lines = await context.ui.getRuntimeLogsRecent?.(limit);
        if (!lines || lines.length === 0) {
          return { type: "message", messageType: "info", content: "No runtime log entries found." };
        }
        return {
          type: "message",
          messageType: "info",
          content: lines.join("\n"),
        };
      },
    },
  ],
  action: async (context, args): Promise<MessageActionReturn> => {
    const normalized = args.trim();
    if (normalized && !normalized.startsWith("recent")) {
      return {
        type: "message",
        messageType: "error",
        content: "Usage: /logs recent [lines]",
      };
    }
    const rest = normalized.replace(/^recent\b/, "").trim();
    const limit = parseLimit(rest);
    const lines = await context.ui.getRuntimeLogsRecent?.(limit);
    if (!lines || lines.length === 0) {
      return { type: "message", messageType: "info", content: "No runtime log entries found." };
    }
    return {
      type: "message",
      messageType: "info",
      content: lines.join("\n"),
    };
  },
};

function parseLimit(args: string): number {
  const trimmed = args.trim();
  if (!trimmed) return 20;
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) return 20;
  return Math.min(parsed, 100);
}
