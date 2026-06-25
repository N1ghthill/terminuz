import { Effect } from "effect";
import path from "node:path";
import { zodToJsonSchema } from "zod-to-json-schema";
import {
  createId,
  isModelContextMessage,
  nowIso,
  resolveConfiguredModelForProvider,
  type AgentMode,
  type Activity,
  type ContinuationCheckpoint,
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
import { failoverOrder, PLAN_ALLOWED_TOOLS, UTILITY_SYSTEM_PROMPT } from "./agent-prompts.js";
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
import { ProjectDiscovery } from "./project-discovery.js";
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
  onUsage?: (inputTokens: number, outputTokens: number) => void;
  onIteration?: (iteration: number, maxIterations: number) => void;
  /** Override system prompt (used by named agent types). */
  systemPrompt?: string;
  /** If set, only these tool names are available to the agent. */
  allowedTools?: string[];
  /** Tool names excluded from this agent's tool set. */
  disallowedTools?: string[];
  /** Called when a tool execution starts (active=true) or ends (active=false). */
  onToolActivity?: (toolName: string, active: boolean) => void;
  /**
   * Called after ALL tools in a given iteration batch have run and their
   * results are saved to session.messages. The TUI uses this to commit the
   * completed iteration's messages to Static immediately — before the next LLM
   * call — rather than waiting for the onIteration boundary of the next round.
   * This prevents large tool outputs (e.g. read_file on a big file) from
   * flooding the terminal all at once when the next onIteration fires.
   */
  onToolsComplete?: () => void;
  /**
   * Called when a continuation checkpoint is reached (maxIterations hit).
   * When configured, the TUI can prompt the user to continue or auto-continue.
   */
  onCheckpoint?: (checkpoint: ContinuationCheckpoint) => void;
}

export interface AgentUtilityCompletionOptions {
  session: Session;
  prompt: string;
  provider?: ProviderId;
  model?: string;
  maxTokens: number;
  temperature?: number;
  signal?: AbortSignal;
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

export class Agent {
  /** Per-session undo stacks. Each write_file / edit_file pushes one entry. */
  private readonly undoStacks = new Map<string, UndoEntry[]>();
  /** Active token budget for the current run(), keyed by sessionId. */
  private readonly activeBudgets = new Map<string, SessionBudget>();
  private readonly projectDiscovery = new ProjectDiscovery();

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
    const resolvedTarget = resolveExecutionTarget(this.config, session, mode, options.provider);
    const resolvedModel = resolvedTarget.model;
    const parsedLocalUtility =
      turnStrategy.kind === "utility" ? parseUtilityRequest(options.input) : undefined;

    session.provider = resolvedTarget.provider;
    session.model = resolvedModel;
    session.metadata.lastTurnUsedLlm = !(
      parsedLocalUtility ||
      (turnStrategy.kind === "chat" &&
        !turnStrategy.allowTools &&
        directLocalResponse(turnStrategy.intent))
    );

    this.sessions.addMessage(session.id, { role: "user", source: "user", content: options.input });

    // Handle numeric project selection from a previous list_projects turn
    const pendingList = session.metadata.pendingProjectList;
    const numberMatch = /^\s*(\d+)\s*$/.exec(options.input);
    if (numberMatch && Array.isArray(pendingList) && pendingList.length > 0) {
      const idx = parseInt(numberMatch[1]!, 10) - 1;
      const selectedPath =
        typeof pendingList[idx] === "string" ? (pendingList[idx] as string) : null;
      session.metadata.pendingProjectList = undefined;
      if (selectedPath) {
        session.worktree = selectedPath;
        session.metadata.lastTurnUsedLlm = false;
        this.sessions.save(session);
        await this.sessions.persist(session.id);
        const name = path.basename(selectedPath);
        const output = `✅ Trabalhando em **${name}**\n\nCaminho: ${selectedPath}`;
        this.sessions.addMessage(session.id, {
          role: "assistant",
          source: "assistant",
          content: output,
        });
        return output;
      }
    } else {
      // Clear stale pending list on any non-numeric turn
      session.metadata.pendingProjectList = undefined;
    }

