import { RuntimeLogger } from "@deepcode/core";
import { writeStdoutLine } from "../stream-flush.js";

export async function logsRecentCommand(options: { cwd: string; lines?: number }): Promise<void> {
  const logger = new RuntimeLogger(options.cwd);
  const lines = await logger.readRecent(options.lines ?? 50);
  if (lines.length === 0) {
    await writeStdoutLine("No runtime log entries found.");
    return;
  }
  for (const line of lines) {
    await writeStdoutLine(line);
  }
}
