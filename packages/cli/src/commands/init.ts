import { ConfigLoader } from "@terminuz/core";
import { writeStdoutLine } from "../stream-flush.js";

export async function initCommand(cwd: string): Promise<void> {
  const filePath = await new ConfigLoader().init(cwd);
  await writeStdoutLine(`Terminuz config created at ${filePath}`);
  await writeStdoutLine("");
  await writeStdoutLine("Next steps:");
  await writeStdoutLine("  terminuz config set defaultProvider anthropic");
  await writeStdoutLine('  terminuz config set defaultModels.anthropic "claude-sonnet-4-5"');
  await writeStdoutLine("  export ANTHROPIC_API_KEY=...");
  await writeStdoutLine("  terminuz doctor");
  await writeStdoutLine("  terminuz");
  await writeStdoutLine("");
  await writeStdoutLine("Tip: run `terminuz` and use /setup for interactive configuration.");
}
