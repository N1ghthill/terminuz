# 07 - Abstração de Providers

## Visão Geral

Terminuz suporta múltiplos providers de LLM com uma interface unificada, permitindo failover automático e seleção dinâmica de modelos.

## Providers Suportados

1. **OpenRouter** - Agregador de modelos
2. **Anthropic (Claude)** - Claude Sonnet, Opus, Haiku
3. **OpenAI (GPT-4)** - GPT-4, GPT-4 Turbo, GPT-3.5
4. **DeepSeek** - Modelos DeepSeek
5. **OpenCode Zen/Go** - Modelos proprietários OpenCode

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────┐
│                     Provider Manager                             │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Failover Logic                        │   │
│  │  1. Tenta provider preferido                            │   │
│  │  2. Se falha, tenta próximo na lista                    │   │
│  │  3. Se todos falham, retorna erro                       │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  OpenRouter  │    │   Anthropic  │    │    OpenAI    │
│   Provider   │    │   Provider   │    │   Provider   │
└──────────────┘    └──────────────┘    └──────────────┘
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│   DeepSeek   │    │  OpenCode    │    │    ...       │
│   Provider   │    │   Provider   │    │              │
└──────────────┘    └──────────────┘    └──────────────┘
```

## Interface Unificada

```typescript
// Interface base para todos os providers
interface LLMProvider {
  readonly id: string;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;

  // Métodos principais
  chat(messages: Message[], options: ChatOptions): AsyncIterable<Chunk>;
  complete(prompt: string, options: CompleteOptions): Promise<string>;
  listModels(): Promise<Model[]>;
  validateConfig(): Promise<boolean>;
  getModel(modelId: string): Model | undefined;
}

// Capabilities do provider
interface ProviderCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  jsonMode: boolean;
  vision: boolean;
  maxContextLength: number;
}

// Modelo específico
interface Model {
  id: string;
  name: string;
  provider: string;
  contextLength: number;
  capabilities: ModelCapabilities;
  pricing: {
    input: number; // per 1k tokens
    output: number; // per 1k tokens
  };
}
```

## Implementações

### 1. OpenRouter Provider

```typescript
class OpenRouterProvider implements LLMProvider {
  readonly id = "openrouter";
  readonly name = "OpenRouter";

  private client: AxiosInstance;

  constructor(private config: OpenRouterConfig) {
    this.client = axios.create({
      baseURL: "https://openrouter.ai/api/v1",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "HTTP-Referer": "https://terminuz.ai",
        "X-Title": "Terminuz",
      },
    });
  }

  async *chat(messages: Message[], options: ChatOptions): AsyncIterable<Chunk> {
    const response = await this.client.post(
      "/chat/completions",
      {
        model: options.model || "anthropic/claude-sonnet-4",
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
        stream: true,
        tools: options.tools,
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      },
      {
        responseType: "stream",
      },
    );

    // Processa stream SSE
    for await (const chunk of parseSSE(response.data)) {
      yield {
        type: "delta",
        content: chunk.choices[0]?.delta?.content || "",
      };
    }
  }

  async listModels(): Promise<Model[]> {
    const response = await this.client.get("/models");
    return response.data.data.map((m: any) => ({
      id: m.id,
      name: m.name,
      provider: this.id,
      contextLength: m.context_length,
      capabilities: {
        functionCalling: true,
        vision: m.vision || false,
      },
      pricing: {
        input: m.pricing?.prompt || 0,
        output: m.pricing?.completion || 0,
      },
    }));
  }

  async validateConfig(): Promise<boolean> {
    try {
      await this.client.get("/auth/key");
      return true;
    } catch {
      return false;
    }
  }
}
```

### 2. Anthropic Provider

```typescript
class AnthropicProvider implements LLMProvider {
  readonly id = "anthropic";
  readonly name = "Anthropic";

  private client: Anthropic;

  constructor(private config: AnthropicConfig) {
    this.client = new Anthropic({
      apiKey: config.apiKey,
    });
  }

