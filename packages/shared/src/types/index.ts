import { z } from "zod";

/* ── Primitives ──────────────────────────────────────────────────────── */
export const RoleSchema = z.enum(["system", "user", "assistant", "tool"]);
export type Role = z.infer<typeof RoleSchema>;

export const MessageSourceSchema = z.enum([
  "user",
  "assistant",
  "tool",
  "ui",
  "agent_internal",
  "context_summary",
]);
export type MessageSource = z.infer<typeof MessageSourceSchema>;

export const ProviderIdSchema = z.enum([
  "openrouter",
  "anthropic",
  "openai",
  "deepseek",
  "opencode",
  "groq",
  "ollama",
]);
export type ProviderId = z.infer<typeof ProviderIdSchema>;
export const PROVIDER_IDS = ProviderIdSchema.options;

export const CREDENTIAL_FREE_PROVIDERS: ReadonlySet<ProviderId> = new Set(["ollama"]);

export const OperationLevelSchema = z.enum([
  "read",
  "write",
  "git_local",
  "shell",
  "mcp",
  "dangerous",
]);
export type OperationLevel = z.infer<typeof OperationLevelSchema>;

export const PermissionModeSchema = z.enum(["allow", "ask", "deny"]);
export type PermissionMode = z.infer<typeof PermissionModeSchema>;

export const ApprovalScopeSchema = z.enum(["once", "session", "always"]);
export type ApprovalScope = z.infer<typeof ApprovalScopeSchema>;

export const AgentModeSchema = z.enum(["build", "plan"]).default("build");
export type AgentMode = z.infer<typeof AgentModeSchema>;

export const ToolChoiceModeSchema = z.enum(["auto", "required", "none"]);
export type ToolChoiceMode = z.infer<typeof ToolChoiceModeSchema>;

export const BuildTurnPolicyModeSchema = z.enum(["heuristic", "always-tools"]).default("heuristic");
export type BuildTurnPolicyMode = z.infer<typeof BuildTurnPolicyModeSchema>;

export const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.unknown()),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

/* ── ProviderConfig ──────────────────────────────────────────────────── */
export const ProviderConfigSchema = z
  .object({
    apiKey: z.string().optional(),
    apiKeyFile: z.string().optional(),
    baseUrl: z.string().url().optional(),
  })
  .strict();

export const LspServerConfigSchema = z
  .object({
    languages: z.array(z.string().min(1)),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    fileExtensions: z.array(z.string().min(1)).default([]),
  })
  .strict();

const ProviderModelDefaultsSchema = z
  .object({
    openrouter: z.string().optional(),
    anthropic: z.string().optional(),
    openai: z.string().optional(),
    deepseek: z.string().optional(),
    opencode: z.string().optional(),
    groq: z.string().optional(),
    ollama: z.string().optional(),
  })
  .strict()
  .default({});
export type ProviderModelDefaults = z.infer<typeof ProviderModelDefaultsSchema>;

/* ── Message ─────────────────────────────────────────────────────────── */
export const MessageSchema = z.object({
  id: z.string(),
  role: RoleSchema,
  content: z.string(),
  source: MessageSourceSchema.optional(),
  toolCallId: z.string().optional(),
  toolCalls: z.array(ToolCallSchema).optional(),
  createdAt: z.string(),
});
export type Message = z.infer<typeof MessageSchema>;

const MODEL_CONTEXT_SOURCES = new Set<MessageSource>([
  "user",
  "assistant",
  "tool",
  "context_summary",
]);

export function isModelContextMessage(message: Message): boolean {
  return message.source === undefined || MODEL_CONTEXT_SOURCES.has(message.source);
}

export function isProviderInputMessage(message: Message): boolean {
  return message.source !== "ui";
}

/* ── Model ───────────────────────────────────────────────────────────── */
export const ModelSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: ProviderIdSchema,
  contextLength: z.number().int().positive(),
  capabilities: z.object({
    streaming: z.boolean(),
    functionCalling: z.boolean(),
    jsonMode: z.boolean(),
    vision: z.boolean(),
  }),
  pricing: z
    .object({
      inputPer1k: z.number().nonnegative(),
      outputPer1k: z.number().nonnegative(),
    })
    .optional(),
});
export type Model = z.infer<typeof ModelSchema>;

