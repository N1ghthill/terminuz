import { ConfigLoader } from "@deepcode/core";
import { writeStdoutLine } from "../stream-flush.js";

export async function initCommand(cwd: string): Promise<void> {
  const filePath = await new ConfigLoader().init(cwd);
  await writeStdoutLine(`DeepCode config created at ${filePath}`);
  await writeStdoutLine("");
  await writeStdoutLine("Next steps:");
  await writeStdoutLine("  deepcode config set defaultProvider anthropic");
  await writeStdoutLine('  deepcode config set defaultModels.anthropic "claude-sonnet-4-5"');
  await writeStdoutLine("  export ANTHROPIC_API_KEY=...");
  await writeStdoutLine("  deepcode doctor");
  await writeStdoutLine("  deepcode");
  await writeStdoutLine("");
  await writeStdoutLine("Tip: run `deepcode` and use /setup for interactive configuration.");
}
