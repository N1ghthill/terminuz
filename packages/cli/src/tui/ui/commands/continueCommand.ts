import { CommandKind, type SlashCommand } from "./types.js";

export const continueCommand: SlashCommand = {
  name: "continue",
  description: "Continue the task after reaching the iteration limit",
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: () => ({
    type: "submit_prompt" as const,
    content: "Continue the task from where you left off.",
  }),
};
