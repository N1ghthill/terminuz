import { describe, expect, it } from "vitest";
import type { DeepCodeConfig } from "@deepcode/shared";
import { resolveSessionTarget } from "../src/target-resolution.js";

describe("resolveSessionTarget", () => {
  it("treats slash model ids as raw model ids when provider is explicit", () => {
    const target = resolveSessionTarget(createConfig(), {
      provider: "openrouter",
      model: "openai/gpt-4o",
    });

    expect(target).toEqual({
      provider: "openrouter",
      model: "openai/gpt-4o",
    });
  });

  it("still supports provider/model shorthand when provider is not explicit", () => {
    const target = resolveSessionTarget(createConfig(), {
      model: "openai/gpt-4o",
    });

    expect(target).toEqual({
      provider: "openai",
      model: "gpt-4o",
    });
  });
});

function createConfig(overrides: Partial<DeepCodeConfig> = {}): DeepCodeConfig {
  const { providers, defaultModels, ...rest } = overrides;

  return {
    defaultProvider: "openrouter",
    defaultModel: undefined,
    defaultModels: defaultModels ?? {},
    modeDefaults: {},
    maxIterations: 20,
    providerRetries: 2,
    temperature: 0.2,
    maxTokens: 4096,
    cache: { enabled: true, ttlSeconds: 300 },
    providers: {
      openrouter: { apiKey: "openrouter-key" },
      anthropic: {},
      openai: { apiKey: "openai-key" },
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
      dangerous: "ask",
      allowShell: ["git status"],
    },
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
