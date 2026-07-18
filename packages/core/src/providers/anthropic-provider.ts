import { isProviderInputMessage, type Chunk, type Message, type Model } from "@terminuz/shared";
import { ProviderError } from "../errors.js";
import { redactText } from "../security/secret-redactor.js";
import { parseSse } from "./sse.js";
import type {
  LLMProvider,
  ProviderCapabilities,
  ProviderChatOptions,
  ProviderConfig,
} from "./provider.js";
import { parseToolArgumentsObject } from "./tool-arguments.js";

export class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic" as const;
  readonly name = "Anthropic";
  readonly capabilities: ProviderCapabilities = {
    streaming: true,
    functionCalling: true,
    jsonMode: true,
    vision: true,
    maxContextLength: 1_000_000,
  };

  private readonly baseUrl: string;
  private readonly apiKey?: string;

  constructor(config: ProviderConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl ?? "https://api.anthropic.com/v1";
  }

  async *chat(messages: Message[], options: ProviderChatOptions): AsyncIterable<Chunk> {
    this.requireApiKey();
    const system = toAnthropicSystem(messages);
    const response = await this.fetchJson(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      signal: options.signal,
      body: JSON.stringify({
        model: this.resolveModel(options.model),
        max_tokens: options.maxTokens ?? 4096,
        temperature: options.temperature,
        system,
        messages: toAnthropicMessages(messages),
        tools: options.tools?.map(toAnthropicTool),
        tool_choice: options.tools?.length ? toAnthropicToolChoice(options.toolChoice) : undefined,
        stream: true,
      }),
    });
    await this.assertOk(response);

    const toolBlocks = new Map<number, { id: string; name: string; inputJson: string }>();
    let inputTokens = 0;
    let outputTokens = 0;
    let hasUsage = false;
    for await (const event of parseSse(response)) {
      if (event.type === "message_start" && event.message?.usage) {
        hasUsage = true;
        inputTokens = event.message.usage.input_tokens ?? inputTokens;
        outputTokens = event.message.usage.output_tokens ?? outputTokens;
      }
      if (event.type === "content_block_delta" && event.delta?.text) {
        yield { type: "delta", content: event.delta.text };
      }
      if (event.type === "content_block_start" && event.content_block?.type === "tool_use") {
        toolBlocks.set(Number(event.index), {
          id: event.content_block.id,
          name: event.content_block.name,
          inputJson: serializeInitialToolInput(event.content_block.input),
        });
      }
      if (event.type === "content_block_delta" && event.delta?.type === "input_json_delta") {
        const block = toolBlocks.get(Number(event.index));
        if (block) {
          block.inputJson += event.delta.partial_json ?? "";
        }
      }
      if (event.type === "content_block_stop") {
        const block = toolBlocks.get(Number(event.index));
        if (!block) continue;
        toolBlocks.delete(Number(event.index));
        yield {
          type: "tool_call",
          call: {
            id: block.id,
            name: block.name,
            arguments: parseToolArgumentsObject(block.inputJson),
          },
        };
      }
      if (event.type === "message_delta" && event.usage) {
        hasUsage = true;
        inputTokens = event.usage.input_tokens ?? inputTokens;
        outputTokens = event.usage.output_tokens ?? outputTokens;
      }
    }
    if (hasUsage) {
      yield {
        type: "usage",
        inputTokens,
        outputTokens,
      };
    }
    yield { type: "done" };
  }

  async complete(
    prompt: string,
    options: Omit<ProviderChatOptions, "tools"> = {},
  ): Promise<string> {
    let output = "";
    const messages: Message[] = [
      { id: "complete-user", role: "user", content: prompt, createdAt: new Date().toISOString() },
    ];
    for await (const chunk of this.chat(messages, options)) {
      if (chunk.type === "delta") output += chunk.content;
      if (chunk.type === "usage") options.onUsage?.(chunk.inputTokens, chunk.outputTokens);
    }
    return output;
  }

  async listModels(options: { signal?: AbortSignal } = {}): Promise<Model[]> {
    this.requireApiKey();
    const response = await this.fetchJson(`${this.baseUrl}/models`, {
      headers: {
        "x-api-key": this.apiKey ?? "",
        "anthropic-version": "2023-06-01",
      },
      signal: options.signal,
    });
    await this.assertOk(response);
    const payload = (await response.json()) as any;

    return (payload.data ?? []).map((model: any) => {
      const capabilities = model.capabilities ?? {};

      return {
        id: model.id,
        name: model.display_name ?? model.id,
        provider: this.id,
        contextLength:
          typeof model.max_input_tokens === "number"
            ? model.max_input_tokens
            : this.capabilities.maxContextLength,
        capabilities: {
          streaming: true,
          functionCalling: true,
          jsonMode: capabilitySupported(
            capabilities.structured_outputs,
            this.capabilities.jsonMode,
          ),
          vision: capabilitySupported(capabilities.image_input, this.capabilities.vision),
        },
      };
    });
  }

  async validateConfig(options: { signal?: AbortSignal } = {}): Promise<boolean> {
    if (!this.apiKey) return false;
    try {
      await this.listModels(options);
      return true;
    } catch {
      return false;
    }
  }

  private requireApiKey(): void {
    if (!this.apiKey) {
      throw new ProviderError("Missing API key for Anthropic", this.id);
    }
  }

  private resolveModel(model?: string): string {
    if (!model) {
      throw new ProviderError(
        "No model configured for Anthropic. Set defaultModel/defaultModels in .terminuz/config.json.",
        this.id,
      );
    }
    return model;
  }

  private async assertOk(response: Response): Promise<void> {
    if (!response.ok) {
      const retryAfterMs = parseRetryAfter(response.headers.get("retry-after"));
      throw new ProviderError(
        redactText(
          formatAnthropicHttpError(response.status, await response.text()),
          this.secretValues(),
        ),
        this.id,
        undefined,
        { statusCode: response.status, retryAfterMs },
      );
    }
  }

  private async fetchJson(url: string, init: RequestInit): Promise<Response> {
    try {
      return await fetch(url, init);
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") {
        throw new ProviderError("Anthropic request timed out or was cancelled", this.id, error);
      }
      const message = `Anthropic network request failed: ${error instanceof Error ? error.message : String(error)}`;
      throw new ProviderError(redactText(message, this.secretValues()), this.id, error);
    }
  }

  private secretValues(): string[] {
    return this.apiKey ? [this.apiKey] : [];
  }
}

