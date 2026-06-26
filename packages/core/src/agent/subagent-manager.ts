import type { Message, ProviderId, Session } from "@deepcode/shared";
import type { Agent } from "./agent.js";
import type { SessionManager } from "../sessions/session-manager.js";
import type { EventBus } from "../events/event-bus.js";
import { formatErrorChain } from "../utils/error-chain.js";
import { SubagentTaskRegistry } from "./subagent-task-registry.js";

/**
 * Filters a message list to a compact "reasoning thread" safe for fork context.
 *
 * Keeps only user messages and assistant messages that carry text content,
 * stripping tool calls and tool results. Consecutive same-role messages are
 * merged to maintain a valid alternating conversation format.
 *
 * This prevents context overflow when a parent session contains large tool
 * outputs (file contents, command results, etc.) that the subagent doesn't
 * need — it has its own tools and can re-fetch what it requires.
 */
export function buildReasoningThread(messages: Message[]): Message[] {
  const thread: Message[] = [];

  for (const msg of messages) {
    if (msg.role === "tool") continue;
    if (msg.role === "assistant" && !msg.content?.trim()) continue;

    const prev = thread[thread.length - 1];
    if (prev && prev.role === msg.role) {
      prev.content = `${prev.content}\n\n${msg.content}`.trim();
    } else {
      thread.push({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        createdAt: msg.createdAt,
        source: msg.source,
      });
    }
  }

  return thread;
}

export interface SubagentTask {
  id: string;
  prompt: string;
  mode?: "task" | "background";
  provider?: ProviderId;
  model?: string;
  metadata?: Record<string, unknown>;
  /** Messages to seed the child session with before running (fork context). */
  parentMessages?: import("@deepcode/shared").Message[];
  /** Override system prompt (used by named agent types). */
  systemPrompt?: string;
  /** If set, only these tool names are available to the subagent. */
  allowedTools?: string[];
  /** Tool names to exclude from the subagent's tool set. */
  disallowedTools?: string[];
  /** Model validation cache inherited from the parent session (avoids redundant catalog checks). */
  parentValidatedModels?: Record<string, boolean>;
}

export interface SubagentResult {
  taskId: string;
  sessionId: string;
  output: string;
  error?: string;
}

export interface SubagentManagerOptions {
  concurrency?: number;
  onTaskComplete?: (result: SubagentResult) => void;
}

export class SubagentManager {
  constructor(
    private readonly agent: Agent,
    private readonly sessions: SessionManager,
    private readonly defaultProvider: ProviderId,
    private readonly defaultModel?: string,
    private readonly defaultConcurrency: number = 4,
    private readonly events?: EventBus,
    readonly registry: SubagentTaskRegistry = new SubagentTaskRegistry(),
  ) {}

