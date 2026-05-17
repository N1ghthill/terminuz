import {
  resolveConfiguredModelForProvider,
  type Chunk,
  type DeepCodeConfig,
  type Message,
  type ProviderId,
} from "@deepcode/shared";
import { ProviderError } from "../errors.js";

const RETRYABLE_STATUS_CODES = new Set([408, 429, 502, 503, 504]);

function isRetryableError(error: unknown): boolean {
  if (error instanceof ProviderError && error.statusCode !== undefined) {
    return RETRYABLE_STATUS_CODES.has(error.statusCode);
  }
  return !(error instanceof ProviderError);
}

function getRetryAfterMs(error: unknown): number | undefined {
  return error instanceof ProviderError ? error.retryAfterMs : undefined;
}
import { AnthropicProvider } from "./anthropic-provider.js";
import { OpenAICompatibleProvider } from "./openai-compatible-provider.js";
import type { LLMProvider, ProviderChatOptions } from "./provider.js";

export interface ProviderValidationResult {
  provider: ProviderId;
  model: string;
  modelFound: boolean;
  modelCount: number;
  responseText: string;
  latencyMs: number;
}

export class ProviderManager {
  private readonly providers = new Map<ProviderId, LLMProvider>();
  private retries: number;

  constructor(private config: DeepCodeConfig) {
    this.retries = config.providerRetries;
    this.registerConfiguredProviders(config);
  }

  reload(config: DeepCodeConfig = this.config): void {
    this.config = config;
    this.retries = config.providerRetries;
    this.providers.clear();
    this.registerConfiguredProviders(config);
  }

  private registerConfiguredProviders(config: DeepCodeConfig): void {
    this.register(
      new OpenAICompatibleProvider({
        id: "openrouter",
        name: "OpenRouter",
        defaultBaseUrl: "https://openrouter.ai/api/v1",
        defaultModel: resolveConfiguredModelForProvider(config, "openrouter"),
        config: config.providers.openrouter,
        extraHeaders: {
          "HTTP-Referer": "https://deepcode.local",
          "X-Title": "DeepCode",
        },
      }),
    );
    this.register(new AnthropicProvider(config.providers.anthropic));
    this.register(
      new OpenAICompatibleProvider({
        id: "openai",
        name: "OpenAI",
        defaultBaseUrl: "https://api.openai.com/v1",
        defaultModel: resolveConfiguredModelForProvider(config, "openai"),
        config: config.providers.openai,
      }),
    );
    this.register(
      new OpenAICompatibleProvider({
        id: "deepseek",
        name: "DeepSeek",
        defaultBaseUrl: "https://api.deepseek.com/v1",
        defaultModel: resolveConfiguredModelForProvider(config, "deepseek"),
        config: config.providers.deepseek,
        buildRequestBody: (body, context) => ({
          ...body,
          thinking: buildDeepSeekThinkingOverride(context.model),
        }),
      }),
    );
    this.register(
      new OpenAICompatibleProvider({
        id: "opencode",
        name: "OpenCode",
        defaultBaseUrl: config.providers.opencode.baseUrl ?? "https://opencode.ai/zen/go/v1",
        defaultModel: resolveConfiguredModelForProvider(config, "opencode"),
        config: config.providers.opencode,
        normalizeModelId: (model) => normalizeProviderModelId("opencode", model),
        buildRequestBody: (body, context) => ({
          ...body,
          thinking: shouldDisableProxiedDeepSeekThinking(context.model)
            ? { type: "disabled" }
            : undefined,
        }),
      }),
    );
    this.register(
      new OpenAICompatibleProvider({
        id: "groq",
        name: "Groq",
        defaultBaseUrl: "https://api.groq.com/openai/v1",
        defaultModel: resolveConfiguredModelForProvider(config, "groq"),
        config: config.providers.groq,
        buildRequestBody: (body, context) => buildGroqRequestBody(body, context.model),
      }),
    );
    this.register(
      new OpenAICompatibleProvider({
        id: "ollama",
        name: "Ollama",
        defaultBaseUrl: "http://localhost:11434/v1",
        defaultModel: resolveConfiguredModelForProvider(config, "ollama"),
        config: config.providers.ollama,
        apiKeyOptional: true,
      }),
    );
  }