  async *chat(messages: Message[], options: ChatOptions): AsyncIterable<Chunk> {
    const stream = await this.client.messages.create({
      model: options.model || "claude-sonnet-4-5-20251001",
      max_tokens: options.maxTokens || 4096,
      messages: messages.map((m) => ({
        role: m.role as "user" | "assistant",
        content: m.content,
      })),
      tools: options.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      })),
      stream: true,
    });

    for await (const event of stream) {
      if (event.type === "content_block_delta") {
        yield {
          type: "delta",
          content: event.delta.text || "",
        };
      } else if (event.type === "tool_use") {
        yield {
          type: "tool_call",
          tool: event.name,
          arguments: event.input,
        };
      }
    }
  }

  get availableModels(): Model[] {
    return [
      {
        id: "claude-opus-4-5-20251101",
        name: "Claude Opus 4.5",
        provider: this.id,
        contextLength: 200000,
        capabilities: { functionCalling: true, vision: true },
        pricing: { input: 15.0, output: 75.0 },
      },
      {
        id: "claude-sonnet-4-5-20251001",
        name: "Claude Sonnet 4.5",
        provider: this.id,
        contextLength: 200000,
        capabilities: { functionCalling: true, vision: true },
        pricing: { input: 3.0, output: 15.0 },
      },
      {
        id: "claude-haiku-4-5-20251001",
        name: "Claude Haiku 4.5",
        provider: this.id,
        contextLength: 200000,
        capabilities: { functionCalling: true, vision: false },
        pricing: { input: 0.25, output: 1.25 },
      },
    ];
  }
}
```

### 3. OpenAI Provider

```typescript
class OpenAIProvider implements LLMProvider {
  readonly id = "openai";
  readonly name = "OpenAI";

  private client: OpenAI;

  constructor(private config: OpenAIConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
    });
  }

  async *chat(messages: Message[], options: ChatOptions): AsyncIterable<Chunk> {
    const stream = await this.client.chat.completions.create({
      model: options.model || "gpt-4o",
      messages: messages as any,
      tools: options.tools,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      stream: true,
    });

    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta;

      if (delta?.content) {
        yield { type: "delta", content: delta.content };
      }

      if (delta?.tool_calls) {
        for (const tool of delta.tool_calls) {
          yield {
            type: "tool_call",
            tool: tool.function?.name,
            arguments: tool.function?.arguments,
          };
        }
      }
    }
  }
}
```

### 4. DeepSeek Provider

```typescript
class DeepSeekProvider implements LLMProvider {
  readonly id = "deepseek";
  readonly name = "DeepSeek";

  private client: AxiosInstance;

  constructor(private config: DeepSeekConfig) {
    this.client = axios.create({
      baseURL: "https://api.deepseek.com/v1",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
      },
    });
  }

  // Implementação similar aos outros...
}
```

### 5. OpenCode Provider

```typescript
class OpenCodeProvider implements LLMProvider {
  readonly id = "opencode";
  readonly name = "OpenCode";

  // Implementação específica para Zen/Go models
  // Pode usar API própria do OpenCode
}
```

## Provider Manager

```typescript
class ProviderManager {
  private providers: Map<string, LLMProvider> = new Map();
  private fallbackOrder: string[] = [];

  constructor(private config: ProviderConfig) {
    this.initializeProviders();
  }

  private initializeProviders(): void {
    // Registra providers configurados
    if (this.config.openrouter?.apiKey) {
      this.register(new OpenRouterProvider(this.config.openrouter));
    }

    if (this.config.anthropic?.apiKey) {
      this.register(new AnthropicProvider(this.config.anthropic));
    }

    if (this.config.openai?.apiKey) {
      this.register(new OpenAIProvider(this.config.openai));
    }

    if (this.config.deepseek?.apiKey) {
      this.register(new DeepSeekProvider(this.config.deepseek));
    }

    if (this.config.opencode?.apiKey) {
      this.register(new OpenCodeProvider(this.config.opencode));
    }

    // Ordem de fallback
    this.fallbackOrder = this.config.fallbackOrder || [
      "anthropic",
      "openai",
      "openrouter",
      "deepseek",
    ];
  }

