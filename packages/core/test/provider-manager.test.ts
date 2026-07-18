import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Chunk,
  DeepCodeConfig,
  Message,
  Model,
  ProviderId,
} from "@terminuz/shared";
import { ProviderError } from "../src/errors.js";
import {
  ProviderManager,
  type ProviderRouteEvent,
} from "../src/providers/provider-manager.js";
import type {
  LLMProvider,
  ProviderCapabilities,
  ProviderChatOptions,
} from "../src/providers/provider.js";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("ProviderManager", () => {
  it("does not fail over after a provider already emitted streamed output", async () => {
    const manager = new ProviderManager(createConfig());
    manager.register(new PartialFailureProvider());
    manager.register(new FallbackProvider());

    const chunks: Chunk[] = [];
    let error: unknown;

    try {
      for await (const chunk of manager.chat([], {
        preferredProvider: "openrouter",
        failover: ["openai"],
      })) {
        chunks.push(chunk);
      }
    } catch (caught) {
      error = caught;
    }

    expect(chunks).toEqual([{ type: "delta", content: "partial" }]);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("stream disconnected");
  });

  it("retries on 429 rate-limit errors up to the configured retry limit", async () => {
    let calls = 0;
    const manager = new ProviderManager(createConfig({ providerRetries: 2 }));
    manager.register(makeCountingProvider("openrouter", () => {
      calls++;
      throw new ProviderError("rate limited", "openrouter", undefined, { statusCode: 429, retryAfterMs: 0 });
    }));

    let caught: unknown;
    try {
      for await (const _ of manager.chat([], { preferredProvider: "openrouter" })) { void _; }
    } catch (e) { caught = e; }

    expect(calls).toBe(3); // initial attempt + 2 retries
    expect(caught).toBeInstanceOf(ProviderError);
  });

  it("does not retry on 401 authentication errors", async () => {
    let calls = 0;
    const manager = new ProviderManager(createConfig({ providerRetries: 2 }));
    manager.register(makeCountingProvider("openrouter", () => {
      calls++;
      throw new ProviderError("unauthorized", "openrouter", undefined, { statusCode: 401 });
    }));

    let caught: unknown;
    try {
      for await (const _ of manager.chat([], { preferredProvider: "openrouter" })) { void _; }
    } catch (e) { caught = e; }

    expect(calls).toBe(1); // no retries for auth errors
    expect(caught).toBeInstanceOf(ProviderError);
  });

  it("still fails over to the next provider after a non-retryable error", async () => {
    const results: string[] = [];
    const manager = new ProviderManager(createConfig({
      providerRetries: 2,
      defaultModels: { openai: "gpt-4o" },
      providers: { openai: { apiKey: "openai-secret" } },
    }));
    manager.register(makeCountingProvider("openrouter", () => {
      results.push("primary-fail");
      throw new ProviderError("unauthorized", "openrouter", undefined, { statusCode: 401 });
    }));
    manager.register(makeStreamingProvider("openai", "ok from fallback"));

    for await (const chunk of manager.chat([], { preferredProvider: "openrouter", failover: ["openai"] })) {
      if (chunk.type === "delta") results.push(chunk.content);
    }

    expect(results).toEqual(["primary-fail", "ok from fallback"]);
  });

  it("routes around a transiently unhealthy provider on subsequent calls", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T12:00:00Z"));
    let primaryCalls = 0;
    let fallbackCalls = 0;
    const routeEvents: ProviderRouteEvent[] = [];
    const manager = new ProviderManager(createConfig({
      providerRetries: 0,
      defaultModels: { openai: "gpt-4o" },
      providers: { openai: { apiKey: "openai-secret" } },
    }));
    manager.register(makeCountingProvider("openrouter", () => {
      primaryCalls += 1;
      if (primaryCalls === 1) {
        throw new ProviderError("service unavailable", "openrouter", undefined, {
          statusCode: 503,
          retryAfterMs: 45_000,
        });
      }
    }));
    manager.register(makeCountingProvider("openai", () => {
      fallbackCalls += 1;
    }));

    const chatOptions = {
      preferredProvider: "openrouter" as const,
      failover: ["openai" as const],
      onRoute: (event: ProviderRouteEvent) => routeEvents.push(event),
    };
    for await (const _ of manager.chat([], chatOptions)) { void _; }
    for await (const _ of manager.chat([], chatOptions)) { void _; }

    expect(primaryCalls).toBe(1);
    expect(fallbackCalls).toBe(2);

    vi.advanceTimersByTime(45_001);
    for await (const _ of manager.chat([], chatOptions)) { void _; }

    expect(primaryCalls).toBe(2);
    expect(fallbackCalls).toBe(2);
    expect(routeEvents).toContainEqual(expect.objectContaining({
      type: "cooldown",
      provider: "openrouter",
      statusCode: 503,
      retryAfterMs: 45_000,
    }));
    expect(routeEvents).toContainEqual(expect.objectContaining({
      type: "skipped",
      provider: "openrouter",
      reason: "cooldown",
    }));
    expect(routeEvents).toContainEqual(expect.objectContaining({
      type: "failover",
      fromProvider: "openrouter",
      provider: "openai",
    }));
    expect(routeEvents).toContainEqual(expect.objectContaining({
      type: "success",
      provider: "openrouter",
    }));
  });

  it("skips failover providers without configured credentials", async () => {
    let fallbackCalls = 0;
    const routeEvents: ProviderRouteEvent[] = [];
    const manager = new ProviderManager(createConfig({
      providerRetries: 0,
      defaultModels: { openai: "gpt-4o" },
    }));
    manager.register(makeCountingProvider("openrouter", () => {
      throw new ProviderError("unauthorized", "openrouter", undefined, { statusCode: 401 });
    }));
    manager.register(makeCountingProvider("openai", () => {
      fallbackCalls += 1;
    }));

    let caught: unknown;
    try {
      for await (const _ of manager.chat([], {
        preferredProvider: "openrouter",
        failover: ["openai"],
        onRoute: (event) => routeEvents.push(event),
      })) { void _; }
    } catch (error) {
      caught = error;
    }

    expect(fallbackCalls).toBe(0);
    expect(caught).toBeInstanceOf(ProviderError);
    expect(routeEvents).toContainEqual({
      type: "skipped",
      provider: "openai",
      model: "gpt-4o",
      reason: "missing_credentials",
    });
  });

  it("skips failover providers that have no configured model to avoid cross-provider model name confusion", async () => {
    const results: string[] = [];
    const manager = new ProviderManager(createConfig({
      providerRetries: 0,
      defaultModels: {},
    }));
    manager.register(makeCountingProvider("openrouter", () => {
      results.push("primary-fail");
      throw new ProviderError("model not found", "openrouter", undefined, { statusCode: 404 });
    }));
    manager.register(makeStreamingProvider("openai", "ok from fallback"));

    let caught: unknown;
    try {
      for await (const chunk of manager.chat([], {
        preferredProvider: "openrouter",
        failover: ["openai"],
        model: "some-provider-specific-model",
      })) {
        if (chunk.type === "delta") results.push(chunk.content);
      }
    } catch (e) { caught = e; }

    expect(results).toEqual(["primary-fail"]);
    expect(caught).toBeInstanceOf(ProviderError);
  });

  it("accepts OpenCode model identifiers with the documented opencode-go/ prefix", async () => {
    const manager = new ProviderManager(createConfig({
      defaultProvider: "opencode",
      defaultModels: {
        opencode: "opencode-go/kimi-k2.6",
      },
      providers: {
        opencode: { apiKey: "opencode-secret" },
      },
    }));
    manager.register(new OpenCodeValidationProvider());

    const result = await manager.validateProviderModel("opencode");

    expect(result.model).toBe("kimi-k2.6");
    expect(result.modelFound).toBe(true);
    expect(result.modelCatalogStatus).toBe("checked");
    expect(result.responseText).toBe("OK");
  });

  it("retries transient validation errors using the configured provider retry policy", async () => {
    const manager = new ProviderManager(createConfig({
      providerRetries: 2,
      defaultModels: {
        openrouter: "test-model",
      },
    }));
    const provider = new RetryingValidationProvider([429]);
    manager.register(provider);

    const result = await manager.validateProviderModel("openrouter");

    expect(result.responseText).toBe("OK");
    expect(provider.completeCalls).toBe(2);
  });

  it("does not retry non-retryable validation errors", async () => {
    const manager = new ProviderManager(createConfig({
      providerRetries: 2,
      defaultModels: {
        openrouter: "test-model",
      },
    }));
    const provider = new RetryingValidationProvider([401]);
    manager.register(provider);

    await expect(manager.validateProviderModel("openrouter")).rejects.toMatchObject({
      statusCode: 401,
    });
    expect(provider.completeCalls).toBe(1);
  });

  it("does not let a slow model catalog inflate validation latency", async () => {
    const manager = new ProviderManager(createConfig({
      defaultModels: {
        openrouter: "fast-model",
      },
    }));
    const provider = new SlowModelCatalogValidationProvider();
    manager.register(provider);

    const result = await manager.validateProviderModel("openrouter", {
      timeoutMs: 1_000,
    });

    expect(result.responseText).toBe("OK");
    expect(result.modelCount).toBe(0);
    expect(result.modelCatalogStatus).toBe("skipped");
    expect(result.latencyMs).toBeLessThan(250);
    expect(provider.catalogAborted).toBe(true);
  });

  it("sends Groq qwen3 requests with reasoning disabled and Groq token field names", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        [
          "data: {\"choices\":[{\"delta\":{\"content\":\"ok\"}}]}",
          "",
          "data: [DONE]",
          "",
        ].join("\n"),
        { status: 200 },
      ));
    vi.stubGlobal("fetch", fetchSpy);
    const manager = new ProviderManager(createConfig({
      defaultProvider: "groq",
      defaultModels: {
        groq: "qwen3-32b",
      },
      providers: {
        groq: { apiKey: "groq-secret" },
      },
    }));

    const chunks: Chunk[] = [];
    for await (const chunk of manager.chat([], {
      preferredProvider: "groq",
      model: "qwen3-32b",
      maxTokens: 123,
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual({ type: "delta", content: "ok" });
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit] | undefined;
    const body = JSON.parse(String(callArgs?.[1]?.body ?? "{}"));
    expect(body.max_tokens).toBeUndefined();
    expect(body.max_completion_tokens).toBe(123);
    expect(body.reasoning_effort).toBe("none");
    expect(body.include_reasoning).toBe(false);
  });

  describe("checkModelInCatalog", () => {
    it("returns found=true when the model is in the catalog", async () => {
      const manager = new ProviderManager(createConfig());
      manager.register(new FixedCatalogProvider("openrouter", ["gpt-4o", "deepseek/deepseek-v3"]));

      const result = await manager.checkModelInCatalog("openrouter", "deepseek/deepseek-v3");

      expect(result.found).toBe(true);
      expect(result.catalogSize).toBe(2);
    });

    it("returns found=false when the model is not in the catalog", async () => {
      const manager = new ProviderManager(createConfig());
      manager.register(new FixedCatalogProvider("deepseek", ["deepseek-chat", "deepseek-reasoner"]));

      const result = await manager.checkModelInCatalog("deepseek", "claude");

      expect(result.found).toBe(false);
      expect(result.availableModels).toEqual(["deepseek-chat", "deepseek-reasoner"]);
    });

    it("returns found=true when catalog is empty (cannot validate — do not block)", async () => {
      const manager = new ProviderManager(createConfig());
      manager.register(new FixedCatalogProvider("ollama", []));

      const result = await manager.checkModelInCatalog("ollama", "llama3");

      expect(result.found).toBe(true);
      expect(result.catalogSize).toBe(0);
    });

    it("returns found=true when catalog fetch fails (network error — do not block)", async () => {
      const manager = new ProviderManager(createConfig());
      manager.register(new FailingCatalogProvider("openrouter"));

      const result = await manager.checkModelInCatalog("openrouter", "any-model");

      expect(result.found).toBe(true);
    });

    it("normalizes opencode-go/ model prefix before catalog comparison", async () => {
      const manager = new ProviderManager(createConfig());
      manager.register(new FixedCatalogProvider("opencode", ["kimi-k2.6"]));

      const result = await manager.checkModelInCatalog("opencode", "opencode-go/kimi-k2.6");

      expect(result.found).toBe(true);
    });
  });
});

