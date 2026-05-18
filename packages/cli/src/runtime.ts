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
  SessionManager,
  SubagentManager,
  ToolCache,
  createDefaultToolRegistry,
  createTaskTool,
  type ToolRegistry,
} from "@deepcode/core";
import { resolveUsableProviderTarget, type DeepCodeConfig } from "@deepcode/shared";

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
  permissions: PermissionGateway;
  pathSecurity: PathSecurity;
  mcp: McpManager;
}

export async function createRuntime(options: RuntimeOptions): Promise<DeepCodeRuntime> {
  const worktree = path.resolve(options.cwd);
  const config = await new ConfigLoader().load({ cwd: worktree, configPath: options.configPath });
  const events = new EventBus();
  const pathSecurity = new PathSecurity(worktree, config.paths);
  const audit = new AuditLogger(worktree);
  const permissions = new PermissionGateway(
    config,
    pathSecurity,
    audit,
    events,
    options.interactive,
  );
  const cache = new ToolCache(worktree, config);
  const sessions = new SessionManager(worktree, events);
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
  const subagents = new SubagentManager(
    agent,
    sessions,
    defaultTarget.provider,
    defaultTarget.model,
    config.subagentConcurrency,
    events,
  );
  tools.register(createTaskTool(subagents, worktree));
  return {
    config,
    events,
    sessions,
    cache,
    tools,
    providers,
    agent,
    subagents,
    permissions,
    pathSecurity,
    mcp,
  };
}