export const ModelInfoSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: ProviderIdSchema,
  contextLength: z.number(),
  capabilities: z.object({
    streaming: z.boolean(),
    functionCalling: z.boolean(),
    jsonMode: z.boolean(),
    vision: z.boolean(),
  }),
  pricing: z
    .object({
      inputPer1k: z.number().nonnegative(),
      outputPer1k: z.number().nonnegative(),
    })
    .optional(),
});
export type ModelInfo = z.infer<typeof ModelInfoSchema>;

/* ── Session ─────────────────────────────────────────────────────────── */
export const SessionStatusSchema = z.enum([
  "idle",
  "planning",
  "executing",
  "awaiting_approval",
  "error",
]);
export type SessionStatus = z.infer<typeof SessionStatusSchema>;

export const SessionSchema = z.object({
  id: z.string(),
  worktree: z.string(),
  provider: ProviderIdSchema,
  model: z.string().optional(),
  status: SessionStatusSchema,
  messages: z.array(MessageSchema),
  activities: z.array(z.lazy(() => ActivitySchema)),
  createdAt: z.string(),
  updatedAt: z.string(),
  metadata: z.record(z.unknown()).default({}),
});
export type Session = z.infer<typeof SessionSchema>;

/* ── Chunk ───────────────────────────────────────────────────────────── */
export const ChunkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("delta"), content: z.string() }),
  z.object({ type: z.literal("tool_call"), call: ToolCallSchema }),
  z.object({ type: z.literal("reasoning"), content: z.string() }),
  z.object({ type: z.literal("usage"), inputTokens: z.number(), outputTokens: z.number() }),
  z.object({ type: z.literal("done") }),
]);
export type Chunk = z.infer<typeof ChunkSchema>;

/* ── Activity ────────────────────────────────────────────────────────── */
export const ActivitySchema = z.object({
  id: z.string(),
  type: z.string(),
  message: z.string(),
  metadata: z.record(z.unknown()).optional(),
  createdAt: z.string(),
});
export type Activity = z.infer<typeof ActivitySchema>;

/* ── Issue / PR ──────────────────────────────────────────────────────── */
export const IssueSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  state: z.string(),
  url: z.string(),
});
export type Issue = z.infer<typeof IssueSchema>;

export const PullRequestSchema = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable().optional(),
  state: z.string(),
  url: z.string(),
  head: z.string().optional(),
  base: z.string().optional(),
  mergeable: z.boolean().nullable().optional(),
});
export type PullRequest = z.infer<typeof PullRequestSchema>;

export interface MergeResult {
  merged: boolean;
  sha: string;
  message: string;
}

/* ── ChatOptions ─────────────────────────────────────────────────────── */
export const ChatOptionsSchema = z.object({
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().optional(),
  tools: z.array(z.record(z.unknown())).optional(),
  toolChoice: ToolChoiceModeSchema.optional(),
  signal: z.instanceof(AbortSignal).optional(),
});
export type ChatOptions = z.infer<typeof ChatOptionsSchema>;

/* ── ContinuationCheckpoint ──────────────────────────────────────────── */
export const AutoContinueModeSchema = z.enum(["off", "ask", "on"]).default("ask");
export type AutoContinueMode = z.infer<typeof AutoContinueModeSchema>;

export interface ContinuationCheckpoint {
  reason: "progress" | "max_iterations" | "error" | "user_interrupt";
  iterationsUsed: number;
  lastPlan?: string;
  filesModified: string[];
  recentTools: string[];
  pendingObjective?: string;
  nextRecommendedAction?: string;
  turnId: string;
}

/* ── BuildTurnPolicy ─────────────────────────────────────────────────── */
const BuildTurnPolicyStringArraySchema = z.array(z.string().trim().min(1));

