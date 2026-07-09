import { checkForUpdate, isNewer } from "../update-checker.js";
import { VERSION } from "../version.js";
import { writeStdoutLine } from "../stream-flush.js";
import { PRODUCT_IDENTITY } from "@terminuz/shared";

export function installHintForChannel(channel: "latest" | "stable"): string {
  if (channel === "stable") {
    return `npm install -g --tag stable ${PRODUCT_IDENTITY.packageName}`;
  }
  return `npm install -g ${PRODUCT_IDENTITY.packageName}@latest`;
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