class FixedCatalogProvider implements LLMProvider {
  readonly name = "FixedCatalogProvider";
  readonly capabilities: ProviderCapabilities = {
    streaming: true, functionCalling: true, jsonMode: true, vision: false, maxContextLength: 128_000,
  };

  constructor(readonly id: ProviderId, private readonly modelIds: string[]) {}

  async *chat(): AsyncIterable<Chunk> { yield { type: "done" }; }
  async complete(): Promise<string> { return "OK"; }
  async validateConfig(): Promise<boolean> { return true; }

  async listModels(): Promise<Model[]> {
    return this.modelIds.map((id) => ({
      id,
      name: id,
      provider: this.id,
      contextLength: 128_000,
      capabilities: { streaming: true, functionCalling: true, jsonMode: true, vision: false },
    }));
  }
}

class FailingCatalogProvider implements LLMProvider {
  readonly name = "FailingCatalogProvider";
  readonly capabilities: ProviderCapabilities = {
    streaming: true, functionCalling: true, jsonMode: true, vision: false, maxContextLength: 128_000,
  };

  constructor(readonly id: ProviderId) {}

  async *chat(): AsyncIterable<Chunk> { yield { type: "done" }; }
  async complete(): Promise<string> { return "OK"; }
  async validateConfig(): Promise<boolean> { return true; }
  async listModels(): Promise<Model[]> { throw new Error("network error"); }
}

