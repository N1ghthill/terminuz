import { CommandKind, type MessageActionReturn, type SlashCommand } from "./types.js";
import { exportSession, EXPORT_FORMATS, type ExportFormat } from "../../utils/export.js";

export const exportCommand: SlashCommand = {
  name: "export",
  description: "Export session history to a file",
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  subCommands: EXPORT_FORMATS.map((fmt) => ({
    name: fmt,
    description: fmt === "markdown" ? "Markdown (.md)" : "JSON (.json)",
    kind: CommandKind.BUILT_IN,
    supportedModes: ["interactive"] as const,
    action: async (): Promise<MessageActionReturn> => ({
      type: "message",
      messageType: "info",
      content: `Use /export ${fmt} from the top-level command.`,
    }),
  })),
  action: async (context, args): Promise<MessageActionReturn> => {
    const fmt = (args?.trim() as ExportFormat) ?? "markdown";
    if (!EXPORT_FORMATS.includes(fmt)) {
      return {
        type: "message",
        messageType: "error",
        content: `Unknown format "${fmt}". Available: ${EXPORT_FORMATS.join(", ")}`,
      };
    }

    const messages = context.ui.getMessages?.() ?? [];
    const cwd = context.ui.getCwd?.() ?? process.cwd();
    const model = context.services.session?.getState().model;

    if (messages.length === 0) {
      return { type: "message", messageType: "info", content: "Nothing to export yet." };
    }

    try {
      const outPath = await exportSession({ messages, cwd, model, format: fmt });
      return { type: "message", messageType: "info", content: `Exported to: ${outPath}` };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { type: "message", messageType: "error", content: `Export failed: ${msg}` };
    }
  },
};
