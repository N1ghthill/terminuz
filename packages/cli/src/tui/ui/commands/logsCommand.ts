import { CommandKind, type CommandContext, type MessageActionReturn, type SlashCommand } from "./types.js";

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
    {
      name: "export",
      description: "Export runtime log entries",
      kind: CommandKind.BUILT_IN,
      supportedModes: ["interactive"] as const,
      action: async (context, args): Promise<MessageActionReturn> => exportLogs(context, args),
    },
  ],
  action: async (context, args): Promise<MessageActionReturn> => {
    const normalized = args.trim();
    if (normalized && !normalized.startsWith("recent")) {
      if (normalized === "export" || normalized.startsWith("export ")) {
        return exportLogs(context, normalized.replace(/^export\b/, "").trim());
      }
      return {
        type: "message",
        messageType: "error",
        content: "Usage: /logs recent [lines] or /logs export",
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

async function exportLogs(context: CommandContext, args: string): Promise<MessageActionReturn> {
  try {
    const outputPath = args.trim() || undefined;
    const result = await context.ui.exportRuntimeLogs?.(outputPath);
    if (!result) {
      return {
        type: "message",
        messageType: "error",
        content: "Runtime log export is not available in this session.",
      };
    }
    return {
      type: "message",
      messageType: "info",
      content: `Runtime log exported to ${result.path} (${result.bytes} bytes).`,
    };
  } catch (error) {
    return {
      type: "message",
      messageType: "error",
      content: error instanceof Error ? error.message : String(error),
    };
  }
}
