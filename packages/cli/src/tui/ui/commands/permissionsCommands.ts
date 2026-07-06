import { CommandKind, type SlashCommand } from "./types.js";

const YOLO_MODES = {
  read: "allow",
  write: "allow",
  gitLocal: "allow",
  shell: "allow",
  dangerous: "allow",
} as const;

const SAFE_MODES = {
  read: "allow",
  write: "ask",
  gitLocal: "allow",
  shell: "ask",
  dangerous: "ask",
} as const;

export const yoloCommand: SlashCommand = {
  name: "yolo",
  description: "Set all permissions to allow without confirmations",
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: (context) => {
    context.ui.setPermissions?.(YOLO_MODES);
    context.ui.addItem(
      { type: "info", text: "YOLO mode enabled: all tools are approved automatically." },
      Date.now(),
    );
  },
};

export const safeCommand: SlashCommand = {
  name: "safe",
  description: "Restore default permissions so writes and shell commands ask first",
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: (context) => {
    context.ui.setPermissions?.(SAFE_MODES);
    context.ui.addItem(
      { type: "info", text: "Default permissions restored: writes and shell commands ask first." },
      Date.now(),
    );
  },
};