function toAnthropicSystem(messages: Message[]): string | undefined {
  const systemMessages = messages
    .filter(isProviderInputMessage)
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter(Boolean);
  return systemMessages.length > 0 ? systemMessages.join("\n\n") : undefined;
}

function capabilitySupported(
  capability: { supported?: boolean } | null | undefined,
  fallback: boolean,
): boolean {
  return typeof capability?.supported === "boolean" ? capability.supported : fallback;
}

function formatAnthropicHttpError(status: number, body: string): string {
  const detail = body.trim().slice(0, 1_000);
  if (status === 401 || status === 403) {
    return `Anthropic authentication failed (${status}). Check the configured API key. ${detail}`;
  }
  if (status === 404) {
    return `Anthropic request failed (${status}). The provider endpoint or model may not exist. ${detail}`;
  }
  if (status === 400 || status === 422) {
    return `Anthropic rejected the request (${status}). Check the configured model and request options. ${detail}`;
  }
  if (status === 429) {
    return `Anthropic rate limit exceeded (429). Retry shortly or choose another model/provider. ${detail}`;
  }
  if (status >= 500) {
    return `Anthropic service failed (${status}). Try again later. ${detail}`;
  }
  return `Anthropic request failed: ${status} ${detail}`;
}

function parseRetryAfter(header: string | null, maxMs = 60_000): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (!Number.isNaN(seconds) && seconds > 0) {
    return Math.min(seconds * 1_000, maxMs);
  }
  const date = new Date(header).getTime();
  if (!Number.isNaN(date)) {
    const ms = date - Date.now();
    return ms > 0 ? Math.min(ms, maxMs) : undefined;
  }
  return undefined;
}

function toAnthropicMessages(
  messages: Message[],
): Array<{ role: "user" | "assistant"; content: unknown }> {
  return messages
    .filter(isProviderInputMessage)
    .filter((message) => message.role !== "system")
    .map((message) => {
      if (message.role === "tool") {
        return {
          role: "user" as const,
          content: [
            {
              type: "tool_result",
              tool_use_id: message.toolCallId,
              content: message.content,
            },
          ],
        };
      }

      if (message.role === "assistant" && message.toolCalls?.length) {
        const content: unknown[] = [];
        if (message.content.trim()) {
          content.push({ type: "text", text: message.content });
        }
        for (const call of message.toolCalls) {
          content.push({
            type: "tool_use",
            id: call.id,
            name: call.name,
            input: call.arguments,
          });
        }
        return { role: "assistant" as const, content };
      }

      return {
        role: message.role === "assistant" ? ("assistant" as const) : ("user" as const),
        content: message.content,
      };
    });
}

function toAnthropicTool(tool: any): { name: string; description?: string; input_schema: unknown } {
  const definition = tool.function ?? tool;
  return {
    name: definition.name,
    description: definition.description,
    input_schema: definition.parameters ??
      definition.input_schema ?? { type: "object", properties: {} },
  };
}

function toAnthropicToolChoice(
  toolChoice?: "auto" | "required" | "none",
): { type: "auto" | "any" | "none" } | undefined {
  if (!toolChoice || toolChoice === "auto") {
    return undefined;
  }

  if (toolChoice === "none") {
    return { type: "none" };
  }

  return { type: "any" };
}

function serializeInitialToolInput(input: unknown): string {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return "";
  }

  return Object.keys(input).length > 0 ? JSON.stringify(input) : "";
}
