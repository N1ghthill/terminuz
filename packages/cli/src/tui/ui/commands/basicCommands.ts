import {
  CommandKind,
  type MessageActionReturn,
  type OpenDialogActionReturn,
  type SlashCommand,
} from "./types.js";
import { t } from "../../i18n/index.js";

export const clearCommand: SlashCommand = {
  name: "clear",
  get description() {
    return t("Clear the on-screen conversation history");
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: (context) => {
    context.ui.clear();
  },
};

function helpAction(): OpenDialogActionReturn {
  return {
    type: "dialog",
    dialog: "help",
  };
}

export const helpCommand: SlashCommand = {
  name: "help",
  get description() {
    return t("Show available slash commands");
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: () => helpAction(),
};

export const undoCommand: SlashCommand = {
  name: "undo",
  get description() {
    return t("Undo the last file write or edit made by the agent");
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: async (context): Promise<MessageActionReturn> => {
    const result = await context.ui.undo();
    if (!result) {
      return { type: "message", messageType: "info", content: "Nada para desfazer." };
    }
    return {
      type: "message",
      messageType: "info",
      content: `↩ Restaurado: ${result.path}`,
    };
  },
};

export const compactCommand: SlashCommand = {
  name: "compact",
  get description() {
    return t("Summarize and compact the conversation history to free context window");
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: async (context) => {
    await context.ui.compact();
  },
};
