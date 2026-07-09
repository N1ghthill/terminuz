import { collectSecretValues, redactText, type SubagentResult } from "@terminuz/core";
import { createId } from "@terminuz/shared";
import { createRuntime } from "../runtime.js";
import { writeStdoutLine } from "../stream-flush.js";
import { attachAutoApprover } from "../approval.js";

export async function subagentsRunCommand(options: {
  cwd: string;
  config?: string;
  tasks: string[];
  concurrency?: number;
  yes?: boolean;
  allowOutsideWorktree?: boolean;
  allowDangerous?: boolean;
}): Promise<void> {
  if (options.tasks.length === 0) {
    throw new Error("Provide at least one --task.");
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

  try {
    if (options.yes) {
      attachAutoApprover(runtime.events, {
        allowOutsideWorktree: options.allowOutsideWorktree,
        allowDangerous: options.allowDangerous,
        reason: "Approved by subagents --yes",
      });
    }

    const turnId = createId("turn");
    await runtime.logger.safeLog({
      event: "turn.start",
      turnId,
      details: {
        command: "subagents run",
        taskCount: options.tasks.length,
        concurrency: options.concurrency,
        inputChars: options.tasks.reduce((sum, task) => sum + task.length, 0),
      },
    });

    let results: SubagentResult[];
    results = await runtime.subagents.runParallel(
      options.tasks.map((prompt, index) => ({
        id: `task-${index + 1}`,
        prompt,
      })),
      { concurrency: options.concurrency },
    );
    const secretValues = collectSecretValues(runtime.config);
    await runtime.logger.safeLog({
      event: "turn.end",
      turnId,
      details: {
        command: "subagents run",
        ok: results.every((result) => !result.error),
        results: results.map((result) => ({
          taskId: result.taskId,
          sessionId: result.sessionId,
          ok: !result.error,
          outputChars: result.output.length,
        })),
      },
    });

    for (const result of results) {
      await writeStdoutLine(`## ${result.taskId} (${result.sessionId})`);
      if (result.error) {
        await writeStdoutLine(`error: ${redactText(result.error, secretValues)}`);
        continue;
      }
      await writeStdoutLine(
        result.output ? redactText(result.output, secretValues) : "(no output)",
      );
    }
  } catch (error) {
    await runtime.logger.safeLog({
      event: "turn.end",
      details: {
        command: "subagents run",
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    throw error;
  } finally {
    runtime.mcp.stop();
  }
}