  register(provider: LLMProvider): void {
    this.providers.set(provider.id, provider);
  }

  get(id: string): LLMProvider | undefined {
    return this.providers.get(id);
  }

  list(): LLMProvider[] {
    return Array.from(this.providers.values());
  }

  async chat(
    messages: Message[],
    options: ChatOptions & { preferredProvider?: string },
  ): AsyncIterable<Chunk> {
    const providers = this.getProviderChain(options.preferredProvider);

    for (const provider of providers) {
      try {
        yield * this.executeWithProvider(provider, messages, options);
        return; // Sucesso, sai do loop
      } catch (error) {
        console.warn(`Provider ${provider.id} failed:`, error);
        continue; // Tenta próximo provider
      }
    }

    throw new Error("All providers failed");
  }

  private *getProviderChain(preferred?: string): Generator<LLMProvider> {
    // Provider preferido primeiro
    if (preferred && this.providers.has(preferred)) {
      yield this.providers.get(preferred)!;
    }

    // Depois a ordem de fallback
    for (const id of this.fallbackOrder) {
      if (id !== preferred && this.providers.has(id)) {
        yield this.providers.get(id)!;
      }
    }
  }

  private async *executeWithProvider(
    provider: LLMProvider,
    messages: Message[],
    options: ChatOptions,
  ): AsyncIterable<Chunk> {
    yield {
      type: "system",
      content: `Using provider: ${provider.name}`,
    };

    yield* provider.chat(messages, options);
  }

  async getAvailableModels(): Promise<Model[]> {
    const allModels: Model[] = [];

    for (const provider of this.providers.values()) {
      try {
        const models = await provider.listModels();
        allModels.push(...models);
      } catch (error) {
        console.warn(`Failed to list models for ${provider.id}:`, error);
      }
    }

    return allModels;
  }
}
```

## Configuração

```typescript
interface ProviderConfig {
  // Cada provider opcional
  openrouter?: {
    apiKey: string;
    defaultModel?: string;
  };

  anthropic?: {
    apiKey: string;
    defaultModel?: string;
  };

  openai?: {
    apiKey: string;
    defaultModel?: string;
    organization?: string;
  };

  deepseek?: {
    apiKey: string;
    defaultModel?: string;
  };

  opencode?: {
    apiKey: string;
    defaultModel?: string;
  };

  // Ordem de fallback
  fallbackOrder?: string[];

  // Provider default para cada tipo de tarefa
  taskDefaults?: {
    planning?: string;
    coding?: string;
    testing?: string;
    documentation?: string;
  };
}
```

## Uso

```typescript
// Inicialização
const providerManager = new ProviderManager({
  anthropic: { apiKey: process.env.ANTHROPIC_API_KEY },
  openai: { apiKey: process.env.OPENAI_API_KEY },
  fallbackOrder: ["anthropic", "openai"],
});

// Chat com fallback automático
const messages: Message[] = [{ role: "user", content: "Implemente uma função de ordenação" }];

for await (const chunk of providerManager.chat(messages, {
  preferredProvider: "anthropic",
  temperature: 0.7,
  maxTokens: 4096,
})) {
  if (chunk.type === "delta") {
    process.stdout.write(chunk.content);
  } else if (chunk.type === "tool_call") {
    console.log(`Tool call: ${chunk.tool}`);
  }
}
```

## Tool Calling

Formato unificado para todos os providers:

```typescript
interface ToolDefinition {
  name: string;
  description: string;
  parameters: z.ZodSchema;
}

// Adapta para cada provider
class ToolAdapter {
  toOpenAI(tools: ToolDefinition[]): any[] {
    return tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: zodToJsonSchema(t.parameters),
      },
    }));
  }

  toAnthropic(tools: ToolDefinition[]): any[] {
    return tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: zodToJsonSchema(t.parameters),
    }));
  }

  // etc...
}
```

---

**Anterior**: [06 - Modelo de Segurança](./06-security-model.md)  
**Próximo**: [08 - Sistema de Ferramentas](./08-tool-system.md)
