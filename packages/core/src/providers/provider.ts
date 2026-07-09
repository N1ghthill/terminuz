import {
  isProviderInputMessage,
  type ChatOptions,
  type Chunk,
  type Message,
  type Model,
  type ProviderId,
} from "@terminuz/shared";

export type ProviderToolChoice = "auto" | "required" | "none";

export type ProviderChatOptions = ChatOptions & {
  toolChoice?: ProviderToolChoice;
  onUsage?: (inputTokens: number, outputTokens: number) => void;
  /** When true, stream delta content immediately instead of buffering for DSML parsing.
   *  Set by the agent when native tool calling is in use and XML fallback is not needed. */
  streamContent?: boolean;
};

export interface ProviderCapabilities {
  streaming: boolean;
  functionCalling: boolean;
  jsonMode: boolean;
  vision: boolean;
  maxContextLength: number;
}

export interface LLMProvider {
  readonly id: ProviderId;
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  chat(messages: Message[], options: ProviderChatOptions): AsyncIterable<Chunk>;
  complete(prompt: string, options?: Omit<ProviderChatOptions, "tools">): Promise<string>;
  listModels(options?: { signal?: AbortSignal }): Promise<Model[]>;
  validateConfig(options?: { signal?: AbortSignal }): Promise<boolean>;
}

export interface ProviderConfig {
  apiKey?: string;
  baseUrl?: string;
}

export interface OpenAICompatibleMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export function toOpenAICompatibleMessages(messages: Message[]): OpenAICompatibleMessage[] {
  return messages.filter(isProviderInputMessage).map((message) => {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        tool_call_id: message.toolCallId,
      };
    }

    const converted: OpenAICompatibleMessage = {
      role:
        message.role === "system" ? "system" : message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    };

    if (message.role === "assistant" && message.toolCalls?.length) {
      converted.tool_calls = message.toolCalls.map((call) => ({
        id: call.id,
        type: "function",
        function: {
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        },
      }));
    }

    return converted;
  });
}