class RetryingValidationProvider implements LLMProvider {
  readonly id = "openrouter" as const;
  readonly name = "RetryingValidationProvider";
  readonly capabilities: ProviderCapabilities = {
    streaming: true, functionCalling: true, jsonMode: true, vision: false, maxContextLength: 128_000,
  };
  completeCalls = 0;

  constructor(private readonly statuses: number[]) {}

  async *chat(): AsyncIterable<Chunk> { yield { type: "done" }; }

  async complete(): Promise<string> {
    const statusCode = this.statuses[this.completeCalls];
    this.completeCalls += 1;
    if (statusCode !== undefined) {
      throw new ProviderError("validation failed", this.id, undefined, {
        statusCode,
        retryAfterMs: 0,
      });
    }
    return "OK";
  }

  async validateConfig(): Promise<boolean> { return true; }
  async listModels(): Promise<Model[]> { return []; }
}

class PartialFailureProvider implements LLMProvider {
  readonly id = "openrouter" as const;
  readonly name = "PartialFailureProvider";
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true,
    jsonMode: true,
    vision: false,
    maxContextLength: 128_000,
  };

  async *chat(_messages: Message[], _options: ProviderChatOptions): AsyncIterable<Chunk> {
    yield { type: "delta", content: "partial" };
    throw new Error("stream disconnected");
  }

  async complete(): Promise<string> {
    return "unused";
  }

  async listModels(): Promise<Model[]> {
    return [];
  }

  async validateConfig(): Promise<boolean> {
    return true;
  }
}

