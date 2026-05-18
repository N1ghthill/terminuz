import { Effect } from "effect";
import { lstat, readdir } from "node:fs/promises";
import path from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  createId,
  isModelContextMessage,
  nowIso,
  resolveConfiguredModelForProvider,
  type AgentMode,
  type Activity,
  type DeepCodeConfig,
  type Message,
  type ProviderId,
  type Session,
  type ToolCall,
} from "@deepcode/shared";
import type { EventBus } from "../events/event-bus.js";
import { ProviderManager } from "../providers/provider-manager.js";
import type { ToolCache } from "../cache/tool-cache.js";
import type { PermissionGateway } from "../security/permission-gateway.js";
import type { PathSecurity } from "../security/path-security.js";
import type { SessionManager } from "../sessions/session-manager.js";
import type { ProviderToolChoice } from "../providers/provider.js";
import type { ToolContext, ToolRegistry } from "../tools/tool.js";
import { BudgetExceededError, ProviderError } from "../errors.js";
import {
  resolveModelExecutionProfile,
  type ToolSchemaMode,
} from "../providers/model-execution-profile.js";
import { formatErrorChain } from "../utils/error-chain.js";
import {
  BUILD_SYSTEM_PROMPT,
  failoverOrder,
  PLAN_ALLOWED_TOOLS,
  PLAN_SYSTEM_PROMPT,
  UTILITY_SYSTEM_PROMPT,
} from "./agent-prompts.js";
import { TaskPlanner, type TaskPlan, type Task } from "./task-planner.js";
import {
  buildSummaryMessage,
  buildSummaryPrompt,
  shouldCompressContext,
  splitForCompression,
} from "./context-manager.js";
import { SessionBudget } from "./token-budget.js";
import {
  XmlToolCallStreamFilter,
  applyFallbackToolCallParsing,
  buildFallbackToolCallPrompt,
  compactToolDescription,
  simplifyToolSchema,
  truncateToolOutput,
} from "./agent-tooling.js";
import { execFileAsync } from "../tools/process.js";
import {
  formatUtilityResult,
  directLocalResponse,
  isLegacyInternalTaskPrompt,
  isLegacyUiOperationalMessage,
  parseUtilityRequest,
  resolveTurnStrategy,
  runtimeContextPrompt,
  type TurnStrategy,
  utilityDateResponse,
} from "./agent-turn-strategy.js";
import { resolveExecutionTarget } from "./execution-target.js";

export interface AgentRunOptions {
  session: Session;
  input: string;
  mode?: AgentMode;
  provider?: ProviderId;
  signal?: AbortSignal;
  onChunk?: (text: string) => void;
  onChunkForTask?: (taskId: string, text: string) => void;
  onUsage?: (inputTokens: number, outputTokens: number) => void;
  onIteration?: (iteration: number, maxIterations: number) => void;
  onTaskUpdate?: (task: Task, plan: TaskPlan) => void;
  /** Override system prompt (used by named agent types). */
  systemPrompt?: string;
  /** If set, only these tool names are available to the agent. */
  allowedTools?: string[];
  /** Tool names excluded from this agent's tool set. */
  disallowedTools?: string[];
  /** Called when a tool execution starts (active=true) or ends (active=false). */
  onToolActivity?: (toolName: string, active: boolean) => void;
}

interface ToolExecutionOutcome {
  ok: boolean;
  output: string;
  errorMessage?: string;
}

interface UndoEntry {
  /** Absolute path of the file that was modified. */
  path: string;
  /** Content before the modification, or null if the file was newly created. */
  previousContent: string | null;
}

interface ProjectMatch {
  path: string;
  markers: string[];
}

const PROJECT_MARKER = ".git";

const PROJECT_DISCOVERY_SKIP_DIRS = new Set([
  ".git",
  ".hg",
  ".svn",
  "node_modules",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  "target",
  "__pycache__",
  "vendor",
]);

export class Agent {
  private readonly planner = new TaskPlanner();
  /** Per-session undo stacks. Each write_file / edit_file pushes one entry. */
  private readonly undoStacks = new Map<string, UndoEntry[]>();
  /** Active token budget for the current run(), keyed by sessionId. */
  private readonly activeBudgets = new Map<string, SessionBudget>();

  constructor(
    private readonly providerManager: ProviderManager,
    private readonly tools: ToolRegistry,
    private readonly sessions: SessionManager,
    private readonly config: DeepCodeConfig,
    private readonly cache: ToolCache,
    private readonly permissions: PermissionGateway,
    private readonly pathSecurity: PathSecurity,
    private readonly eventBus: EventBus,
  ) {}

