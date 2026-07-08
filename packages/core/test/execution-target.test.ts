import { describe, expect, it } from "vitest";
import type { DeepCodeConfig, Session } from "@deepcode/shared";
import { resolveExecutionTarget } from "../src/agent/execution-target.js";

describe("resolveExecutionTarget", () => {
  it("keeps a pinned session provider even when that provider has no model", () => {
    const config = createConfig({
      providers: {
        openrouter: { apiKey: "openrouter-key" },
        deepseek: { apiKey: "deepseek-key" },
      },
      defaultModels: {
        openrouter: "openrouter/model",
      },
    });

    const target = resolveExecutionTarget(
      config,
      createSessionTarget({ provider: "deepseek", metadata: { providerPinned: true } }),
      "build",
    );

    expect(target).toEqual({ provider: "deepseek", model: undefined });
  });

  it("keeps an explicit provider override even when another provider has a configured model", () => {
    const config = createConfig({
      providers: {
        openrouter: { apiKey: "openrouter-key" },
        openai: { apiKey: "openai-key" },
      },
      defaultModels: {
        openrouter: "openrouter/model",
      },
    });

    const target = resolveExecutionTarget(
      config,
      createSessionTarget({ provider: "openrouter", model: "openrouter/model" }),
      "build",
      "openai",
    );

    expect(target).toEqual({ provider: "openai", model: undefined });
  });

  it("still falls back for an unpinned stale session target", () => {
    const config = createConfig({
      providers: {
        openrouter: { apiKey: "openrouter-key" },
        deepseek: { apiKey: "deepseek-key" },
      },
      defaultModels: {
        openrouter: "openrouter/model",
      },
    });

    const target = resolveExecutionTarget(
      config,
      createSessionTarget({ provider: "deepseek" }),
      "build",
    );

    expect(target).toEqual({ provider: "openrouter", model: "openrouter/model", hasCredentials: true });
  });
});

function createSessionTarget(
  overrides: Partial<Pick<Session, "provider" | "model" | "metadata">> = {},
): Pick<Session, "provider" | "model" | "metadata"> {
  return {
    provider: "openrouter",
    model: undefined,
    metadata: {},
    ...overrides,
  };
}

function createConfig(overrides: {
  providers?: Partial<DeepCodeConfig["providers"]>;
  defaultModels?: Partial<DeepCodeConfig["defaultModels"]>;
  modeDefaults?: Partial<DeepCodeConfig["modeDefaults"]>;
} & Omit<Partial<DeepCodeConfig>, "providers" | "defaultModels" | "modeDefaults"> = {}): DeepCodeConfig {
  const { providers, defaultModels, modeDefaults, ...rest } = overrides;

  return {
    defaultProvider: "openrouter",
    defaultModel: undefined,
    defaultModels: defaultModels ?? {},
    modeDefaults: modeDefaults ?? {},
    maxIterations: 20,
    providerRetries: 2,
    temperature: 0.2,
    maxTokens: 4096,
    cache: { enabled: true, ttlSeconds: 300 },
    providers: {
      openrouter: {},
      anthropic: {},
      openai: {},
      deepseek: {},
      opencode: {},
      groq: {},
      ollama: {},
      ...providers,
    },
    permissions: {
      read: "allow",
      write: "ask",
      gitLocal: "allow",
      shell: "ask",
      mcp: "ask",
      dangerous: "ask",
      allowShell: ["git status"],
    },
    mcpPermissions: {},
    paths: { whitelist: ["${WORKTREE}/**"], blacklist: [] },
    web: { allowlist: [], blacklist: [] },
    lsp: { servers: [] },
    github: { oauthScopes: [] },
    tui: { theme: "dark", compactMode: false, showInputPreview: true, language: "en" },
    buildTurnPolicy: {
      mode: "heuristic",
      conversationalPhrases: ["oi"],
      workspaceTerms: ["repo"],
      taskVerbs: ["mostrar"],
      fileExtensions: [".ts"],
    },
    agentMode: "build",
    strictMode: false,
    taskRetries: 1,
    subagentConcurrency: 4,
    contextWindowThreshold: 0.8,
    tokenBudget: { warnAtFraction: 0.8 },
    mcpServers: [],
    telemetry: { enabled: true, persistHistory: true },
    ...rest,
  };
}
