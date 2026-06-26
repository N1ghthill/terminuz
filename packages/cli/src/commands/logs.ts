import path from "node:path";
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

export async function logsExportCommand(options: { cwd: string; output?: string }): Promise<void> {
  const logger = new RuntimeLogger(options.cwd);
  const outputPath = options.output ? path.resolve(options.cwd, options.output) : undefined;
  const result = await logger.export({ outputPath });
  await writeStdoutLine(`Runtime log exported to ${result.path} (${result.bytes} bytes).`);
}
