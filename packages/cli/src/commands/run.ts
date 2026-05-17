import { collectSecretValues, redactText } from "@deepcode/core";
import type { AgentMode } from "@deepcode/shared";
import { createRuntime } from "../runtime.js";
import { resolveSessionTarget } from "../target-resolution.js";

export async function runCommand(
  input: string,
  options: {
    cwd: string;
    config?: string;
    yes?: boolean;
    mode?: AgentMode;
    provider?: string;
    model?: string;
  },
): Promise<void> {
  if (options.mode && options.mode !== "plan" && options.mode !== "build") {
    throw new Error(`Invalid mode: ${options.mode}. Expected plan or build.`);
  }
  const runtime = await createRuntime({
    cwd: options.cwd,
    configPath: options.config,
    interactive: Boolean(options.yes),
  });
  runtime.events.on("app:warn", (payload) => {
    process.stderr.write(`warning: ${payload.message}\n`);
  });
  runtime.events.on("app:error", (payload) => {
    process.stderr.write(`error: ${payload.error.message}\n`);
  });
  if (options.yes) {
    runtime.events.on("approval:request", (request) => {
      runtime.events.emit("approval:decision", {
        requestId: request.id,
        decision: { allowed: true },
      });
    });
  }
  const target = resolveSessionTarget(runtime.config, {
    provider: options.provider,
    model: options.model,
  });

  const session = runtime.sessions.create({
    provider: target.provider,
    model: target.model,
  });
  const secretValues = collectSecretValues(runtime.config);
  let streamed = false;
  const output = await runtime.agent.run({
    session,
    input,
    mode: options.mode ?? runtime.config.agentMode,
    provider: target.provider,
    onChunk: (text) => {
      streamed = true;
      process.stdout.write(redactText(text, secretValues));
    },
  });
  if (!streamed && output) {
    process.stdout.write(redactText(output, secretValues));
  }
  if (!streamed || !output) process.stdout.write("\n");
}
