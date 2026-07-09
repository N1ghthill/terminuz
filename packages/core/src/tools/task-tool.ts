import { Effect } from "effect";
import { z } from "zod";
import { createId } from "@terminuz/shared";
import type { ProviderId } from "@terminuz/shared";
import { defineTool, type ToolDefinition } from "./tool.js";
import type { SubagentManager } from "../agent/subagent-manager.js";
import type { SessionManager } from "../sessions/session-manager.js";
import { loadAgentConfigs } from "../agent/agent-config-loader.js";

const MAX_SUBAGENT_DEPTH = 3;
const PARALLEL_UNSAFE_TOOLS = new Set([
  "write_file",
  "edit_file",
  "git",
  "bash",
  "shell",
  "test",
  "lint",
]);

const TaskSchema = z.object({
  prompt: z
    .string()
    .describe("Full task description for the subagent — be specific and self-contained."),
  subagent_type: z
    .string()
    .optional()
    .describe(
      "Named agent type from .terminuz/agents/*.md (e.g. 'code-reviewer'). " +
        "When set, the subagent uses the named agent's system prompt and tool restrictions.",
    ),
  provider: z
    .string()
    .optional()
    .describe("Provider override (e.g. 'anthropic', 'openai'). Defaults to current provider."),
  model: z.string().optional().describe("Model override. Defaults to current model."),
  fork: z
    .boolean()
    .optional()
    .describe("If true, the subagent starts with the current conversation history as context."),
  mode: z
    .enum(["task", "background"])
    .optional()
    .describe(
      "Use 'task' (default) to wait for the subagent result, or 'background' to start it and continue immediately.",
    ),
});

const ParallelTaskSchema = z.object({
  prompt: z.string().describe("Self-contained read-only task."),
  subagent_type: z
    .string()
    .describe("Named read-only agent type from built-ins or .terminuz/agents/*.md."),
  provider: z.string().optional(),
  model: z.string().optional(),
  fork: z.boolean().optional(),
});

const TaskBatchSchema = z.object({
  tasks: z.array(ParallelTaskSchema).min(2).max(16),
  concurrency: z.number().int().positive().max(16).optional(),
});

export function createTaskTool(
  subagents: SubagentManager,
  worktree: string,
  sessions: SessionManager,
): ToolDefinition {
  return defineTool({
    name: "task",
    activityKind: "subagent",
    description:
      "Launch a subagent to handle a self-contained task in a child session. " +
      "Use for parallelizable work, delegating a well-scoped subtask, or specialized analysis. " +
      "Built-in subagent_type values: code-reviewer (read-only code analysis), test-runner (run tests and interpret output), refactor (surgical code changes without behavior change). " +
      "Set fork=true to give the subagent the current conversation history as starting context. " +
      "Custom agents can be defined in .terminuz/agents/<name>.md.",
    parameters: TaskSchema,
    execute: (args, context) =>
      Effect.tryPromise({
        try: async () => {
          const taskId = createId("task");

          // Enforce subagent nesting limit to prevent infinite recursion
          const currentDepth = context.subagentDepth ?? 0;
          if (currentDepth >= MAX_SUBAGENT_DEPTH) {
            throw new Error(
              `Maximum subagent depth (${MAX_SUBAGENT_DEPTH}) reached. ` +
                `Cannot spawn a nested subagent from depth ${currentDepth}.`,
            );
          }

          // Resolve named agent config if subagent_type is given
          let systemPrompt: string | undefined;
          let allowedTools: string[] | undefined;
          let disallowedTools: string[] | undefined;
          let resolvedModel = args.model;

          if (args.subagent_type) {
            const configs = await loadAgentConfigs(worktree);
            const agentConfig = configs.find((c) => c.name === args.subagent_type);
            if (!agentConfig) {
              throw new Error(
                `Unknown subagent_type '${args.subagent_type}'. ` +
                  `Available: ${configs.map((c) => c.name).join(", ") || "(none — create .terminuz/agents/<name>.md)"}`,
              );
            }
            systemPrompt = agentConfig.systemPrompt || undefined;
            allowedTools = agentConfig.allowedTools;
            disallowedTools = agentConfig.disallowedTools;
            if (!resolvedModel && agentConfig.model) resolvedModel = agentConfig.model;
          }

          // Propagate parent session's resolved provider/model and validation cache.
          // Without this the subagent would inherit SubagentManager.defaultProvider
          // (the config's defaultProvider) which may have no model configured.
          const parentSession = sessions.get(context.sessionId);
          const parentValidatedModels = parentSession?.metadata?.validatedModels as
            | Record<string, boolean>
            | undefined;

          const task = {
            id: taskId,
            prompt: args.prompt,
            mode: args.mode ?? "task",
            provider: (args.provider ?? parentSession?.provider) as ProviderId | undefined,
            model: resolvedModel ?? parentSession?.model,
            systemPrompt,
            allowedTools,
            disallowedTools,
            parentValidatedModels,
            metadata: {
              subagentDepth: currentDepth + 1,
              parentSessionId: context.sessionId,
              ...(args.subagent_type ? { subagentType: args.subagent_type } : {}),
            },
          };

          if (args.mode === "background") {
            void subagents
              .runOne(
                {
                  ...task,
                  parentMessages: args.fork ? parentSession?.messages : undefined,
                },
                undefined,
              )
              .catch(() => {});
            return `Background task started: ${taskId}`;
          }

          const result = args.fork
            ? await subagents.forkFrom(context.sessionId, task, context.abortSignal)
            : await subagents.runOne(task, context.abortSignal);

          if (result.error) {
            throw new Error(`Subagent failed: ${result.error}`);
          }
          return result.output || "(subagent completed with no output)";
        },
        catch: (error) => (error instanceof Error ? error : new Error(String(error))),
      }),
  });
}

