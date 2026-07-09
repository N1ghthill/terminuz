import type { ProviderId } from "@terminuz/shared";

export type ToolSchemaMode = "full" | "compact" | "minimal";
export type ToolCallStrategy = "native" | "native-with-xml-fallback";

export interface ModelExecutionProfile {
  toolSchemaMode: ToolSchemaMode;
  supportsRequiredToolChoice: boolean;
  toolCallStrategy: ToolCallStrategy;
}

export function resolveModelExecutionProfile(
  provider: ProviderId,
  model?: string,
): ModelExecutionProfile {
  const normalized = model?.toLowerCase() ?? "";
  const openAIFamily = matchesAny(normalized, ["gpt-", "/gpt-", "o1", "o3", "o4", "o5"]);
  const claudeFamily = normalized.includes("claude");
  const geminiFamily = normalized.includes("gemini");
  const qwenFamily = normalized.includes("qwen");
  const kimiFamily = matchesAny(normalized, ["kimi", "moonshot"]);
  const miniMaxFamily = normalized.includes("minimax");
  const deepSeekFamily = normalized.includes("deepseek");
  const reasonerFamily = matchesAny(normalized, ["reasoner", "thinking"]);
  const llamaFamily = normalized.includes("llama");
  const mistralFamily = matchesAny(normalized, ["mistral", "mixtral", "devstral", "codestral"]);
  const phiFamily = normalized.includes("phi");
  const yiFamily = matchesAny(normalized, ["yi-", "/yi"]);
  const gemmaFamily = normalized.includes("gemma");

  if (provider === "anthropic") {
    return {
      toolSchemaMode: "full",
      supportsRequiredToolChoice: true,
      toolCallStrategy: "native",
    };
  }

  if (provider === "openai") {
    return {
      toolSchemaMode: openAIFamily ? "full" : "compact",
      supportsRequiredToolChoice: true,
      toolCallStrategy: openAIFamily ? "native" : "native-with-xml-fallback",
    };
  }

  if (provider === "deepseek") {
    // v4-pro: unified reasoning model — minimal schema, native tool calls (standard OpenAI format)
    if (normalized.includes("v4-pro")) {
      return {
        toolSchemaMode: "minimal",
        supportsRequiredToolChoice: false,
        toolCallStrategy: "native",
      };
    }
    // v4-flash: lightweight non-reasoning model — compact schema, native tool calls
    if (normalized.includes("v4-flash")) {
      return {
        toolSchemaMode: "compact",
        supportsRequiredToolChoice: false,
        toolCallStrategy: "native",
      };
    }
    // Legacy deepseek-reasoner / deepseek-chat — DSML format via native-with-xml-fallback
    return {
      toolSchemaMode: reasonerFamily ? "minimal" : "compact",
      supportsRequiredToolChoice: false,
      toolCallStrategy: "native-with-xml-fallback",
    };
  }

  if (openAIFamily || claudeFamily || geminiFamily) {
    return {
      toolSchemaMode: "full",
      supportsRequiredToolChoice: true,
      toolCallStrategy: "native",
    };
  }

  if (reasonerFamily) {
    return {
      toolSchemaMode: "minimal",
      supportsRequiredToolChoice: false,
      toolCallStrategy: "native-with-xml-fallback",
    };
  }

  // Qwen3, Kimi K2, MiniMax M2 all use standard OpenAI tool_calls — no XML fallback needed.
  // Note: XML fallback prompts interfere with Qwen3 thinking mode (stopword collision).
  if (qwenFamily || kimiFamily || miniMaxFamily || deepSeekFamily) {
    return {
      toolSchemaMode: "compact",
      supportsRequiredToolChoice: false,
      toolCallStrategy: "native",
    };
  }

  // Llama 3.1+ and Mistral support native tool calling
  if (llamaFamily || mistralFamily) {
    return {
      toolSchemaMode: "compact",
      supportsRequiredToolChoice: false,
      toolCallStrategy: "native",
    };
  }

  // Phi, Yi, Gemma have limited or unreliable native tool calling
  if (phiFamily || yiFamily || gemmaFamily) {
    return {
      toolSchemaMode: "compact",
      supportsRequiredToolChoice: false,
      toolCallStrategy: "native-with-xml-fallback",
    };
  }

  // Ollama: local models are heterogeneous — default to safe fallback strategy
  if (provider === "ollama") {
    return {
      toolSchemaMode: "compact",
      supportsRequiredToolChoice: false,
      toolCallStrategy: "native-with-xml-fallback",
    };
  }

  // Groq: hosts known capable models; compact schema, native tool calling
  if (provider === "groq") {
    return {
      toolSchemaMode: "compact",
      supportsRequiredToolChoice: false,
      toolCallStrategy: "native",
    };
  }

  return {
    toolSchemaMode: "compact",
    supportsRequiredToolChoice: false,
    toolCallStrategy: "native",
  };
}

function matchesAny(input: string, patterns: string[]): boolean {
  return patterns.some((pattern) => input.includes(pattern));
}
