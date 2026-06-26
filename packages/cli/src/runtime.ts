import path from "node:path";
import {
  Agent,
  AuditLogger,
  ConfigLoader,
  EventBus,
  McpManager,
  PathSecurity,
  PermissionGateway,
  ProviderManager,
  RuntimeLogger,
  SessionManager,
  SubagentManager,
  SubagentTaskRegistry,
  ToolCache,
  createDefaultToolRegistry,
  createTaskTool,
  createTaskBatchTool,
  createToolSearchTool,
  collectSecretValues,
  type ToolRegistry,
} from "@deepcode/core";
import {
  getUserDataDir,
  resolveUsableProviderTarget,
  type Activity,
  type DeepCodeConfig,
} from "@deepcode/shared";

export interface RuntimeOptions {
  cwd: string;
  configPath?: string;
  interactive: boolean;
}

export interface DeepCodeRuntime {
  config: DeepCodeConfig;
  events: EventBus;
  sessions: SessionManager;
  cache: ToolCache;
  tools: ToolRegistry;
  providers: ProviderManager;
  agent: Agent;
  subagents: SubagentManager;
  subagentTasks: SubagentTaskRegistry;
  permissions: PermissionGateway;
  pathSecurity: PathSecurity;
  mcp: McpManager;
  logger: RuntimeLogger;
}

export async function createRuntime(options: RuntimeOptions): Promise<DeepCodeRuntime> {
  const worktree = path.resolve(options.cwd);
  const config = await new ConfigLoader().load({ cwd: worktree, configPath: options.configPath });
  const events = new EventBus();
  const pathSecurity = new PathSecurity(worktree, config.paths);
  const audit = new AuditLogger(worktree);
  const logger = new RuntimeLogger(worktree, collectSecretValues(config));
  attachRuntimeLogging(events, logger);
  await logger.safeLog({
    event: "runtime.start",
    details: { interactive: options.interactive, worktree },
  });
  const permissions = new PermissionGateway(
    config,
    pathSecurity,
    audit,
    events,
    options.interactive,
  );
  const cache = new ToolCache(worktree, config);
  const sessionStorageDir = process.env.DEEPCODE_SESSION_DIR ?? getUserDataDir("deepcode");
  const sessions = new SessionManager(worktree, events, sessionStorageDir);
  await sessions.loadAll();
  const providers = new ProviderManager(config);
  const tools = createDefaultToolRegistry();
  const mcp = new McpManager(events);
  if (config.mcpServers.length > 0) {
    const mcpTools = await mcp.connect(config.mcpServers);
    for (const tool of mcpTools) {
      tools.register(tool);
    }
  }
  tools.register(createToolSearchTool(tools));
  const agent = new Agent(
    providers,
    tools,
    sessions,
    config,
    cache,
    permissions,
    pathSecurity,
    events,
  );
  const defaultTarget = resolveUsableProviderTarget(config, [config.defaultProvider]);
  const subagentTasks = new SubagentTaskRegistry();
  const subagents = new SubagentManager(
    agent,
    sessions,
    defaultTarget.provider,
    defaultTarget.model,
    config.subagentConcurrency,
    events,
    subagentTasks,
  );
  tools.register(createTaskTool(subagents, worktree, sessions));
  tools.register(createTaskBatchTool(subagents, worktree, sessions));
  return {
    config,
    events,
    sessions,
    cache,
    tools,
    providers,
    agent,
    subagents,
    subagentTasks,
    permissions,
    pathSecurity,
    mcp,
    logger,
  };
}

function attachRuntimeLogging(events: EventBus, logger: RuntimeLogger): void {
  events.on("activity", (activity) => {
    const meta = activity.metadata ?? {};
    const event =
      activity.type === "tool_call"
        ? "tool.start"
        : activity.type === "tool_result"
          ? "tool.end"
          : activity.type === "tool_error"
            ? "tool.error"
            : "activity";
    void logger.safeLog({
      event,
      sessionId: asString(meta["sessionId"]),
      toolCallId: asString(meta["toolCallId"]),
      taskId: asString(meta["taskId"]),
      parentSessionId: asString(meta["parentSessionId"]),
      details: summarizeActivity(activity),
    });
  });
  events.on("approval:request", (request) => {
    void logger.safeLog({
      event: "approval.request",
      sessionId: request.origin?.sessionId,
      taskId: request.origin?.taskId,
      details: {
        requestId: request.id,
        operation: request.operation,
        level: request.level,
        path: request.path,
        subagent: request.origin?.subagent,
        subagentType: request.origin?.subagentType,
      },
    });
  });
  events.on("approval:decision", ({ requestId, decision }) => {
    void logger.safeLog({
      event: "approval.decision",
      details: {
        requestId,
        allowed: decision.allowed,
        scope: decision.scope,
        reason: decision.reason,
      },
    });
  });
  events.on("app:warn", ({ message }) => {
    void logger.safeLog({ event: "app.warn", details: { message } });
  });
  events.on("app:error", ({ error, context }) => {
    void logger.safeLog({
      event: "app.error",
      details: { message: error.message, name: error.name, context },
    });
  });
  events.on("budget:warning", (payload) => {
    void logger.safeLog({ event: "budget.warning", details: payload });
  });
  events.on("budget:exceeded", (payload) => {
    void logger.safeLog({ event: "budget.exceeded", details: payload });
  });
  events.on("model.request", (payload) => {
    void logger.safeLog({
      event: "model.request",
      sessionId: payload.sessionId,
      turnId: payload.turnId,
      details: {
        provider: payload.provider,
        model: payload.model,
        inputTokens: payload.inputTokens,
        timestamp: payload.timestamp,
      },
    });
  });
  events.on("turn.checkpoint", ({ checkpoint, sessionId, turnId }) => {
    void logger.safeLog({
      event: "turn.checkpoint",
      sessionId,
      turnId,
      details: { ...checkpoint },
    });
  });
  events.on("subagent:start", ({ taskId, prompt }) => {
    void logger.safeLog({
      event: "subagent.start",
      taskId,
      details: { promptChars: prompt.length },
    });
  });
  events.on("subagent:tool", ({ taskId, toolName, active }) => {
    void logger.safeLog({
      event: "subagent.tool",
      taskId,
      details: { toolName, active },
    });
  });
  events.on("subagent:complete", ({ taskId, error }) => {
    void logger.safeLog({
      event: "subagent.end",
      taskId,
      details: { ok: !error, error },
    });
  });
}

function summarizeActivity(activity: Activity): Record<string, unknown> {
  const meta = activity.metadata ?? {};
  return {
    activityId: activity.id,
    activityType: activity.type,
    message: activity.message,
    tool: asString(meta["tool"]),
    toolCallId: asString(meta["toolCallId"]),
    activityKind: asString(meta["activityKind"]),
    subagentType: asString(meta["subagentType"]),
    hasArgs: meta["args"] !== undefined,
    resultChars: typeof meta["result"] === "string" ? meta["result"].length : undefined,
    error: asString(meta["error"]),
  };
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
