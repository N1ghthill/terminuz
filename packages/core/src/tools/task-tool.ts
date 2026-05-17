import { Effect } from "effect";
import { z } from "zod";
import { createId } from "@deepcode/shared";
import type { ProviderId } from "@deepcode/shared";
import { defineTool, type ToolDefinition } from "./tool.js";
import type { SubagentManager } from "../agent/subagent-manager.js";

const TaskSchema = z.object({
  prompt: z.string().describe("Full task description for the subagent — be specific and self-contained."),
  provider: z.string().optional().describe("Provider override (e.g. 'anthropic', 'openai'). Defaults to current provider."),
  model: z.string().optional().describe("Model override. Defaults to current model."),
  fork: z.boolean().optional().describe("If true, the subagent starts with the current conversation history as context."),
});

export function createTaskTool(subagents: SubagentManager): ToolDefinition {
  return defineTool({
    name: "task",
    description:
      "Launch a subagent to handle a self-contained task in a child session. " +
      "The subagent has full access to all tools (read, write, bash, git, search, etc.). " +
      "Use for parallelizable work, delegating a well-scoped subtask, or specialized analysis. " +
      "Set fork=true to give the subagent the current conversation history as starting context.",
    parameters: TaskSchema,
    execute: (args, context) =>
      Effect.tryPromise(async () => {
        const taskId = createId("task");
        const result = args.fork
          ? await subagents.forkFrom(context.sessionId, {
              id: taskId,
              prompt: args.prompt,
              provider: args.provider as ProviderId | undefined,
              model: args.model,
            }, context.abortSignal)
          : await subagents.runOne({
              id: taskId,
              prompt: args.prompt,
              provider: args.provider as ProviderId | undefined,
              model: args.model,
            }, context.abortSignal);

        if (result.error) {
          throw new Error(`Subagent failed: ${result.error}`);
        }
        return result.output || "(subagent completed with no output)";
      }),
  });
}
