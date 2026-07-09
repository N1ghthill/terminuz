import { Effect } from "effect";
import type { z } from "zod";
import type { Activity, AgentMode, TerminuzConfig } from "@terminuz/shared";
import type { PermissionGateway } from "../security/permission-gateway.js";
import type { PathSecurity } from "../security/path-security.js";
import type { ToolCache } from "../cache/tool-cache.js";

export interface ToolContext {
  sessionId: string;
  messageId: string;
  worktree: string;
  directory: string;
  abortSignal: AbortSignal;
  config: TerminuzConfig;
  agentMode: AgentMode;
  cache: ToolCache;
  permissions: PermissionGateway;
  pathSecurity: PathSecurity;
  /** Nesting level of the current agent (0 = root, 1 = first subagent, etc.).
   * Used by the task tool to enforce MAX_SUBAGENT_DEPTH. */
  subagentDepth: number;
  logActivity(activity: Omit<Activity, "id" | "createdAt">): void;
  /** Called by file-mutating tools before overwriting so the agent can undo. */
  snapshotForUndo?(path: string): Promise<void>;
  /** Called by tool_search to activate deferred tools for this session. */
  revealTools?(names: string[]): void;
}

export interface ToolDefinition<TSchema extends z.ZodTypeAny = z.ZodTypeAny, TResult = unknown> {
  name: string;
  description: string;
  parameters: TSchema;
  execute(args: z.infer<TSchema>, context: ToolContext): Effect.Effect<TResult, Error>;
  /** Optional semantic kind for activity consumers that need specialized presentation. */
  activityKind?: "subagent";
  /** When true, the tool is not sent in the initial schema — activated via tool_search. */
  deferred?: boolean;
}

export function defineTool<TSchema extends z.ZodTypeAny, TResult>(
  definition: ToolDefinition<TSchema, TResult>,
): ToolDefinition<TSchema, TResult> {
  return definition;
}

export function runToolEffect<TResult>(effect: Effect.Effect<TResult, Error>): Promise<TResult> {
  return Effect.runPromise(effect);
}

export class ToolRegistry {
  private readonly tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  listDeferred(): ToolDefinition[] {
    return [...this.tools.values()].filter((t) => t.deferred);
  }

  descriptions(): string {
    return this.list()
      .map((tool) => `- ${tool.name}: ${tool.description}`)
      .join("\n");
  }
}