    const directResponse =
      turnStrategy.kind === "chat" && !turnStrategy.allowTools
        ? directLocalResponse(turnStrategy.intent)
        : undefined;
    if (directResponse) {
      session.metadata.lastTurnUsedLlm = false;
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

    if (parsedLocalUtility) {
      session.metadata.lastTurnUsedLlm = false;
      session.status = "executing";
      try {
        const finalText = await this.executeUtilityTurn(session, options.input, mode, options);
        session.status = "idle";
        this.sessions.save(session);
        await this.sessions.persist(session.id);
        return finalText.trim();
      } catch (error) {
        session.status = "error";
        this.sessions.save(session);
        throw error;
      }
    }

    // Validate model is configured
    const effectiveModel = resolvedModel;
    if (!effectiveModel) {
      throw new Error(
        `No model configured for ${resolvedTarget.provider}. Run /model or set ` +
          `defaultModels.${resolvedTarget.provider} in .deepcode/config.json, or set DEEPCODE_MODEL.`,
      );
    }
    await this.assertModelAvailable(
      session,
      resolvedTarget.provider,
      effectiveModel,
      options.signal,
    );
    this.activeBudgets.set(session.id, new SessionBudget(this.config.tokenBudget));

    try {
      let finalText = "";
      const iterations = 0;
      const maxIterationsPerTurn = this.config.maxIterations;
      const autoContinue = this.config.autoContinue ?? "ask";
      const maxContinuationRounds = this.config.maxContinuationRounds ?? 3;
      session.status = "executing";

      if (turnStrategy.kind === "utility") {
        finalText = await this.executeUtilityTurn(session, options.input, mode, options);
      } else {
        let continuationRound = 0;
        let hadCheckpoint = false;

        finalText = await this.executeTraditional(
          session,
          mode,
          maxIterationsPerTurn,
          iterations,
          {
            ...options,
            onCheckpoint: (checkpoint) => {
              hadCheckpoint = true;
              options.onCheckpoint?.(checkpoint);
            },
          },
          turnStrategy,
        );

        // Auto-continuation: if limit was hit and autoContinue is "on",
        // run additional turns up to maxContinuationRounds
        while (
          hadCheckpoint &&
          autoContinue === "on" &&
          continuationRound < maxContinuationRounds
        ) {
          continuationRound++;
          hadCheckpoint = false;
          const continuationText = await this.executeTraditional(
            session,
            mode,
            maxIterationsPerTurn,
            iterations + continuationRound * maxIterationsPerTurn,
            {
              ...options,
              onCheckpoint: (checkpoint) => {
                hadCheckpoint = true;
                options.onCheckpoint?.(checkpoint);
              },
            },
            turnStrategy,
          );
          finalText += continuationText;
        }
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

  async completeUtility(options: AgentUtilityCompletionOptions): Promise<string> {
    const session = options.session;
    const providerId = options.provider ?? session.provider;
    const model =
      options.model ?? session.model ?? resolveConfiguredModelForProvider(this.config, providerId);
    if (!model) {
      throw new Error(
        `No model configured for ${providerId}. Run /model or set ` +
          `defaultModels.${providerId} in .deepcode/config.json, or set DEEPCODE_MODEL.`,
      );
    }

    const alreadyTrackingBudget = this.activeBudgets.has(session.id);
    if (!alreadyTrackingBudget) {
      this.activeBudgets.set(session.id, new SessionBudget(this.config.tokenBudget));
    }

    try {
      this.enforceBudget(session.id);
      const provider = this.providerManager.get(providerId);
      const output = await provider.complete(options.prompt, {
        model,
        maxTokens: options.maxTokens,
        temperature: options.temperature,
        signal: options.signal,
        onUsage: (inputTokens, outputTokens) => {
          this.recordUsage(session.id, inputTokens, outputTokens);
        },
      });
      this.enforceBudget(session.id);
      return output;
    } finally {
      if (!alreadyTrackingBudget) {
        this.activeBudgets.delete(session.id);
      }
    }
  }

  /**
   * Traditional execution loop
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
    const resolvedModel =
      session.model ?? resolveConfiguredModelForProvider(this.config, session.provider);
    const toolProfile = resolveModelExecutionProfile(session.provider, resolvedModel);
    const baseAllowedToolNames = turnStrategy.allowTools
      ? this.allowedToolNamesForMode(mode)
      : new Set<string>();
    const allowedToolNames = this.applyToolOverrides(baseAllowedToolNames, options);
    // Restore tools revealed in previous turns of this session
    for (const name of this.getRevealedTools(session)) {
      if (this.tools.get(name)) allowedToolNames.add(name);
    }

    let consecutiveErrorKey = "";
    let consecutiveErrorCount = 0;
    let brokeFromNoTools = false;
    const filesModified: string[] = [];
    const recentTools: string[] = [];

    toolLoop: while (iterations < maxIterations) {
      iterations += 1;
      options.onIteration?.(iterations, maxIterations);
      this.enforceBudget(session.id);

      // Recompute each iteration — tool_search may have expanded allowedToolNames
      const toolDefinitions = turnStrategy.allowTools
        ? this.toolDefinitionsForNames(allowedToolNames, toolProfile.toolSchemaMode)
        : [];
      const textToolFallbackEnabled =
        toolDefinitions.length > 0 && toolProfile.toolCallStrategy !== "native";

      await this.compressContextIfNeeded(session, turnStrategy.systemPrompt, options);
      const chunks = this.providerManager.chat(
        this.messagesForSystemPrompt(
          session,
          turnStrategy.systemPrompt,
          turnStrategy.allowTools,
          [],
          textToolFallbackEnabled ? buildFallbackToolCallPrompt(allowedToolNames) : undefined,
          mode === "build" ? this.buildDeferredToolsHint(session) : undefined,
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
          streamContent: !textToolFallbackEnabled,
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
      if (toolCalls.length === 0) {
        brokeFromNoTools = true;
        break toolLoop;
      }

      for (let callIdx = 0; callIdx < toolCalls.length; callIdx++) {
        const call = toolCalls[callIdx]!;

        // Track recent tool calls for checkpoint reporting
        recentTools.push(call.name);
        if (recentTools.length > 10) recentTools.shift();

        const result = await this.executeTool(
          call,
          session,
          mode,
          options.signal,
          allowedToolNames,
          options.onToolActivity,
          (names) => {
            for (const name of names) {
              if (this.tools.get(name)) allowedToolNames.add(name);
            }
          },
        );
        this.sessions.addMessage(session.id, {
          role: "tool",
          source: "tool",
          content: await truncateToolOutput(
            result.output,
            call.name,
            session.worktree,
            undefined,
            allowedToolNames,
          ),
          toolCallId: call.id,
        });

        // Track files modified by write_file and edit_file for checkpoint
        if (result.ok && (call.name === "write_file" || call.name === "edit_file")) {
          const path = (call.arguments as Record<string, unknown>)?.path;
          if (typeof path === "string" && !filesModified.includes(path)) {
            filesModified.push(path);
          }
        }

        if (!result.ok) {
          const key = `${call.name}:${result.errorMessage ?? result.output}`;
          if (key === consecutiveErrorKey) {
            consecutiveErrorCount++;
          } else {
            consecutiveErrorKey = key;
            consecutiveErrorCount = 1;
          }
          if (consecutiveErrorCount >= 3) {
            // Add synthetic results for any tool calls not yet executed in this
            // iteration — the assistant message already recorded all of them, so
            // every tool_use must have a matching tool_result before we abort.
            for (let j = callIdx + 1; j < toolCalls.length; j++) {
              this.sessions.addMessage(session.id, {
                role: "tool",
                source: "tool",
                content: "[Execução cancelada: erros idênticos repetidos]",
                toolCallId: toolCalls[j]!.id,
              });
            }
            const abortMsg = `\n[${call.name} falhou com o mesmo erro ${consecutiveErrorCount} vezes seguidas. Abortando para evitar loop. Tente uma abordagem diferente.]`;
            finalText += abortMsg;
            options.onChunk?.(abortMsg);
            break toolLoop;
          }
        } else {
          consecutiveErrorKey = "";
          consecutiveErrorCount = 0;
        }
      }
      // All tools for this iteration are done and their messages are in
      // session.messages — notify the TUI so it can commit them to Static
      // immediately, before the next LLM call, instead of waiting for the
      // onIteration boundary of the following round.
      options.onToolsComplete?.();
    }

    if (!brokeFromNoTools && iterations >= maxIterations) {
      const checkpoint: ContinuationCheckpoint = {
        reason: "max_iterations",
        iterationsUsed: iterations,
        filesModified,
        recentTools,
        turnId: createId("checkpoint"),
      };

      // Emit checkpoint event for TUI / runtime listeners
      this.eventBus.emit("turn.checkpoint", {
        checkpoint,
        sessionId: session.id,
        turnId: checkpoint.turnId,
      });

      // Notify the caller via callback
      options.onCheckpoint?.(checkpoint);

      const checkpointMsg = [
        `\n[Limite de ${maxIterations} iterações atingido — a tarefa pode estar incompleta.]`,
        filesModified.length > 0
          ? `Arquivos modificados: ${filesModified.join(", ")}`
          : null,
        recentTools.length > 0
          ? `Ferramentas recentes: ${[...new Set(recentTools)].join(", ")}`
          : null,
        `Use /continue para continuar ou configure autoContinue nas configurações.`,
      ]
        .filter(Boolean)
        .join("\n");

      finalText += "\n" + checkpointMsg;
      options.onChunk?.(checkpointMsg);
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
    onRevealTools?: (names: string[]) => void,
  ): Promise<ToolExecutionOutcome> {
    if (!this.isToolAllowed(call.name, mode)) {
      const modeHint =
        mode === "plan" ? "Switch to BUILD mode (press Tab in the TUI) to enable this tool." : "";
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
      let hint = "";
      if (call.name === "write_file") {
        const args = call.arguments as Record<string, unknown> | undefined;
        if (!args?.path || !args?.content) {
          hint =
            " Sua saída foi provavelmente truncada antes da chamada completar. Use múltiplas chamadas edit_file para aplicar as mudanças em partes menores em vez de reescrever o arquivo inteiro.";
        }
      }
      return {
        ok: false,
        output: `Error: invalid arguments for ${call.name}: ${parsed.error.message}${hint}`,
        errorMessage: `Invalid arguments for ${call.name}: ${parsed.error.message}`,
      };
    }

    const scopedSecurity = this.securityForSession(session);
    const context: ToolContext = {
      sessionId: session.id,
      messageId: createId("msg"),
      worktree: session.worktree,
      directory: session.worktree,
      abortSignal: signal ?? new AbortController().signal,
      config: this.config,
      agentMode: mode,
      cache: this.cache,
      permissions: scopedSecurity.permissions,
      pathSecurity: scopedSecurity.pathSecurity,
      subagentDepth: (session.metadata.subagentDepth as number | undefined) ?? 0,
      logActivity: (activity) => {
        const full: Activity = {
          ...activity,
          id: createId("activity"),
          createdAt: nowIso(),
          metadata: {
            ...activity.metadata,
            ...this.activityIdentity(session),
          },
        };
        session.activities.push(full);
        this.eventBus.emit("activity", full);
      },
      snapshotForUndo: async (filePath: string) => {
        let previousContent: string | null = null;
        try {
          previousContent = await import("node:fs/promises").then((fs) =>
            fs.readFile(filePath, "utf8"),
          );
        } catch {
          // File doesn't exist yet — previousContent stays null (new file)
        }
        const stack = this.undoStacks.get(session.id) ?? [];
        stack.push({ path: filePath, previousContent });
        this.undoStacks.set(session.id, stack);
      },
      revealTools: (names) => {
        const current = this.getRevealedTools(session);
        session.metadata.revealedTools = [...new Set([...current, ...names])];
        this.sessions.save(session);
        onRevealTools?.(names);
      },
    };

    try {
      const activityKind = tool.activityKind ? { activityKind: tool.activityKind } : {};
      this.logToolActivity(session, {
        type: "tool_call",
        message: `Calling ${call.name}`,
        metadata: { tool: call.name, args: call.arguments, ...activityKind },
      });
      onToolActivity?.(call.name, true);
      const result = await Effect.runPromise(tool.execute(parsed.data, context));
      onToolActivity?.(call.name, false);
      const output = typeof result === "string" ? result : JSON.stringify(result, null, 2);
      this.logToolActivity(session, {
        type: "tool_result",
        message: `Completed ${call.name}`,
        metadata: { tool: call.name, result: truncateForMetadata(output), ...activityKind },
      });
      return { ok: true, output };
    } catch (error) {
      // Propagate abort so the outer run() loop stops immediately
      if (error instanceof Error && error.name === "AbortError") {
        onToolActivity?.(call.name, false);
        throw error;
      }
      const message = formatErrorChain(error);
      const isPermissionError =
        error instanceof Error && (error as Error & { code?: string }).code === "PERMISSION_DENIED";
      const hint = isPermissionError
        ? " Try a different approach or ask the user to adjust permissions in .deepcode/config.json."
        : "";
      this.logToolActivity(session, {
        type: "tool_error",
        message: `Failed ${call.name}: ${message}`,
        metadata: {
          tool: call.name,
          error: message,
          ...(tool.activityKind ? { activityKind: tool.activityKind } : {}),
        },
      });
      return {
        ok: false,
        output: `Error running ${call.name}: ${message}${hint}`,
        errorMessage: message,
      };
    }
  }

  private securityForSession(session: Pick<Session, "id" | "worktree" | "metadata">): {
    pathSecurity: PathSecurity;
    permissions: PermissionGateway;
  } {
    const pathSecurity = this.pathSecurity.forWorktree(session.worktree);
    const metadata = session.metadata;
    const taskId = metadata.taskId;
    const subagentType = metadata.subagentType;
    return {
      pathSecurity,
      permissions: this.permissions.forContext(pathSecurity, {
        sessionId: session.id,
        ...(typeof taskId === "string" ? { taskId } : {}),
        subagent: metadata.subagent === true,
        ...(typeof subagentType === "string" ? { subagentType } : {}),
      }),
    };
  }

  private logToolActivity(session: Session, activity: Omit<Activity, "id" | "createdAt">): void {
    const full: Activity = {
      ...activity,
      id: createId("activity"),
      createdAt: nowIso(),
      metadata: {
        ...activity.metadata,
        ...this.activityIdentity(session),
      },
    };
    session.activities.push(full);
    this.eventBus.emit("activity", full);
  }

  private activityIdentity(session: Session): Record<string, unknown> {
    const taskId = session.metadata.taskId;
    return {
      sessionId: session.id,
      ...(typeof taskId === "string" ? { taskId } : {}),
      ...(session.metadata.subagent === true ? { subagent: true } : {}),
    };
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
      this.tools
        .list()
        .filter((tool) => this.isToolAllowed(tool.name, mode) && !tool.deferred)
        .map((tool) => tool.name),
    );
  }

  private getRevealedTools(session: Session): string[] {
    return Array.isArray(session.metadata.revealedTools)
      ? (session.metadata.revealedTools as string[])
      : [];
  }

  private buildDeferredToolsHint(session: Session): string | undefined {
    const deferred = this.tools.listDeferred();
    if (deferred.length === 0) return undefined;
    const revealed = new Set(this.getRevealedTools(session));
    const unrevealed = deferred.filter((t) => !revealed.has(t.name));
    if (unrevealed.length === 0) return undefined;
    return [
      "Deferred tools (not in schema — call tool_search with a keyword to activate):",
      ...unrevealed.map((t) => `- ${t.name}: ${t.description.slice(0, 100)}`),
    ].join("\n");
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

  private toolDefinitionsForNames(
    names: Set<string>,
    schemaMode: ToolSchemaMode = "full",
  ): Array<Record<string, unknown>> {
    return this.tools
      .list()
      .filter((tool) => names.has(tool.name))
      .map((tool) => ({
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

  private messagesForSystemPrompt(
    session: Session,
    systemPrompt: string,
    toolsEnabled: boolean,
    extraMessages: Message[] = [],
    fallbackToolPrompt?: string,
    deferredToolsHint?: string,
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
      ...(deferredToolsHint
        ? [
            {
              id: "deferred_tools_system",
              role: "system" as const,
              content: deferredToolsHint,
              createdAt: session.createdAt,
            },
          ]
        : []),
      ...(fallbackToolPrompt
        ? [
            {
              id: "tool_fallback_system",
              role: "system" as const,
              content: fallbackToolPrompt,
              createdAt: session.createdAt,
            },
          ]
        : []),
      ...session.messages.filter((message) => this.isSessionMessageSafeForModel(message)),
      ...extraMessages,
    ];
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
    if (
      !shouldCompressContext(allMessages, DEFAULT_MAX_CONTEXT, this.config.contextWindowThreshold)
    ) {
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
        {
          id: "sys",
          role: "system" as const,
          content: UTILITY_SYSTEM_PROMPT,
          createdAt: session.createdAt,
        },
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
      return await this.executeTraditional(session, mode, this.config.maxIterations, 0, options, {
        allowTools: true,
        shouldPlan: false,
        systemPrompt: UTILITY_SYSTEM_PROMPT,
        kind: "utility",
        intent: { kind: "direct_utility" },
      });
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
        const security = this.securityForSession(session);
        const { formatted, paths } = await this.projectDiscovery.discover(
          session.worktree,
          request.path ?? ".",
          security.pathSecurity,
          security.permissions,
        );
        if (paths.length > 0) {
          session.metadata.pendingProjectList = paths;
        }
        this.sessions.addMessage(session.id, {
          role: "assistant",
          source: "assistant",
          content: formatUtilityResult(request, formatted),
        });
        return formatUtilityResult(request, formatted);
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

    const utilityAllowedTools = this.allowedToolNamesForMode(mode);
    const result = await this.executeTool(call, session, mode, options.signal, utilityAllowedTools);
    this.sessions.addMessage(session.id, {
      role: "tool",
      source: "tool",
      content: await truncateToolOutput(
        result.output,
        call.name,
        session.worktree,
        undefined,
        utilityAllowedTools,
      ),
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

  /**
   * Validate that a model is available on the given provider before any API call.
   * Result is cached in session.metadata.validatedModels keyed by "providerId/model"
   * so the catalog check only runs once per session per provider+model pair.
   * If the catalog is unavailable (network error, timeout) the check is skipped — the
   * real API call will fail naturally with a clear HTTP error.
   */
  private async assertModelAvailable(
    session: Session,
    providerId: ProviderId,
    model: string,
    signal?: AbortSignal,
  ): Promise<void> {
    const cacheKey = `${providerId}/${model}`;
    const cache = (session.metadata.validatedModels ?? {}) as Record<string, boolean>;

    if (cacheKey in cache) {
      if (!cache[cacheKey]) {
        throw new ProviderError(
          `Modelo "${model}" não está disponível em ${providerId}. Execute \`deepcode doctor\` para ver modelos disponíveis.`,
          providerId,
        );
      }
      return;
    }

    const { found, availableModels } = await this.providerManager.checkModelInCatalog(
      providerId,
      model,
      { signal },
    );

    session.metadata.validatedModels = { ...cache, [cacheKey]: found };
    this.sessions.save(session);

    if (!found) {
      const modelList = availableModels.slice(0, 10).join(", ");
      throw new ProviderError(
        `Modelo "${model}" não encontrado em ${providerId}.\nModelos disponíveis: ${modelList}`,
        providerId,
      );
    }
  }
}

function truncateForMetadata(value: string, maxLength = 2_000): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