class FallbackProvider implements LLMProvider {
  readonly id = "openai" as const;
  readonly name = "FallbackProvider";
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true,
    jsonMode: true,
    vision: false,
    maxContextLength: 128_000,
  };

  async *chat(_messages: Message[], _options: ProviderChatOptions): AsyncIterable<Chunk> {
    yield { type: "delta", content: "fallback" };
    yield { type: "done" };
  }

  async complete(): Promise<string> {
    return "unused";
  }

  async listModels(): Promise<Model[]> {
    return [];
  }

  async validateConfig(): Promise<boolean> {
    return true;
  }
}

class SlowModelCatalogValidationProvider implements LLMProvider {
  readonly id = "openrouter" as const;
  readonly name = "SlowModelCatalogValidationProvider";
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true,
    jsonMode: true,
    vision: false,
    maxContextLength: 128_000,
  };
  catalogAborted = false;

  async *chat(_messages: Message[], _options: ProviderChatOptions): AsyncIterable<Chunk> {
    yield { type: "done" };
  }

  async complete(): Promise<string> {
    return "OK";
  }

  async listModels(options: { signal?: AbortSignal } = {}): Promise<Model[]> {
    return new Promise((resolve) => {
      if (options.signal?.aborted) {
        this.catalogAborted = true;
        resolve([]);
        return;
      }

      const timeout = setTimeout(() => {
        resolve([
          {
            id: "fast-model",
            name: "Fast Model",
            provider: "openrouter",
            contextLength: 128_000,
            capabilities: {
              streaming: true,
              functionCalling: true,
              jsonMode: true,
              vision: false,
            },
          },
        ]);
      }, 5_000);
      options.signal?.addEventListener(
        "abort",
        () => {
          this.catalogAborted = true;
          clearTimeout(timeout);
          resolve([]);
        },
        { once: true },
      );
    });
  }

  async validateConfig(): Promise<boolean> {
    return true;
  }
}