export const BuildTurnPolicySchema = z
  .object({
    mode: BuildTurnPolicyModeSchema,
    conversationalPhrases: BuildTurnPolicyStringArraySchema.default([
      "oi",
      "ola",
      "opa",
      "e ai",
      "hello",
      "hi",
      "hey",
      "bom dia",
      "boa tarde",
      "boa noite",
      "tudo bem",
      "como vai",
      "valeu",
      "brigado",
      "brigada",
      "obrigado",
      "obrigada",
      "thanks",
      "thank you",
      "falou",
      "ate logo",
      "tchau",
    ]),
    workspaceTerms: BuildTurnPolicyStringArraySchema.default([
      "repo",
      "repository",
      "project",
      "codebase",
      "workspace",
      "file",
      "files",
      "folder",
      "directory",
      "module",
      "package",
      "class",
      "function",
      "component",
      "hook",
      "test",
      "tests",
      "bug",
      "issue",
      "pull request",
      "pr",
      "branch",
      "commit",
      "diff",
      "build",
      "lint",
      "stacktrace",
      "stack trace",
      "error",
      "config",
      "readme",
      "agent",
      "tool",
      "tools",
      "arquivo",
      "arquivos",
      "pasta",
      "diretorio",
      "modulo",
      "pacote",
      "classe",
      "funcao",
      "componente",
      "teste",
      "testes",
      "falha",
      "erro",
      "repositorio",
      "projeto",
      "agente",
      "ferramenta",
      "ferramentas",
      "melhoria",
      "melhorias",
      "sugestao",
      "sugestoes",
      "codigo",
      "funcionalidade",
      "funcionalidades",
    ]),
    taskVerbs: BuildTurnPolicyStringArraySchema.default([
      "read",
      "open",
      "inspect",
      "analyze",
      "analyse",
      "search",
      "find",
      "check",
      "explain",
      "summarize",
      "summarise",
      "debug",
      "fix",
      "refactor",
      "implement",
      "create",
      "edit",
      "update",
      "change",
      "run",
      "test",
      "lint",
      "review",
      "compare",
      "show",
      "plan",
      "write",
      "propose",
      "suggest",
      "improve",
      "optimize",
      "add",
      "remove",
      "delete",
      "migrate",
      "deploy",
      "build",
      "leia",
      "abra",
      "inspecione",
      "analise",
      "busque",
      "procure",
      "verifique",
      "explique",
      "resuma",
      "depure",
      "corrija",
      "refatore",
      "implemente",
      "crie",
      "edite",
      "atualize",
      "mude",
      "rode",
      "execute",
      "teste",
      "revise",
      "compare",
      "mostre",
      "planeje",
      "escreva",
      "proponha",
      "sugira",
      "melhore",
      "otimize",
      "adicione",
      "remova",
      "delete",
      "veja",
      "olhe",
      "configure",
      "migre",
      "construa",
    ]),
    fileExtensions: BuildTurnPolicyStringArraySchema.default([
      ".ts",
      ".tsx",
      ".js",
      ".jsx",
      ".mjs",
      ".cjs",
      ".json",
      ".md",
      ".py",
      ".rs",
      ".go",
      ".java",
      ".rb",
      ".php",
      ".yml",
      ".yaml",
      ".toml",
      ".sh",
    ]),
  })
  .strict()
  .default({});
export type BuildTurnPolicy = z.infer<typeof BuildTurnPolicySchema>;

/* ── MCP ─────────────────────────────────────────────────────────────── */
export const McpServerConfigSchema = z
  .object({
    name: z.string().min(1),
    command: z.string().min(1),
    args: z.array(z.string()).default([]),
    env: z.record(z.string()).optional(),
  })
  .strict();
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

/* ── TerminuzConfig ──────────────────────────────────────────────────── */
const ModeProviderOverrideSchema = z
  .object({
    provider: ProviderIdSchema.optional(),
    model: z.string().optional(),
  })
  .strict();

const ModeProviderDefaultsSchema = z
  .object({
    build: ModeProviderOverrideSchema.optional(),
    plan: ModeProviderOverrideSchema.optional(),
  })
  .strict()
  .default({});
export type ModeProviderDefaults = z.infer<typeof ModeProviderDefaultsSchema>;