  async run(options: AgentRunOptions): Promise<string> {
    const session = options.session;
    const mode = options.mode ?? this.config.agentMode;
    const baseTurnStrategy = this.resolveTurnStrategy(options.input, mode);
    const turnStrategy = options.systemPrompt
      ? { ...baseTurnStrategy, systemPrompt: options.systemPrompt }
      : baseTurnStrategy;
    const resolvedTarget = resolveExecutionTarget(
      this.config,
      session,
      mode,
      options.provider,
    );
    const resolvedModel = resolvedTarget.model;

    session.provider = resolvedTarget.provider;
    session.model = resolvedModel;

    this.sessions.addMessage(session.id, { role: "user", source: "user", content: options.input });

    // Handle numeric project selection from a previous list_projects turn
    const pendingList = session.metadata.pendingProjectList;
    const numberMatch = /^\s*(\d+)\s*$/.exec(options.input);
    if (numberMatch && Array.isArray(pendingList) && pendingList.length > 0) {
      const idx = parseInt(numberMatch[1]!, 10) - 1;
      const selectedPath = typeof pendingList[idx] === "string" ? (pendingList[idx] as string) : null;
      session.metadata.pendingProjectList = undefined;
      if (selectedPath) {
        session.worktree = selectedPath;
        this.sessions.save(session);
        await this.sessions.persist(session.id);
        const name = path.basename(selectedPath);
        const output = `✅ Trabalhando em **${name}**\n\nCaminho: ${selectedPath}`;
        this.sessions.addMessage(session.id, { role: "assistant", source: "assistant", content: output });
        return output;
      }
    } else {
      // Clear stale pending list on any non-numeric turn
      session.metadata.pendingProjectList = undefined;
    }

    session.metadata.plan = undefined;
    session.metadata.planError = undefined;

    const directResponse = turnStrategy.kind === "chat" && !turnStrategy.allowTools
      ? directLocalResponse(turnStrategy.intent)
      : undefined;
    if (directResponse) {
      session.status = "executing";
      this.sessions.addMessage(session.id, {
        role: "assistant",
        source: "assistant",
        content: directResponse,
      });
      session.status = "idle";
      this.sessions.save(session);
      await this.sessions.persist(session.id);
      return directResponse;
    }

    // Validate model is configured
    const effectiveModel = resolvedModel;
    if (!effectiveModel) {
      throw new Error(
        "No model configured. Set 'defaultModel'/'defaultModels' in .deepcode/config.json or DEEPCODE_MODEL environment variable."
      );
    }
    session.status = "planning";
    this.activeBudgets.set(session.id, new SessionBudget(this.config.tokenBudget));

    try {
      // Planning phase
      const planningProvider = this.providerManager.get(resolvedTarget.provider);
      let plan: TaskPlan | undefined;

      if (turnStrategy.shouldPlan) {
        try {
          plan = await this.planner.plan(options.input, (prompt) =>
            planningProvider.complete(prompt, {
              model: resolvedModel,
              maxTokens: Math.min(this.config.maxTokens, 512),
              temperature: 0,
              signal: options.signal,
              onUsage: (inputTokens, outputTokens) => {
                this.recordUsage(session.id, inputTokens, outputTokens);
              },
            }),
          );
          session.metadata.plan = plan;
        } catch (error) {
          if (error instanceof BudgetExceededError) {
            throw error;
          }
          session.metadata.planError = formatErrorChain(error);
          // Continue without plan if planning fails
          this.eventBus.emit("app:warn", {
            message: formatPlanningFailureWarning(error),
            context: { error: session.metadata.planError },
          });
        }
      }

      let finalText = "";
      let iterations = 0;
      const maxIterations = this.config.maxIterations;
      session.status = "executing";

      if (turnStrategy.kind === "utility") {
        finalText = await this.executeUtilityTurn(session, options.input, mode, options);
      } else if (plan && mode === "build") {
        // Execute tasks from plan if available
        finalText = await this.executePlan(plan, session, mode, options);
      } else {
        // Fallback to traditional execution loop
        finalText = await this.executeTraditional(session, mode, maxIterations, iterations, options, turnStrategy);
      }

      session.status = "idle";
      this.sessions.save(session);
      await this.sessions.persist(session.id);
      return finalText.trim();
    } catch (error) {
      session.status = "error";
      this.sessions.save(session);
      throw error;
    } finally {
      this.activeBudgets.delete(session.id);
    }
  }

