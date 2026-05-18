import type { ProviderId, Session } from "@deepcode/shared";
import type { Agent } from "./agent.js";
import type { SessionManager } from "../sessions/session-manager.js";
import type { EventBus } from "../events/event-bus.js";

export interface SubagentTask {
  id: string;
  prompt: string;
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
  ) {}

  async runParallel(
    tasks: SubagentTask[],
    options: SubagentManagerOptions & { signal?: AbortSignal } = {},
  ): Promise<SubagentResult[]> {
    const concurrency = Math.max(1, options.concurrency ?? Math.min(tasks.length, this.defaultConcurrency));
    const results: SubagentResult[] = [];
    let cursor = 0;

    const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, async () => {
      while (cursor < tasks.length) {
        const task = tasks[cursor];
        cursor += 1;
        if (!task) continue;
        const result = await this.runOne(task, options.signal);
        results.push(result);
        options.onTaskComplete?.(result);
      }
    });

    await Promise.all(workers);
    return tasks.map((task) => results.find((result) => result.taskId === task.id)!).filter(Boolean);
  }

  async forkFrom(parentSessionId: string, task: SubagentTask, signal?: AbortSignal): Promise<SubagentResult> {
    const parentMessages = this.sessions.get(parentSessionId).messages;
    return this.runOne({ ...task, parentMessages }, signal);
  }

  async runOne(task: SubagentTask, signal?: AbortSignal): Promise<SubagentResult> {
    const session = this.createChildSession(task);
    this.events?.emit("subagent:start", { taskId: task.id, prompt: task.prompt });
    try {
      const output = await this.agent.run({
        session,
        input: task.prompt,
        provider: task.provider,
        signal,
        systemPrompt: task.systemPrompt,
        allowedTools: task.allowedTools,
        disallowedTools: task.disallowedTools,
        onToolActivity: this.events
          ? (toolName, active) => this.events!.emit("subagent:tool", { taskId: task.id, toolName, active })
          : undefined,
      });
      this.events?.emit("subagent:complete", { taskId: task.id });
      return { taskId: task.id, sessionId: session.id, output };
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      this.events?.emit("subagent:complete", { taskId: task.id, error: errMsg });
      return {
        taskId: task.id,
        sessionId: session.id,
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
      for (const msg of task.parentMessages) {
        this.sessions.addMessage(session.id, { role: msg.role, source: msg.source, content: msg.content });
      }
    }
    this.sessions.save(session);
    return session;
  }
}