export const TerminuzConfigSchema = z
  .object({
    defaultProvider: ProviderIdSchema.optional(),
    defaultModel: z.string().optional(),
    defaultModels: ProviderModelDefaultsSchema,
    modeDefaults: ModeProviderDefaultsSchema,
    maxIterations: z.number().int().positive().default(20),
    autoContinue: z.enum(["off", "ask", "on"]).default("ask").optional(),
    maxContinuationRounds: z
      .number()
      .int()
      .positive()
      .default(3)
      .optional()
      .describe("Maximum number of automatic continuation rounds when autoContinue is 'on'"),
    continuationCheckpointEvery: z
      .number()
      .int()
      .positive()
      .default(10)
      .optional()
      .describe("Emit a progress checkpoint every N iterations"),
    providerRetries: z.number().int().min(0).max(5).default(2),
    temperature: z.number().min(0).max(2).default(0.2),
    maxTokens: z.number().int().positive().default(2048),
    cache: z
      .object({
        enabled: z.boolean().default(true),
        ttlSeconds: z.number().int().positive().max(86400).default(300),
      })
      .strict()
      .default({}),
    providers: z
      .object({
        openrouter: ProviderConfigSchema.default({}),
        anthropic: ProviderConfigSchema.default({}),
        openai: ProviderConfigSchema.default({}),
        deepseek: ProviderConfigSchema.default({}),
        opencode: ProviderConfigSchema.default({}),
        groq: ProviderConfigSchema.default({}),
        ollama: ProviderConfigSchema.default({ baseUrl: "http://localhost:11434/v1" }),
      })
      .strict()
      .default({}),
    permissions: z
      .object({
        read: PermissionModeSchema.default("allow"),
        write: PermissionModeSchema.default("ask"),
        gitLocal: PermissionModeSchema.default("allow"),
        shell: PermissionModeSchema.default("ask"),
        mcp: PermissionModeSchema.default("ask"),
        dangerous: PermissionModeSchema.default("ask"),
        allowShell: z.array(z.string()).default(["git status", "git diff"]),
      })
      .strict()
      .default({}),
    mcpPermissions: z.record(PermissionModeSchema).default({}),
    agentPermissions: z
      .object({
        build: z
          .object({
            shell: PermissionModeSchema.optional(),
            dangerous: PermissionModeSchema.optional(),
            write: PermissionModeSchema.optional(),
            read: PermissionModeSchema.optional(),
            gitLocal: PermissionModeSchema.optional(),
            askBeforeExecute: z.boolean().optional(),
          })
          .strict()
          .optional(),
        plan: z
          .object({
            shell: PermissionModeSchema.optional(),
            dangerous: PermissionModeSchema.optional(),
            write: PermissionModeSchema.optional(),
            read: PermissionModeSchema.optional(),
            gitLocal: PermissionModeSchema.optional(),
            askBeforeExecute: z.boolean().optional(),
          })
          .strict()
          .optional(),
      })
      .optional(),
    paths: z
      .object({
        whitelist: z.array(z.string()).default(["${WORKTREE}/**"]),
        blacklist: z
          .array(z.string())
          .default([
            "**/.env",
            "**/.env.*",
            "**/.ssh/**",
            "**/.aws/**",
            "**/node_modules/**",
            "/etc/**",
            "/usr/bin/**",
            "${HOME}/.config/**",
            "app-cmd://**",
          ]),
      })
      .strict()
      .default({}),
    web: z
      .object({
        allowlist: z.array(z.string()).default([]),
        blacklist: z.array(z.string()).default([]),
      })
      .strict()
      .default({}),
    lsp: z
      .object({
        servers: z.array(LspServerConfigSchema).default([]),
      })
      .strict()
      .default({}),
    github: z
      .object({
        token: z.string().optional(),
        enterpriseUrl: z.string().url().optional(),
        oauthClientId: z.string().optional(),
        oauthScopes: z.array(z.string().min(1)).default([]),
      })
      .strict()
      .default({}),
    tui: z
      .object({
        theme: z.enum(["dark", "light", "high-contrast", "nord", "dracula"]).default("dark"),
        compactMode: z.boolean().default(false),
        showInputPreview: z.boolean().default(true),
        language: z.enum(["en", "pt-BR"]).default("en"),
      })
      .strict()
      .default({}),
    buildTurnPolicy: BuildTurnPolicySchema,
    agentMode: AgentModeSchema,
    strictMode: z
      .boolean()
      .default(false)
      .describe("When true, stop execution on first task failure"),
    taskRetries: z
      .number()
      .int()
      .min(0)
      .max(3)
      .default(1)
      .describe("Number of retry attempts per task on failure"),
    subagentConcurrency: z
      .number()
      .int()
      .positive()
      .max(16)
      .default(4)
      .describe("Maximum parallel sub-agents when running tasks"),
    contextWindowThreshold: z
      .number()
      .min(0.5)
      .max(0.95)
      .default(0.8)
      .describe("Fraction of estimated context window at which to auto-summarize history"),
    tokenBudget: z
      .object({
        maxInputTokens: z.number().int().positive().optional(),
        maxOutputTokens: z.number().int().positive().optional(),
        maxCostUsd: z.number().positive().optional(),
        warnAtFraction: z.number().min(0).max(1).default(0.8),
      })
      .strict()
      .default({}),
    mcpServers: z.array(McpServerConfigSchema).default([]),
    telemetry: z
      .object({
        enabled: z.boolean().default(true),
        persistHistory: z.boolean().default(true),
      })
      .strict()
      .default({}),
  })
  .strict();
