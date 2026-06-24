import { checkForUpdate, isNewer } from "../update-checker.js";
import { VERSION } from "../version.js";
import { writeStdoutLine } from "../stream-flush.js";

export function installHintForChannel(channel: "latest" | "stable"): string {
  if (channel === "stable") {
    return "npm install -g --tag stable deepcode-ai";
  }
  return "npm install -g deepcode-ai@latest";
}

export async function updateCommand(): Promise<void> {
  writeStdoutLine(`Current version: ${VERSION}`);

  const update = await checkForUpdate(VERSION, { force: true });

  if (!update) {
    writeStdoutLine("Could not reach the npm registry right now.");
    return;
  }

  const latestNewer = isNewer(VERSION, update.latest);
  writeStdoutLine(
    `Latest version:  ${update.latest} (${latestNewer ? "update available" : "up to date"})`,
  );

  if (update.stable) {
    const stableNewer = isNewer(VERSION, update.stable);
    writeStdoutLine(
      `Stable version:  ${update.stable} (${stableNewer ? "update available" : "up to date"})`,
    );
  } else {
    writeStdoutLine("Stable version:  not published yet");
  }

  if (latestNewer || (update.stable && isNewer(VERSION, update.stable))) {
    writeStdoutLine("");
    writeStdoutLine(`Install latest:  ${installHintForChannel("latest")}`);
    writeStdoutLine(`Install stable:  ${installHintForChannel("stable")}`);
  }
}
