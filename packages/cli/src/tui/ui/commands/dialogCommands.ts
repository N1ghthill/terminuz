import {
  CommandKind,
  type OpenDialogActionReturn,
  type SlashCommand,
} from "./types.js";
import { t } from "../../i18n/index.js";

function openDialog(dialog: OpenDialogActionReturn["dialog"]): OpenDialogActionReturn {
  return { type: "dialog", dialog };
}

export const settingsDialogCommand: SlashCommand = {
  name: "settings",
  get description() {
    return t("Open settings dialog");
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: () => openDialog("settings"),
};

export const themeDialogCommand: SlashCommand = {
  name: "theme",
  get description() {
    return t("Open theme dialog");
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: () => openDialog("theme"),
};

export const permissionsDialogCommand: SlashCommand = {
  name: "permissions",
  get description() {
    return t("Open permissions dialog");
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: () => openDialog("permissions"),
};

export const authDialogCommand: SlashCommand = {
  name: "auth",
  altNames: ["login"],
  get description() {
    return t("Open authentication dialog");
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: () => openDialog("auth"),
};

export const feedbackDialogCommand: SlashCommand = {
  name: "feedback",
  get description() {
    return t("Rate this session (saved locally to .deepcode/feedback.log)");
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: () => openDialog("feedback"),
};
