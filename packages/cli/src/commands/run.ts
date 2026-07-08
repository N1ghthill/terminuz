import { collectSecretValues, redactText } from "@deepcode/core";
import { createId, type AgentMode } from "@deepcode/shared";
import { createRuntime } from "../runtime.js";
import { resolveSessionTarget } from "../target-resolution.js";
import { attachAutoApprover } from "../approval.js";

export async function runCommand(
  input: string,
  options: {
    cwd: string;
    config?: string;
    yes?: boolean;
    allowOutsideWorktree?: boolean;
    allowDangerous?: boolean;
    mode?: AgentMode;
    provider?: string;
    model?: string;
  },
): Promise<void> {
  if (options.mode && options.mode !== "plan" && options.mode !== "build") {
    throw new Error(`Invalid mode: ${options.mode}. Expected plan or build.`);
  }
  if (options.allowDangerous && !options.yes) {
    throw new Error("--allow-dangerous requires --yes.");
  }
  if (options.allowOutsideWorktree && !options.yes) {
    throw new Error("--allow-outside-worktree requires --yes.");
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
    attachAutoApprover(runtime.events, {
      allowOutsideWorktree: options.allowOutsideWorktree,
      allowDangerous: options.allowDangerous,
      reason: "Approved by run --yes",
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
  const turnId = createId("turn");
  const secretValues = collectSecretValues(runtime.config);
  let streamed = false;
  let output = "";
  try {
    await runtime.logger.safeLog({
      event: "turn.start",
      sessionId: session.id,
      turnId,
      details: {
        command: "run",
        mode: options.mode ?? runtime.config.agentMode,
        provider: target.provider,
        model: target.model,
        inputChars: input.length,
      },
    });
    const result = await runtime.agent.runDetailed({
      session,
      input,
      mode: options.mode ?? runtime.config.agentMode,
      provider: target.provider,
      autoContinue: "off",
      onIteration: (iteration, maxIterations) => {
        void runtime.logger.safeLog({
          event: "turn.iteration.start",
          sessionId: session.id,
          turnId,
          iteration,
          details: { maxIterations },
        });
      },
      onUsage: (inputTokens, outputTokens) => {
        void runtime.logger.safeLog({
          event: "model.usage",
          sessionId: session.id,
          turnId,
          details: { inputTokens, outputTokens },
        });
      },
      onChunk: (text) => {
        streamed = true;
        process.stdout.write(redactText(text, secretValues));
      },
    });
    output = result.output;
    if (!streamed && output) {
      process.stdout.write(redactText(output, secretValues));
    }
    if (!streamed || !output) process.stdout.write("\n");
    await runtime.logger.safeLog({
      event: "turn.end",
      sessionId: session.id,
      turnId,
      details: {
        ok: true,
        outputChars: output.length,
        filesModified: result.filesModified,
        toolCalls: result.toolCalls.map((call) => ({ id: call.id, name: call.name, ok: call.ok })),
        checkpoint: result.checkpoint,
      },
    });
  } catch (error) {
    await runtime.logger.safeLog({
      event: "turn.end",
      sessionId: session.id,
      turnId,
      details: {
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  } finally {
    await runtime.sessions.persist(session.id).catch(() => {});
    runtime.mcp.stop();
  }
}