export type TerminuzConfig = z.infer<typeof TerminuzConfigSchema>;

/** @deprecated Use TerminuzConfigSchema. Kept during the DeepCode migration window. */
export const DeepCodeConfigSchema = TerminuzConfigSchema;
/** @deprecated Use TerminuzConfig. Kept during the DeepCode migration window. */
export type DeepCodeConfig = TerminuzConfig;

/* ── ModelSelection ──────────────────────────────────────────────────── */
export interface ModelSelection {
  provider: ProviderId;
  model: string;
}

export function formatModelSelection(selection: ModelSelection): string {
  return `${selection.provider}/${selection.model}`;
}

export function parseModelSelection(
  value: string,
  fallbackProvider?: ProviderId,
): ModelSelection | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const [candidateProvider, ...rest] = trimmed.split("/");
  const parsedProvider = ProviderIdSchema.safeParse(candidateProvider);
  if (parsedProvider.success && rest.length > 0) {
    return { provider: parsedProvider.data, model: rest.join("/") };
  }

  if (!fallbackProvider) return null;

  return { provider: fallbackProvider, model: trimmed };
}

export function resolveConfiguredModelForProvider(
  config: Pick<TerminuzConfig, "defaultModel" | "defaultModels" | "defaultProvider">,
  providerId: ProviderId,
): string | undefined {
  return (
    config.defaultModels?.[providerId] ??
    (providerId === config.defaultProvider ? config.defaultModel : undefined)
  );
}

/* ── Credential helpers ──────────────────────────────────────────────── */
export function hasProviderCredentials(
  providerConfig: { apiKey?: string; apiKeyFile?: string } | undefined,
  providerId?: ProviderId,
): boolean {
  if (providerId && CREDENTIAL_FREE_PROVIDERS.has(providerId)) return true;
  return Boolean(providerConfig?.apiKey?.trim() || providerConfig?.apiKeyFile?.trim());
}

export function hasAnyProviderCredentials(config: Pick<TerminuzConfig, "providers">): boolean {
  return PROVIDER_IDS.some(
    (id) => !CREDENTIAL_FREE_PROVIDERS.has(id) && hasProviderCredentials(config.providers[id], id),
  );
}

export interface ResolvedProviderTarget {
  provider: ProviderId;
  model?: string;
  hasCredentials: boolean;
}

export function resolveUsableProviderTarget(
  config: Pick<TerminuzConfig, "defaultProvider" | "defaultModel" | "defaultModels" | "providers">,
  preferredProviders: readonly (ProviderId | undefined)[] = [],
): ResolvedProviderTarget {
  const orderedProviders = uniqueProviderIds([
    ...preferredProviders,
    config.defaultProvider,
    ...PROVIDER_IDS,
  ]);
  let firstWithCredentials: ResolvedProviderTarget | undefined;
  let firstWithModel: ResolvedProviderTarget | undefined;

  for (const providerId of orderedProviders) {
    const target: ResolvedProviderTarget = {
      provider: providerId,
      model: resolveConfiguredModelForProvider(config, providerId),
      hasCredentials: hasProviderCredentials(config.providers[providerId], providerId),
    };

    if (target.hasCredentials && target.model) return target;
    if (target.model && !firstWithModel) firstWithModel = target;
    if (target.hasCredentials && !firstWithCredentials) firstWithCredentials = target;
  }

  if (firstWithModel) return firstWithModel;
  if (firstWithCredentials) return firstWithCredentials;

  const fallbackProvider: ProviderId = orderedProviders[0] ?? "openrouter";
  return {
    provider: fallbackProvider,
    model: resolveConfiguredModelForProvider(config, fallbackProvider),
    hasCredentials: hasProviderCredentials(config.providers[fallbackProvider], fallbackProvider),
  };
}