  /**
   * Execute tasks from plan in parallel rounds, respecting dependencies
   */
  private async executePlan(
    plan: TaskPlan,
    session: Session,
    mode: AgentMode,
    options: AgentRunOptions,
  ): Promise<string> {
    let finalText = `Executing plan: ${plan.objective}\n\n`;
    let rounds = 0;
    const maxRounds = this.config.maxIterations;

    while (rounds < maxRounds) {
      const runnableTasks = this.planner.getRunnableTasks(plan);

      if (runnableTasks.length === 0) {
        if (this.planner.hasFailures(plan)) {
          const failedTasks = plan.tasks.filter((t) => t.status === "failed");
          finalText += `\n✗ Execution stopped due to failed tasks: ${failedTasks.map((t) => t.id).join(", ")}`;
        } else if (this.planner.isComplete(plan)) {
          finalText += "\n✓ All tasks completed successfully!";
        } else {
          finalText += "\n⚠ Plan contained no runnable tasks.";
        }
        break;
      }

      for (const task of runnableTasks) {
        this.planner.updateTaskStatus(plan, task.id, "running");
        options.onTaskUpdate?.(task, plan);
      }

      const progress = this.planner.getProgress(plan);
      const parallel = runnableTasks.length > 1;
      const taskLines = await Promise.all(
        runnableTasks.map(async (task, taskIndex) => {
          const taskPrompt = this.buildTaskPrompt(plan, task, progress);
          const executionSession = parallel ? this.createChildSession(session, task.id) : session;
          const maxAttempts = 1 + this.config.taskRetries;
          let lastError: string | undefined;

          const taskOptions = options.onChunkForTask
            ? { ...options, onChunk: (text: string) => options.onChunkForTask!(task.id, text) }
            : options;
          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const prompt = lastError
              ? `${taskPrompt}\n\nPrevious attempt failed: ${lastError}\nTry a different approach.`
              : taskPrompt;
            try {
              const result = await this.executeTaskWithLLM(prompt, executionSession, mode, taskOptions, task.type);
              this.planner.updateTaskStatus(plan, task.id, "completed", result);
              options.onTaskUpdate?.(task, plan);
              return `[${progress.completed + taskIndex + 1}/${progress.total}] ✓ ${task.description}`;
            } catch (error) {
              if (error instanceof BudgetExceededError) {
                throw error;
              }
              lastError = error instanceof Error ? error.message : String(error);
            }
          }

          this.planner.updateTaskStatus(plan, task.id, "failed", undefined, lastError);
          options.onTaskUpdate?.(task, plan);
          return `[${progress.completed + taskIndex + 1}/${progress.total}] ✗ ${task.description} — ${lastError}`;
        }),
      );

      finalText += `${taskLines.join("\n")}\n`;
      rounds++;
      options.onIteration?.(rounds, maxRounds);

      if (this.planner.hasFailures(plan) && this.config.strictMode) break;
      if (this.planner.isComplete(plan)) {
        finalText += "\n✓ All tasks completed successfully!";
        break;
      }
    }

    if (rounds >= maxRounds) {
      finalText += "\n⚠ Reached maximum rounds limit. Some tasks may not have been executed.";
    }