  async runParallel(
    tasks: SubagentTask[],
    options: SubagentManagerOptions & { signal?: AbortSignal } = {},
  ): Promise<SubagentResult[]> {
    const concurrency = Math.max(
      1,
      options.concurrency ?? Math.min(tasks.length, this.defaultConcurrency),
    );
    const results: SubagentResult[] = [];
    let cursor = 0;

    this.registry.batch(() => {
      for (const task of tasks) {
        this.registry.register(
          {
            taskId: task.id,
            prompt: task.prompt,
            parentSessionId:
              typeof task.metadata?.parentSessionId === "string"
                ? task.metadata.parentSessionId
                : undefined,
            subagentType:
              typeof task.metadata?.subagentType === "string"
                ? task.metadata.subagentType
                : undefined,
            mode: task.mode,
          },
          options.signal,
        );
      }
    });

    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
      while (cursor < tasks.length) {
        if (options.signal?.aborted) break;
        const task = tasks[cursor];
        cursor += 1;
        if (!task) continue;
        const registered = this.registry.get(task.id);
        if (registered?.status === "cancelled") {
          results.push({
            taskId: task.id,
            sessionId: registered.sessionId ?? "",
            output: registered.currentOutput ?? "",
            error: registered.error ?? "Subagent cancelled",
          });
          continue;
        }
        const result = await this.runOne(task, options.signal);
        results.push(result);
        options.onTaskComplete?.(result);
      }
    });

    await Promise.all(workers);
    if (options.signal?.aborted) {
      for (const task of tasks) {
        const cancelled = this.registry.cancel(task.id, "Parallel subagent run cancelled");
        const record = this.registry.get(task.id);
        if (
          (cancelled || record?.status === "cancelled") &&
          !results.some((result) => result.taskId === task.id)
        ) {
          results.push({
            taskId: task.id,
            sessionId: record?.sessionId ?? "",
            output: record?.currentOutput ?? "",
            error: record?.error ?? "Parallel subagent run cancelled",
          });
        }
      }
    }
    return tasks
      .map((task) => results.find((result) => result.taskId === task.id)!)
      .filter(Boolean);
  }

  async forkFrom(
    parentSessionId: string,
    task: SubagentTask,
    signal?: AbortSignal,
  ): Promise<SubagentResult> {
    const parentMessages = this.sessions.get(parentSessionId).messages;
    return this.runOne({ ...task, parentMessages }, signal);
  }

  async runOne(task: SubagentTask, signal?: AbortSignal): Promise<SubagentResult> {
    const parentSessionId =
      typeof task.metadata?.parentSessionId === "string"
        ? task.metadata.parentSessionId
        : undefined;
    const subagentType =
      typeof task.metadata?.subagentType === "string" ? task.metadata.subagentType : undefined;
    const taskSignal = this.registry.register(
      {
        taskId: task.id,
        prompt: task.prompt,
        parentSessionId,
        subagentType,
        mode: task.mode,
      },
      signal,
    );
    if (taskSignal.aborted) {
      const reason =
        taskSignal.reason instanceof Error
          ? taskSignal.reason.message
          : String(taskSignal.reason ?? "Subagent cancelled");
      this.registry.markCancelled(task.id, reason);
      return { taskId: task.id, sessionId: "", output: "", error: reason };
    }
    let session: Session | undefined;
    try {
      session = this.createChildSession(task);
      this.registry.start(task.id, session.id);
      this.events?.emit("subagent:start", { taskId: task.id, prompt: task.prompt });
      const output = await this.agent.run({
        session,
        input: task.prompt,
        provider: task.provider,
        signal: taskSignal,
        systemPrompt: task.systemPrompt,
        allowedTools: task.allowedTools,
        disallowedTools: task.disallowedTools,
        onChunk: this.events
          ? (text) => {
              this.registry.appendOutput(task.id, text);
              this.events!.emit("subagent:chunk", { taskId: task.id, text });
            }
          : (text) => this.registry.appendOutput(task.id, text),
        onToolActivity: this.events
          ? (toolName, active) => {
              this.registry.setTool(task.id, toolName, active);
              this.events!.emit("subagent:tool", { taskId: task.id, toolName, active });
            }
          : (toolName, active) => this.registry.setTool(task.id, toolName, active),
      });
      this.registry.complete(task.id, output);
      this.events?.emit("subagent:complete", { taskId: task.id });
      return { taskId: task.id, sessionId: session.id, output };
    } catch (error) {
      const errMsg = formatErrorChain(error);
      if (taskSignal.aborted || isAbortError(error)) {
        this.registry.markCancelled(task.id, errMsg);
      } else {
        this.registry.fail(task.id, errMsg);
      }
      this.events?.emit("subagent:complete", { taskId: task.id, error: errMsg });
      return {
        taskId: task.id,
        sessionId: session?.id ?? "",
        output: "",
        error: errMsg,
      };
    }
  }

  private createChildSession(task: SubagentTask): Session {
    const session = this.sessions.create({
      provider: task.provider ?? this.defaultProvider,
      model: task.model ?? this.defaultModel,
    });
    session.metadata = {
      ...session.metadata,
      subagent: true,
      taskId: task.id,
      ...task.metadata,
    };
    if (task.parentMessages?.length) {
      for (const msg of buildReasoningThread(task.parentMessages)) {
        this.sessions.addMessage(session.id, {
          role: msg.role,
          source: msg.source,
          content: msg.content,
        });
      }
    }
    if (task.parentValidatedModels) {
      session.metadata.validatedModels = { ...task.parentValidatedModels };
    }
    this.sessions.save(session);
    return session;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof Error && (error.name === "AbortError" || /abort|cancel/i.test(error.message))
  );
}