function uniqueProviderIds(providerIds: readonly (ProviderId | undefined)[]): ProviderId[] {
  const seen = new Set<ProviderId>();
  const ordered: ProviderId[] = [];
  for (const id of providerIds) {
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }
  return ordered;
}

/* ── Telemetry ──────────────────────────────────────────────────────── */
export const TelemetryEventSchema = z.object({
  sessionId: z.string(),
  timestamp: z.string(),
  provider: ProviderIdSchema,
  model: z.string(),
  inputTokens: z.number().default(0),
  outputTokens: z.number().default(0),
  estimatedCost: z.number().default(0),
  toolCalls: z
    .array(
      z.object({
        name: z.string(),
        timestamp: z.string(),
      }),
    )
    .default([]),
  duration: z.number().default(0),
});
export type TelemetryEvent = z.infer<typeof TelemetryEventSchema>;

export const SessionTelemetrySchema = z.object({
  sessionId: z.string(),
  provider: ProviderIdSchema,
  model: z.string(),
  totalInputTokens: z.number().default(0),
  totalOutputTokens: z.number().default(0),
  totalCost: z.number().default(0),
  totalToolCalls: z.number().default(0),
  totalErrors: z.number().default(0),
  startTime: z.string(),
  endTime: z.string().optional(),
  events: z.array(TelemetryEventSchema).default([]),
});
export type SessionTelemetry = z.infer<typeof SessionTelemetrySchema>;

/* ── UI types (TUI state) ───────────────────────────────────────────── */
export type ViewMode = "chat" | "config" | "sessions" | "help" | "debug";
export type VimMode = "normal" | "insert";
export type ModalType = "provider" | "model" | "telemetry" | "input-preview" | null;

export interface SidebarTab {
  id: "sessions" | "activities" | "plan" | "telemetry";
}

export interface RecentModelSelection {
  provider: ProviderId;
  model: string;
}

export interface UIState {
  lastActiveSessionId?: string;
  lastSessionTimestamp?: number;
  viewMode: ViewMode;
  sidebarTab: SidebarTab;
  agentMode: AgentMode;
  vimMode: VimMode;
  selectedSessionIndex: number;
  inputHistory: string[];
  modals: {
    providerExpanded: boolean;
    modelFilter: string;
    recentModels: RecentModelSelection[];
  };
  version: number;
  savedAt: string;
}

export interface ConfigFieldDef {
  key: ConfigEditField;
  label: string;
  type: "select" | "number" | "toggle" | "text";
  options?: string[];
}

export type ConfigEditField =
  | "defaultProvider"
  | `defaultModels.${ProviderId}`
  | "buildTurnPolicy.mode"
  | "providers.openrouter.apiKey"
  | "providers.anthropic.apiKey"
  | "providers.openai.apiKey"
  | "providers.deepseek.apiKey"
  | "providers.opencode.apiKey"
  | "providers.groq.apiKey"
  | "providers.ollama.baseUrl"
  | "cache.enabled"
  | "cache.ttlSeconds"
  | "permissions.read"
  | "permissions.write"
  | "permissions.shell"
  | "permissions.mcp"
  | "permissions.dangerous"
  | "permissions.gitLocal"
  | "permissions.allowShell"
  | `mcpPermissions.${string}`
  | "agentPermissions.build.shell"
  | "agentPermissions.build.dangerous"
  | "agentPermissions.build.write"
  | "agentPermissions.build.read"
  | "agentPermissions.build.gitLocal"
  | "agentPermissions.plan.shell"
  | "agentPermissions.plan.dangerous"
  | "agentPermissions.plan.write"
  | "agentPermissions.plan.read"
  | "agentPermissions.plan.gitLocal"
  | "paths.whitelist"
  | "paths.blacklist"
  | "web.allowlist"
  | "web.blacklist"
  | "github.oauthClientId"
  | "tui.theme"
  | "tui.compactMode"
  | "tui.showInputPreview"
  | "tui.language";

export interface SlashCommandDef {
  command: string;
  label: string;
  description: string;
}

export interface ChatPreflightIssue {
  message: string;
  notice: string;
  modal?: ModalType;
}

export type InitialSessionSelection =
  | { type: "reuse"; session: Session }
  | { type: "create"; provider: ProviderId; model?: string };
