import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { installHintForChannel } from "../../../commands/update.js";
import { checkForUpdate, isNewer } from "../../../update-checker.js";
import { VERSION } from "../../../version.js";
import {
  CommandKind,
  type CommandContext,
  type SlashCommandActionReturn,
  type SlashCommand,
} from "./types.js";

const execFileAsync = promisify(execFile);

function installArgsForChannel(channel: "latest" | "stable"): string[] {
  if (channel === "stable") {
    return ["install", "-g", "--tag", "stable", "deepcode-ai"];
  }
  return ["install", "-g", "deepcode-ai@latest"];
}

export const updateCommand: SlashCommand = {
  name: "update",
  description: "Check for and install DeepCode updates",
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  argumentHint: "[latest|stable]",
  action: async (
    context: CommandContext,
    args: string,
  ): Promise<SlashCommandActionReturn | void> => {
    const tag = args.trim().toLowerCase();

    if (tag === "latest" || tag === "stable") {
      if (!context.overwriteConfirmed) {
        return {
          type: "confirm_action",
          prompt: `Install the ${tag} channel of deepcode-ai globally with npm?`,
          originalInvocation: { raw: context.invocation?.raw ?? `/update ${tag}` },
        };
      }

      try {
        const { stdout, stderr } = await execFileAsync("npm", installArgsForChannel(tag), {
          timeout: 120_000,
        });
        const output = (stdout + stderr).trim();
        const lines = [`deepcode-ai ${tag} channel installed successfully.`];
        if (output) lines.push("", output);
        lines.push("", "Restart DeepCode to use the new version.");
        return { type: "message", messageType: "info", content: lines.join("\n") };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          type: "message",
          messageType: "error",
          content: `Failed to install the ${tag} channel of deepcode-ai:\n${message}`,
        };
      }
    }

    const update = await checkForUpdate(VERSION, { force: true });
    const lines = [`Current version: ${VERSION}`];

    if (!update) {
      lines.push("Could not reach the npm registry right now.");
    } else {
      const latestStatus = isNewer(VERSION, update.latest)
        ? `available - use /update latest to install (${installHintForChannel("latest")})`
        : "current or newer";
      lines.push(`Latest version:  ${update.latest} (${latestStatus})`);

      if (update.stable) {
        const stableStatus = isNewer(VERSION, update.stable)
          ? `available - use /update stable to install (${installHintForChannel("stable")})`
          : "current or newer";
        lines.push(`Stable version:  ${update.stable} (${stableStatus})`);
      } else {
        lines.push("Stable version:  not published yet");
      }
    }

    return { type: "message", messageType: "info", content: lines.join("\n") };
  },
};