    return finalText;
  }

  /**
   * Build a prompt for the current task with context
   */
  private buildTaskPrompt(plan: TaskPlan, task: Task, progress: { completed: number; total: number; percentage: number }): string {
    const completedTasks = plan.tasks.filter((t) => t.status === "completed");
    const contextLimit = (t: Task) => t.type === "research" ? 800 : 200;
    const context = completedTasks.length > 0
      ? `\n\nContext from completed tasks:\n${completedTasks.map((t) => `- ${t.description}: ${t.result?.slice(0, contextLimit(t)) || "Done"}...`).join("\n")}`
      : "";

    return `You are working on the following objective: "${plan.objective}"

Current task (${progress.completed + 1}/${progress.total} - ${progress.percentage}% complete):
ID: ${task.id}
Type: ${task.type}
Description: ${task.description}
${task.dependencies.length > 0 ? `Dependencies: ${task.dependencies.join(", ")}` : ""}

${context}

Execute this task using the available tools. Return a summary of what was done.`;
  }

  /**
   * Execute a single task using LLM and tools
   */
  private async executeTaskWithLLM(
    prompt: string,
    session: Session,
    mode: AgentMode,
    options: AgentRunOptions,
    taskType?: Task["type"],
  ): Promise<string> {
    const taskPrompt = this.createInternalPromptMessage(prompt);
    const allowedToolNames = this.allowedToolNamesForTaskType(mode, taskType);
    const resolvedModel = session.model ?? resolveConfiguredModelForProvider(this.config, session.provider);
    const toolProfile = resolveModelExecutionProfile(session.provider, resolvedModel);
    const toolDefinitions = this.toolDefinitionsForNames(allowedToolNames, toolProfile.toolSchemaMode);
    const textToolFallbackEnabled = toolDefinitions.length > 0 && toolProfile.toolCallStrategy !== "native";
    const maxTaskIterations = 10; // Prevent infinite loops
    let taskIterations = 0;
    let finalAssistantText = "";

    while (taskIterations < maxTaskIterations) {
      taskIterations++;
      this.enforceBudget(session.id);

      const chunks = this.providerManager.chat(
        this.messagesForSystemPrompt(
          session,
          this.systemPromptForMode(mode),
          true,
          [taskPrompt],
          textToolFallbackEnabled
            ? buildFallbackToolCallPrompt(allowedToolNames)
            : undefined,
        ),
        {
          preferredProvider: options.provider ?? session.provider,
          failover: this.failoverOrder(options.provider ?? session.provider),
          model: resolvedModel,
          maxTokens: this.config.maxTokens,
          temperature: this.config.temperature,
          tools: toolDefinitions,
          toolChoice: this.resolveTaskToolChoice(
            taskIterations,
            toolDefinitions.length,
            toolProfile.supportsRequiredToolChoice,
          ),
          signal: options.signal,
        },
      );

      let assistantText = "";
      const toolCalls: ToolCall[] = [];
      const xmlFilter = textToolFallbackEnabled ? new XmlToolCallStreamFilter() : null;

      for await (const chunk of chunks) {
        if (chunk.type === "delta") {
          assistantText += chunk.content;
          if (textToolFallbackEnabled) {
            const visible = xmlFilter!.filter(chunk.content);
            if (visible) options.onChunk?.(visible);
          } else {
            options.onChunk?.(chunk.content);
          }
        }
        if (chunk.type === "tool_call") {
          toolCalls.push(chunk.call);
        }
        if (chunk.type === "usage") {
          options.onUsage?.(chunk.inputTokens, chunk.outputTokens);
          this.recordUsage(session.id, chunk.inputTokens, chunk.outputTokens);
        }
      }

      if (textToolFallbackEnabled) {
        const flushed = xmlFilter!.flush();
        if (flushed) options.onChunk?.(flushed);
      }

      const turnResult = textToolFallbackEnabled
        ? applyFallbackToolCallParsing(assistantText, toolCalls, allowedToolNames)
        : { assistantText, toolCalls };
      assistantText = turnResult.assistantText;
      const nextToolCalls = [...turnResult.toolCalls];
      toolCalls.length = 0;
      toolCalls.push(...nextToolCalls);

      if (assistantText.trim() || toolCalls.length > 0) {
        this.sessions.addMessage(session.id, {
          role: "assistant",
          source: "assistant",
          content: assistantText,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        });
        finalAssistantText = finalAssistantText ? `${finalAssistantText}\n${assistantText}` : assistantText;
      }

      // No tool calls - task is complete
      if (toolCalls.length === 0) {
        break;
      }

      for (const call of toolCalls) {
        const result = await this.executeTool(call, session, mode, options.signal, allowedToolNames, options.onToolActivity);
        this.sessions.addMessage(session.id, {
          role: "tool",
          source: "tool",
          content: truncateToolOutput(result.output),
          toolCallId: call.id,
        });
      }
    }

    return finalAssistantText.trim();
  }

  /**
   * Traditional execution loop (fallback when planning fails or in plan mode)
   */
  private async executeTraditional(
    session: Session,
    mode: AgentMode,
    maxIterations: number,
    startingIterations: number,
    options: AgentRunOptions,
    turnStrategy: TurnStrategy,
  ): Promise<string> {
    let finalText = "";
    let iterations = startingIterations;
    const resolvedModel = session.model ?? resolveConfiguredModelForProvider(this.config, session.provider);
    const toolProfile = resolveModelExecutionProfile(session.provider, resolvedModel);
    const baseAllowedToolNames = turnStrategy.allowTools ? this.allowedToolNamesForMode(mode) : new Set<string>();
    const allowedToolNames = this.applyToolOverrides(baseAllowedToolNames, options);
    const toolDefinitions = turnStrategy.allowTools ? this.toolDefinitionsForNames(allowedToolNames, toolProfile.toolSchemaMode) : [];
    const textToolFallbackEnabled = toolDefinitions.length > 0 && toolProfile.toolCallStrategy !== "native";

    while (iterations < maxIterations) {
      iterations += 1;
      options.onIteration?.(iterations, maxIterations);
      this.enforceBudget(session.id);

      await this.compressContextIfNeeded(session, turnStrategy.systemPrompt, options);
      const chunks = this.providerManager.chat(
        this.messagesForSystemPrompt(
          session,
          turnStrategy.systemPrompt,
          turnStrategy.allowTools,
          [],
          textToolFallbackEnabled
            ? buildFallbackToolCallPrompt(allowedToolNames)
            : undefined,
        ),
        {
          preferredProvider: options.provider ?? session.provider,
          failover: this.failoverOrder(options.provider ?? session.provider),
          model: resolvedModel,
          maxTokens: this.config.maxTokens,
          temperature: this.config.temperature,
          tools: toolDefinitions,
          toolChoice: this.resolveTraditionalToolChoice(
            turnStrategy,
            mode,
            iterations === startingIterations + 1,
            toolDefinitions.length,
            toolProfile.supportsRequiredToolChoice,
          ),
          signal: options.signal,
        },
      );

      let assistantText = "";
      const toolCalls: ToolCall[] = [];
      const xmlFilter = textToolFallbackEnabled ? new XmlToolCallStreamFilter() : null;
      for await (const chunk of chunks) {
        if (chunk.type === "delta") {
          assistantText += chunk.content;
          if (textToolFallbackEnabled) {
            const visible = xmlFilter!.filter(chunk.content);
            if (visible) {
              finalText += visible;
              options.onChunk?.(visible);
            }
          } else {
            finalText += chunk.content;
            options.onChunk?.(chunk.content);
          }
        }
        if (chunk.type === "tool_call") {
          toolCalls.push(chunk.call);
        }
        if (chunk.type === "usage") {
          options.onUsage?.(chunk.inputTokens, chunk.outputTokens);
          this.recordUsage(session.id, chunk.inputTokens, chunk.outputTokens);
        }
      }

      if (textToolFallbackEnabled) {
        const flushed = xmlFilter!.flush();
        if (flushed) {
          finalText += flushed;
          options.onChunk?.(flushed);
        }
      }

      const turnResult = textToolFallbackEnabled
        ? applyFallbackToolCallParsing(assistantText, toolCalls, allowedToolNames)
        : { assistantText, toolCalls };
      assistantText = turnResult.assistantText;
      const nextToolCalls = [...turnResult.toolCalls];
      toolCalls.length = 0;
      toolCalls.push(...nextToolCalls);

      if (assistantText.trim() || toolCalls.length > 0) {
        this.sessions.addMessage(session.id, {
          role: "assistant",
          source: "assistant",
          content: assistantText,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        });
      }
      if (toolCalls.length === 0) break;

      for (const call of toolCalls) {
        const result = await this.executeTool(call, session, mode, options.signal, allowedToolNames, options.onToolActivity);
        this.sessions.addMessage(session.id, {
          role: "tool",
          source: "tool",
          content: truncateToolOutput(result.output),
          toolCallId: call.id,
        });
      }
    }

    return finalText;
  }

  /**
   * Reverts the last file mutation recorded for the given session.
   * Returns a description of what was restored, or null if nothing to undo.
   */
  async undo(sessionId: string): Promise<{ path: string; restored: boolean } | null> {
    const stack = this.undoStacks.get(sessionId);
    if (!stack || stack.length === 0) return null;
    const entry = stack.pop()!;
    const { writeFile, unlink } = await import("node:fs/promises");
    if (entry.previousContent === null) {
      // File was newly created — delete it
      try {
        await unlink(entry.path);
      } catch {
        // Already gone — still counts as restored
      }
    } else {
      await writeFile(entry.path, entry.previousContent, "utf8");
    }
    return { path: entry.path, restored: true };
  }

  private async executeTool(
    call: ToolCall,
    session: Session,
    mode: AgentMode,
    signal?: AbortSignal,
    allowedToolNames = this.allowedToolNamesForMode(mode),
    onToolActivity?: (toolName: string, active: boolean) => void,
  ): Promise<ToolExecutionOutcome> {
    if (!this.isToolAllowed(call.name, mode)) {
      const modeHint = mode === "plan" ? "Switch to BUILD mode (press Tab in the TUI) to enable this tool." : "";
      return {
        ok: false,
        output: `Error: tool ${call.name} is not available in ${mode.toUpperCase()} mode. ${modeHint} Provide analysis and a proposed plan without applying changes.`,
        errorMessage: `Tool ${call.name} is not available in ${mode.toUpperCase()} mode. ${modeHint}`,
      };
    }
    if (!allowedToolNames.has(call.name)) {
      return {
        ok: false,
        output: `Error: tool ${call.name} is not available for this turn. Answer directly unless the user asked for repository work.`,
        errorMessage: `Tool ${call.name} is not available for this turn.`,
      };
    }
    const tool = this.tools.get(call.name);
    if (!tool) {
      return {
        ok: false,
        output: `Error: tool not found: ${call.name}`,
        errorMessage: `Tool not found: ${call.name}`,
      };
    }
    const parsed = tool.parameters.safeParse(call.arguments);
    if (!parsed.success) {
      return {
        ok: false,
        output: `Error: invalid arguments for ${call.name}: ${parsed.error.message}`,
        errorMessage: `Invalid arguments for ${call.name}: ${parsed.error.message}`,
      };
    }

    const context: ToolContext = {
      sessionId: session.id,
      messageId: createId("msg"),
      worktree: session.worktree,
      directory: session.worktree,
      abortSignal: signal ?? new AbortController().signal,
      config: this.config,
      agentMode: mode,
      cache: this.cache,
      permissions: this.permissions,
      pathSecurity: this.pathSecurity,
      logActivity: (activity) => {
        const full: Activity = { ...activity, id: createId("activity"), createdAt: nowIso() };
        session.activities.push(full);
        this.eventBus.emit("activity", full);
      },
      snapshotForUndo: async (filePath: string) => {
        let previousContent: string | null = null;
        try {
          previousContent = await import("node:fs/promises").then((fs) => fs.readFile(filePath, "utf8"));
        } catch {
          // File doesn't exist yet — previousContent stays null (new file)
        }
        const stack = this.undoStacks.get(session.id) ?? [];
        stack.push({ path: filePath, previousContent });
        this.undoStacks.set(session.id, stack);
      },
    };

    try {
      this.logToolActivity(session, {
        type: "tool_call",
        message: `Calling ${call.name}`,
        metadata: { tool: call.name, args: call.arguments },
      });
      onToolActivity?.(call.name, true);
      const result = await Effect.runPromise(tool.execute(parsed.data, context));
      onToolActivity?.(call.name, false);
      const output = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      this.logToolActivity(session, {
        type: "tool_result",
        message: `Completed ${call.name}`,
        metadata: { tool: call.name, result: truncateForMetadata(output) },
      });
      return { ok: true, output };
    } catch (error) {
      const message = formatErrorChain(error);
      const isPermissionError = error instanceof Error && (error as any).code === "PERMISSION_DENIED";
      const hint = isPermissionError ? " Try a different approach or ask the user to adjust permissions in .deepcode/config.json." : "";
      this.logToolActivity(session, {
        type: "tool_error",
        message: `Failed ${call.name}: ${message}`,
        metadata: { tool: call.name, error: message },
      });
      this.eventBus.emit("app:error", { error: error instanceof Error ? error : new Error(message), context: { tool: call.name } });
      return {
        ok: false,
        output: `Error running ${call.name}: ${message}${hint}`,
        errorMessage: message,
      };
    }
  }

  private logToolActivity(session: Session, activity: Omit<Activity, "id" | "createdAt">): void {
    const full: Activity = { ...activity, id: createId("activity"), createdAt: nowIso() };
    session.activities.push(full);
    this.eventBus.emit("activity", full);
  }

  private toolDefinitions(mode: AgentMode, schemaMode: ToolSchemaMode = "full"): Array<Record<string, unknown>> {
    return this.tools.list().filter((tool) => this.isToolAllowed(tool.name, mode)).map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: compactToolDescription(tool.description, schemaMode),
        parameters: simplifyToolSchema(
          zodToJsonSchema(tool.parameters, { target: "jsonSchema7" }),
          schemaMode,
        ),
      },
    }));
  }

  private resolveTaskToolChoice(
    taskIteration: number,
    toolCount: number,
    supportsRequiredToolChoice: boolean,
  ): ProviderToolChoice | undefined {
    if (toolCount === 0) {
      return undefined;
    }

    if (taskIteration === 1 && supportsRequiredToolChoice) {
      return "required";
    }

    return "auto";
  }

  private resolveTraditionalToolChoice(
    turnStrategy: TurnStrategy,
    mode: AgentMode,
    firstIteration: boolean,
    toolCount: number,
    supportsRequiredToolChoice: boolean,
  ): ProviderToolChoice | undefined {
    if (toolCount === 0) {
      return undefined;
    }

    if (
      firstIteration &&
      supportsRequiredToolChoice &&
      mode === "build" &&
      turnStrategy.kind === "task" &&
      this.config.buildTurnPolicy.mode === "always-tools"
    ) {
      return "required";
    }

    return "auto";
  }

  private isToolAllowed(toolName: string, mode: AgentMode): boolean {
    if (mode === "build") return true;
    return PLAN_ALLOWED_TOOLS.has(toolName);
  }

  private allowedToolNamesForMode(mode: AgentMode): Set<string> {
    return new Set(
      this.tools.list().filter((tool) => this.isToolAllowed(tool.name, mode)).map((tool) => tool.name),
    );
  }

  private applyToolOverrides(base: Set<string>, options: AgentRunOptions): Set<string> {
    if (!options.allowedTools && !options.disallowedTools) return base;
    let names = options.allowedTools ? new Set(options.allowedTools) : new Set(base);
    if (options.disallowedTools) {
      for (const name of options.disallowedTools) names.delete(name);
    }
    // Intersect with base so we never grant tools outside the mode's allowed set
    return new Set([...names].filter((n) => base.has(n)));
  }

  private allowedToolNamesForTaskType(mode: AgentMode, taskType?: Task["type"]): Set<string> {
    if (taskType === "research") return new Set([...PLAN_ALLOWED_TOOLS]);
    if (taskType === "verify") return new Set(["read_file", "list_dir", "analyze_code", "search_text", "bash"]);
    return this.allowedToolNamesForMode(mode);
  }

  private toolDefinitionsForNames(names: Set<string>, schemaMode: ToolSchemaMode = "full"): Array<Record<string, unknown>> {
    return this.tools.list().filter((tool) => names.has(tool.name)).map((tool) => ({
      type: "function",
      function: {
        name: tool.name,
        description: compactToolDescription(tool.description, schemaMode),
        parameters: simplifyToolSchema(
          zodToJsonSchema(tool.parameters, { target: "jsonSchema7" }),
          schemaMode,
        ),
      },
    }));
  }

  private createChildSession(parent: Session, taskId: string): Session {
    const child = this.sessions.create({ provider: parent.provider, model: parent.model });
    child.worktree = parent.worktree;
    child.metadata = { parentSessionId: parent.id, taskId };
    this.sessions.save(child);
    return child;
  }

  private systemPromptForMode(mode: AgentMode): string {
    return mode === "plan" ? PLAN_SYSTEM_PROMPT : BUILD_SYSTEM_PROMPT;
  }

  private messagesForSystemPrompt(
    session: Session,
    systemPrompt: string,
    toolsEnabled: boolean,
    extraMessages: Message[] = [],
    fallbackToolPrompt?: string,
  ) {
    return [
      {
        id: "mode_system",
        role: "system" as const,
        content: systemPrompt,
        createdAt: session.createdAt,
      },
      {
        id: "runtime_context_system",
        role: "system" as const,
        content: this.runtimeContextPrompt(session, toolsEnabled),
        createdAt: session.createdAt,
      },
      ...(fallbackToolPrompt
        ? [{
            id: "tool_fallback_system",
            role: "system" as const,
            content: fallbackToolPrompt,
            createdAt: session.createdAt,
          }]
        : []),
      ...session.messages.filter((message) => this.isSessionMessageSafeForModel(message)),
      ...extraMessages,
    ];
  }

  private createInternalPromptMessage(content: string): Message {
    return {
      id: createId("msg"),
      role: "user",
      source: "agent_internal",
      content,
      createdAt: nowIso(),
    };
  }

  private isSessionMessageSafeForModel(message: Message): boolean {
    if (!isModelContextMessage(message)) {
      return false;
    }

    if (message.role === "user" && isLegacyInternalTaskPrompt(message.content)) {
      return false;
    }

    if (message.role === "assistant" && isLegacyUiOperationalMessage(message.content)) {
      return false;
    }

    return true;
  }

  private async compressContextIfNeeded(
    session: Session,
    systemPrompt: string,
    options: AgentRunOptions,
  ): Promise<void> {
    const KEEP_RECENT = 8;
    const DEFAULT_MAX_CONTEXT = 128_000;
    const allMessages = this.messagesForSystemPrompt(session, systemPrompt, true);
    if (!shouldCompressContext(allMessages, DEFAULT_MAX_CONTEXT, this.config.contextWindowThreshold)) {
      return;
    }
    const split = splitForCompression(session.messages, KEEP_RECENT);
    if (!split) return;

    const { toSummarize, toKeep, rest } = split;
    const summaryPrompt = buildSummaryPrompt(toSummarize);
    const resolvedModel =
      session.model ?? resolveConfiguredModelForProvider(this.config, session.provider);

    let summary = "";
    const summaryChunks = this.providerManager.chat(
      [
        { id: "sys", role: "system" as const, content: UTILITY_SYSTEM_PROMPT, createdAt: session.createdAt },
        { id: "req", role: "user" as const, content: summaryPrompt, createdAt: session.createdAt },
      ],
      {
        preferredProvider: options.provider ?? session.provider,
        failover: this.failoverOrder(options.provider ?? session.provider),
        model: resolvedModel,
        maxTokens: Math.min(this.config.maxTokens, 1024),
        temperature: 0,
        signal: options.signal,
      },
    );
    for await (const chunk of summaryChunks) {
      if (chunk.type === "delta") summary += chunk.content;
      if (chunk.type === "usage") {
        this.recordUsage(session.id, chunk.inputTokens, chunk.outputTokens);
      }
    }

    const summaryMessage = buildSummaryMessage(summary);
    this.sessions.replaceMessages(session.id, [summaryMessage, ...toKeep, ...rest]);
    this.eventBus.emit("app:warn", {
      message: `Context window compressed: summarized ${toSummarize.length} messages into 1.`,
    });
  }

  private failoverOrder(primary: ProviderId): ProviderId[] {
    return failoverOrder(primary);
  }

  private async executeUtilityTurn(
    session: Session,
    input: string,
    mode: AgentMode,
    options: AgentRunOptions,
  ): Promise<string> {
    const request = parseUtilityRequest(input);
    if (!request) {
      return await this.executeTraditional(
        session,
        mode,
        this.config.maxIterations,
        0,
        options,
        {
          allowTools: true,
          shouldPlan: false,
          systemPrompt: UTILITY_SYSTEM_PROMPT,
          kind: "utility",
          intent: { kind: "direct_utility" },
        },
      );
    }

    if (request.kind === "pwd") {
      const output = session.worktree;
      this.sessions.addMessage(session.id, {
        role: "assistant",
        source: "assistant",
        content: output,
      });
      return output;
    }

    if (request.kind === "date") {
      const output = this.utilityDateResponse();
      this.sessions.addMessage(session.id, {
        role: "assistant",
        source: "assistant",
        content: output,
      });
      return output;
    }

    if (request.kind === "list_projects") {
      try {
        const output = await this.discoverProjects(session, request.path ?? ".");
        this.sessions.addMessage(session.id, {
          role: "assistant",
          source: "assistant",
          content: formatUtilityResult(request, output),
        });
        return formatUtilityResult(request, output);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const output = `Nao consegui localizar projetos em ${request.rawPath ?? request.path ?? "."}: ${message}`;
        this.sessions.addMessage(session.id, {
          role: "assistant",
          source: "assistant",
          content: output,
        });
        return output;
      }
    }

    const call: ToolCall = {
      id: createId("toolcall"),
      name: "list_dir",
      arguments: { path: request.path ?? "." },
    };
    this.sessions.addMessage(session.id, {
      role: "assistant",
      source: "assistant",
      content: "",
      toolCalls: [call],
    });

    const result = await this.executeTool(call, session, mode, options.signal, this.allowedToolNamesForMode(mode));
    this.sessions.addMessage(session.id, {
      role: "tool",
      source: "tool",
      content: truncateToolOutput(result.output),
      toolCallId: call.id,
    });

    const output = formatUtilityResult(request, result.output);
    this.sessions.addMessage(session.id, {
      role: "assistant",
      source: "assistant",
      content: output,
    });
    return output;
  }

  private async discoverProjects(session: Session, inputPath: string): Promise<string> {
    if (!(await this.isGitAvailable(session.worktree))) {
      return "Git nao esta instalado. Quer que eu instale?";
    }

    // When no explicit path given, scan from home for broader discovery
    const scanInput = inputPath === "." ? (process.env.HOME ?? inputPath) : inputPath;
    const rootPath = await this.pathSecurity.normalize(scanInput, { enforceAccess: false });
    await this.permissions.ensure({ operation: "list_projects", kind: "read", path: rootPath });
    const results: ProjectMatch[] = [];
    await this.walkForProjects(rootPath, 3, results, new Set<string>());
    if (results.length === 0) {
      return "";
    }

    const sorted = results.sort((left, right) => left.path.localeCompare(right.path));
    // Store paths so the next turn can resolve a numeric selection
    session.metadata.pendingProjectList = sorted.map((m) => m.path);

    const lines = sorted.map((match, i) => {
      const name = path.basename(match.path);
      return `${i + 1}. ${name}`;
    });

    return lines.join("\n") + "\n\nDigite o número para selecionar:";
  }

  private async walkForProjects(
    directory: string,
    depthRemaining: number,
    results: ProjectMatch[],
    seen: Set<string>,
  ): Promise<void> {
    if (seen.has(directory) || results.length >= 200) {
      return;
    }
    seen.add(directory);

    const entries = await readdir(directory, { withFileTypes: true });
    const markerSet = new Set(
      entries
        .filter((entry) => entry.name === PROJECT_MARKER)
        .map((entry) => entry.name),
    );

    if (markerSet.size > 0) {
      results.push({
        path: directory,
        markers: Array.from(markerSet).sort(),
      });
    }

    if (depthRemaining <= 0) {
      return;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      if (PROJECT_DISCOVERY_SKIP_DIRS.has(entry.name) || entry.name.startsWith(".")) {
        continue;
      }

      const fullPath = path.join(directory, entry.name);
      try {
        const info = await lstat(fullPath);
        if (info.isSymbolicLink()) {
          continue;
        }
        await this.walkForProjects(fullPath, depthRemaining - 1, results, seen);
      } catch {
        continue;
      }
    }
  }

  private async isGitAvailable(cwd: string): Promise<boolean> {
    try {
      const result = await execFileAsync("git", ["--version"], {
        cwd,
        timeoutMs: 5_000,
      });
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  private resolveTurnStrategy(input: string, mode: AgentMode): TurnStrategy {
    return resolveTurnStrategy(input, mode, this.config.buildTurnPolicy);
  }

  private runtimeContextPrompt(session: Session, toolsEnabled: boolean): string {
    return runtimeContextPrompt(session.worktree, toolsEnabled);
  }

  private utilityDateResponse(): string {
    return utilityDateResponse();
  }

  private recordUsage(sessionId: string, inputTokens: number, outputTokens: number): void {
    const budget = this.activeBudgets.get(sessionId);
    if (!budget) return;
    budget.add(inputTokens, outputTokens);
    this.reportBudgetStatus(budget.check());
  }

  private enforceBudget(sessionId: string): void {
    const budget = this.activeBudgets.get(sessionId);
    if (!budget) return;
    this.reportBudgetStatus(budget.check());
  }

  private reportBudgetStatus(status: ReturnType<SessionBudget["check"]>): void {
    if (status.status === "warning") {
      this.eventBus.emit("budget:warning", status);
      return;
    }

    if (status.status === "exceeded") {
      this.eventBus.emit("budget:exceeded", status);
      throw new BudgetExceededError(
        `Token budget exceeded (${status.kind}): used ${status.used.toFixed(status.kind === "cost" ? 4 : 0)}, limit ${status.limit}`,
      );
    }
  }
}

function formatPlanningFailureWarning(error: unknown): string {
  if (error instanceof ProviderError) {
    const provider = formatProviderName(error.provider);
    const status = typeof error.statusCode === "number" ? ` (${error.statusCode})` : "";
    if (error.statusCode === 429) {
      return `Task planning skipped: ${provider} rate limit hit${status}. Continuing without structured plan.`;
    }
    if (error.statusCode && error.statusCode >= 500) {
      return `Task planning skipped: ${provider} returned a temporary service error${status}. Continuing without structured plan.`;
    }
    return `Task planning failed: ${compactPlanningError(error.message)}. Continuing without structured plan.`;
  }

  const detail = error instanceof Error ? error.message : String(error);
  return `Task planning failed: ${compactPlanningError(detail)}. Continuing without structured plan.`;
}

function compactPlanningError(message: string): string {
  const firstLine = message.replace(/\s+/g, " ").trim();
  return firstLine.length > 240 ? `${firstLine.slice(0, 237)}...` : firstLine;
}

function formatProviderName(provider: string): string {
  switch (provider) {
    case "openrouter":
      return "OpenRouter";
    case "openai":
      return "OpenAI";
    case "anthropic":
      return "Anthropic";
    case "deepseek":
      return "DeepSeek";
    case "groq":
      return "Groq";
    case "ollama":
      return "Ollama";
    case "opencode":
      return "OpenCode";
    default:
      return provider;
  }
}

function truncateForMetadata(value: string, maxLength = 2_000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