export function createTaskBatchTool(
  subagents: SubagentManager,
  worktree: string,
  sessions: SessionManager,
): ToolDefinition {
  return defineTool({
    name: "task_batch",
    activityKind: "subagent",
    description:
      "Run 2-16 independent read-only named subagents concurrently. " +
      "Only agent configurations with an explicit read-only allowed_tools list are accepted. " +
      "Use this for parallel inspection, research, or code review. Mutating agents must use task sequentially.",
    parameters: TaskBatchSchema,
    execute: (args, context) =>
      Effect.tryPromise({
        try: async () => {
          const currentDepth = context.subagentDepth ?? 0;
          if (currentDepth >= MAX_SUBAGENT_DEPTH) {
            throw new Error(`Maximum subagent depth (${MAX_SUBAGENT_DEPTH}) reached.`);
          }

          const configs = await loadAgentConfigs(worktree);
          const parentSession = sessions.get(context.sessionId);
          const parentValidatedModels = parentSession.metadata.validatedModels as
            | Record<string, boolean>
            | undefined;
          const tasks = args.tasks.map((item) => {
            const agentConfig = configs.find((config) => config.name === item.subagent_type);
            if (!agentConfig) {
              throw new Error(`Unknown subagent_type '${item.subagent_type}'.`);
            }
            if (
              !agentConfig.allowedTools ||
              agentConfig.allowedTools.some((tool) => PARALLEL_UNSAFE_TOOLS.has(tool))
            ) {
              throw new Error(
                `subagent_type '${item.subagent_type}' is not safe for parallel execution. ` +
                  "Parallel agents require an explicit read-only allowed_tools list.",
              );
            }
            return {
              id: createId("task"),
              prompt: item.prompt,
              provider: (item.provider ?? parentSession.provider) as ProviderId,
              model: item.model ?? agentConfig.model ?? parentSession.model,
              systemPrompt: agentConfig.systemPrompt || undefined,
              allowedTools: agentConfig.allowedTools,
              disallowedTools: agentConfig.disallowedTools,
              parentMessages: item.fork ? parentSession.messages : undefined,
              parentValidatedModels,
              metadata: {
                subagentDepth: currentDepth + 1,
                parentSessionId: context.sessionId,
                subagentType: item.subagent_type,
              },
            };
          });

          const results = await subagents.runParallel(tasks, {
            concurrency: args.concurrency,
            signal: context.abortSignal,
          });

          return results
            .map((result, index) => {
              const label = args.tasks[index]?.subagent_type ?? result.taskId;
              return result.error
                ? `## ${label}\nError: ${result.error}`
                : `## ${label}\n${result.output || "(no output)"}`;
            })
            .join("\n\n");
        },
        catch: (error) => (error instanceof Error ? error : new Error(String(error))),
      }),
  });
}
