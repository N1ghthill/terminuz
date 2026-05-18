import { checkForUpdate, isNewer } from "../../../update-checker.js";
import { VERSION } from "../../../version.js";
import {
  CommandKind,
  type MessageActionReturn,
  type SlashCommand,
} from "./types.js";

export const updateCommand: SlashCommand = {
  name: "update",
  description: "Check published DeepCode versions",
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: async (): Promise<MessageActionReturn> => {
    const update = await checkForUpdate(VERSION, { force: true });
    const lines = [`Current version: ${VERSION}`];

    if (!update) {
      lines.push("Could not reach the npm registry right now.");
    } else {
      const latestStatus = isNewer(VERSION, update.latest)
        ? "available"
        : "current or older";
      lines.push(`Latest version:  ${update.latest} (${latestStatus})`);

      if (update.stable) {
        const stableStatus = isNewer(VERSION, update.stable)
          ? "available"
          : "current or older";
        lines.push(`Stable version:  ${update.stable} (${stableStatus})`);
      } else {
        lines.push("Stable version:  not published yet");
      }
    }

    lines.push("");
    lines.push("Install latest:  npm install -g deepcode-ai@latest");
    lines.push("Install stable:  npm install -g deepcode-ai@stable");

    return { type: "message", messageType: "info", content: lines.join("\n") };
  },
};
