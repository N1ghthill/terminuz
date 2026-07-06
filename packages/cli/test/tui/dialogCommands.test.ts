import { describe, it, expect } from "vitest";
import {
  settingsDialogCommand,
  themeDialogCommand,
  permissionsDialogCommand,
  authDialogCommand,
  feedbackDialogCommand,
  sessionsDialogCommand,
  setupDialogCommand,
} from "../../src/tui/ui/commands/dialogCommands.js";

// All dialog commands are trivial: they return { type: "dialog", dialog: <name> }.
// We verify both the action return value and the command metadata.

const DIALOG_COMMANDS = [
  { cmd: setupDialogCommand,       dialog: "provider",     name: "setup" },
  { cmd: settingsDialogCommand,    dialog: "settings",    name: "settings" },
  { cmd: themeDialogCommand,       dialog: "theme",       name: "theme" },
  { cmd: permissionsDialogCommand, dialog: "permissions", name: "permissions" },
  { cmd: authDialogCommand,        dialog: "auth",        name: "auth" },
  { cmd: feedbackDialogCommand,    dialog: "feedback",    name: "feedback" },
  { cmd: sessionsDialogCommand,    dialog: "sessions",    name: "sessions" },
] as const;

describe("dialogCommands", () => {
  for (const { cmd, dialog, name } of DIALOG_COMMANDS) {
    it(`/${name} opens the ${dialog} dialog`, () => {
      const result = cmd.action!(null as never, "");
      expect(result).toEqual({ type: "dialog", dialog });
    });

    it(`/${name} is a built-in command`, () => {
      expect(cmd.name).toBe(name === "auth" ? cmd.name : name);
      expect(cmd.kind).toBe("built-in");
      expect(cmd.supportedModes).toContain("interactive");
    });
  }

  it("/auth has 'login' as an alt name", () => {
    expect(authDialogCommand.altNames).toContain("login");
  });
});
