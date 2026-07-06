import { CommandKind, type SlashCommand } from "./types.js";

export const newCommand: SlashCommand = {
  name: "new",
  description: "Start a fresh blank session while keeping the current provider/model",
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: async (context) => {
    await context.ui.newSession?.();
  },
};
