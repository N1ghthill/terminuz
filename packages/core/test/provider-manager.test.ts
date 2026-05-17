import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  Chunk,
  DeepCodeConfig,
  Message,
  Model,
} from "@deepcode/shared";
import { ProviderError } from "../src/errors.js";
import { ProviderManager } from "../src/providers/provider-manager.js";
import type {
  LLMProvider,
  ProviderCapabilities,
  ProviderChatOptions,
} from "../src/providers/provider.js";

afterEach(() => {
  vi.unstubAllGlobals();
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
    const manager = new ProviderManager(createConfig({ providerRetries: 2 }));
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
    expect(result.responseText).toBe("OK");
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
});

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