  register(provider: LLMProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: ProviderId): LLMProvider {
    const provider = this.providers.get(id);
    if (!provider) throw new ProviderError(`Provider not registered: ${id}`, id);
    return provider;
  }

  async *chat(
    messages: Message[],
    options: ProviderChatOptions & { preferredProvider: ProviderId; failover?: ProviderId[] },
  ): AsyncIterable<Chunk> {
    const order = [options.preferredProvider, ...(options.failover ?? [])].filter(
      (provider, index, list) => list.indexOf(provider) === index,
    );
    if (order.length === 0) {
      throw new ProviderError("No providers configured", "openrouter");
    }
    let lastError: unknown;
    for (const providerId of order) {
      for (let attempt = 0; attempt <= this.retries; attempt += 1) {
        let emitted = false;
        try {
          const provider = this.get(providerId);
          for await (const chunk of provider.chat(messages, options)) {
            emitted = true;
            yield chunk;
          }
          return;
        } catch (error) {
          lastError = error;
          if (emitted) {
            throw error;
          }
          if (options.signal?.aborted || !isRetryableError(error)) {
            break;
          }
          if (attempt >= this.retries) {
            break;
          }
          const waitMs = getRetryAfterMs(error) ?? backoffMs(attempt);
          await delay(waitMs, options.signal);
        }
      }
    }
    throw new ProviderError("All configured providers failed", options.preferredProvider, lastError);
  }

  async validateProviderModel(
    providerId: ProviderId,
    options: { model?: string; timeoutMs?: number } = {},
  ): Promise<ProviderValidationResult> {
    const provider = this.get(providerId);
    const configuredModel = options.model ?? resolveConfiguredModelForProvider(this.config, providerId);
    if (!configuredModel) {
      throw new ProviderError(
        `No model configured for ${provider.name}. Set defaultModel/defaultModels in .deepcode/config.json or DEEPCODE_MODEL.`,
        providerId,
      );
    }
    const model = normalizeProviderModelId(providerId, configuredModel);

    const started = Date.now();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 15_000);
    try {
      const [models, responseText] = await Promise.all([
        provider.listModels({ signal: controller.signal }).catch(() => [] as import("@deepcode/shared").Model[]),
        provider.complete("Reply exactly with: OK", {
          model,
          maxTokens: 16,
          temperature: 0,
          signal: controller.signal,
        }),
      ]);
      if (!responseText.trim()) {
        throw new ProviderError(`${provider.name} returned an empty validation response`, providerId);
      }
      const modelFound = models.length === 0 || models.some((item) => item.id === model || item.id === configuredModel);
      return {
        provider: providerId,
        model,
        modelFound,
        modelCount: models.length,
        responseText,
        latencyMs: Date.now() - started,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

function backoffMs(attempt: number): number {
  return Math.min(250 * 2 ** attempt, 2_000);
}

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        resolve();
      },
      { once: true },
    );
  });
}

function normalizeProviderModelId(providerId: ProviderId, model: string): string {
  if (providerId === "opencode" && model.startsWith("opencode-go/")) {
    return model.slice("opencode-go/".length);
  }

  return model;
}

function shouldDisableDeepSeekThinking(model?: string): boolean {
  const normalized = model?.toLowerCase() ?? "";
  return !normalized.includes("reasoner") && !normalized.includes("thinking");
}

function shouldDisableProxiedDeepSeekThinking(model?: string): boolean {
  const normalized = model?.toLowerCase() ?? "";
  return normalized.includes("deepseek") && shouldDisableDeepSeekThinking(normalized);
}

function buildDeepSeekThinkingOverride(
  model?: string,
): { type: "disabled" } | undefined {
  return shouldDisableDeepSeekThinking(model) ? { type: "disabled" } : undefined;
}

function buildGroqRequestBody(
  body: Record<string, unknown>,
  model?: string,
): Record<string, unknown> {
  const next = { ...body };
  if (typeof next.max_tokens === "number") {
    next.max_completion_tokens = next.max_tokens;
    delete next.max_tokens;
  }

  if (shouldDisableGroqQwenReasoning(model)) {
    next.reasoning_effort = "none";
    next.include_reasoning = false;
  }

  return next;
}

function shouldDisableGroqQwenReasoning(model?: string): boolean {
  const normalized = model?.toLowerCase() ?? "";
  return normalized.includes("qwen3");
}