class OpenCodeValidationProvider implements LLMProvider {
  readonly id = "opencode" as const;
  readonly name = "OpenCodeValidationProvider";
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true,
    jsonMode: true,
    vision: false,
    maxContextLength: 128_000,
  };

  async *chat(_messages: Message[], _options: ProviderChatOptions): AsyncIterable<Chunk> {
    yield { type: "done" };
  }

  async complete(prompt: string, options?: Omit<ProviderChatOptions, "tools">): Promise<string> {
    expect(prompt).toBe("Reply exactly with: OK");
    expect(options?.model).toBe("kimi-k2.6");
    return "OK";
  }

  async listModels(): Promise<Model[]> {
    return [
      {
        id: "kimi-k2.6",
        name: "Kimi K2.6",
        provider: "opencode",
        contextLength: 128_000,
        capabilities: {
          streaming: true,
          functionCalling: true,
          jsonMode: true,
          vision: false,
        },
      },
    ];
  }

  async validateConfig(): Promise<boolean> {
    return true;
  }
}

function createConfig(overrides: { providers?: Record<string, { apiKey?: string; apiKeyFile?: string; baseUrl?: string }> } & Omit<Partial<DeepCodeConfig>, "providers"> = {}): DeepCodeConfig {
  const { providers: overrideProviders, ...restOverrides } = overrides;

  const providers = {
    openrouter: {},
    anthropic: {},
    openai: {},
    deepseek: {},
    opencode: {},
    groq: {},
    ollama: {},
    ...overrideProviders,
  };

  return {
    defaultProvider: "openrouter",
    defaultModel: "test-model",
    defaultModels: overrides.defaultModels ?? {},
    modeDefaults: overrides.modeDefaults ?? {},
    maxIterations: 20,
    providerRetries: 0,
    temperature: 0.2,
    maxTokens: 4096,
    cache: { enabled: true, ttlSeconds: 300 },
    providers,
    permissions: {
      read: "allow",
      write: "ask",
      gitLocal: "allow",
      shell: "ask",
      mcp: "ask",
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
    ...restOverrides,
    mcpPermissions: restOverrides.mcpPermissions ?? {},
  };
}

const BASE_CAPABILITIES: ProviderCapabilities = {
  streaming: true,
  functionCalling: true,
  jsonMode: true,
  vision: false,
  maxContextLength: 128_000,
};

function makeCountingProvider(
  id: "openrouter" | "openai" | "anthropic" | "deepseek" | "opencode",
  onChat: () => void,
): LLMProvider {
  return {
    id,
    name: `CountingProvider(${id})`,
    capabilities: BASE_CAPABILITIES,
    async *chat(): AsyncIterable<Chunk> {
      onChat();
      yield { type: "done" };
    },
    async complete() { return ""; },
    async listModels() { return []; },
    async validateConfig() { return true; },
  };
}

function makeStreamingProvider(
  id: "openrouter" | "openai" | "anthropic" | "deepseek" | "opencode",
  content: string,
): LLMProvider {
  return {
    id,
    name: `StreamingProvider(${id})`,
    capabilities: BASE_CAPABILITIES,
    async *chat(): AsyncIterable<Chunk> {
      yield { type: "delta", content };
      yield { type: "done" };
    },
    async complete() { return content; },
    async listModels() { return []; },
    async validateConfig() { return true; },
  };
}
