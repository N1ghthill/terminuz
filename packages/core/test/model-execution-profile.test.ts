import { describe, it, expect } from "vitest";
import { resolveModelExecutionProfile } from "../src/providers/model-execution-profile.js";

describe("resolveModelExecutionProfile", () => {
  // ── Dedicated provider overrides ─────────────────────────────────────────

  it("anthropic always returns full + native + required tool choice", () => {
    const p = resolveModelExecutionProfile("anthropic", "claude-3-5-sonnet");
    expect(p).toEqual({ toolSchemaMode: "full", supportsRequiredToolChoice: true, toolCallStrategy: "native" });
  });

  it("openai GPT models return full + native", () => {
    const p = resolveModelExecutionProfile("openai", "gpt-4o");
    expect(p).toEqual({ toolSchemaMode: "full", supportsRequiredToolChoice: true, toolCallStrategy: "native" });
  });

  it("openai non-GPT models return compact + fallback", () => {
    const p = resolveModelExecutionProfile("openai", "some-unknown-model");
    expect(p.toolSchemaMode).toBe("compact");
    expect(p.toolCallStrategy).toBe("native-with-xml-fallback");
  });

  it("deepseek-v4-pro returns minimal + native (reasoning model, standard tool_calls)", () => {
    const p = resolveModelExecutionProfile("deepseek", "deepseek-v4-pro");
    expect(p.toolSchemaMode).toBe("minimal");
    expect(p.toolCallStrategy).toBe("native");
    expect(p.supportsRequiredToolChoice).toBe(false);
  });

  it("deepseek-v4-flash returns compact + native (lightweight, no reasoning)", () => {
    const p = resolveModelExecutionProfile("deepseek", "deepseek-v4-flash");
    expect(p.toolSchemaMode).toBe("compact");
    expect(p.toolCallStrategy).toBe("native");
    expect(p.supportsRequiredToolChoice).toBe(false);
  });

  it("deepseek-reasoner (legacy) returns minimal + fallback", () => {
    const p = resolveModelExecutionProfile("deepseek", "deepseek-reasoner");
    expect(p.toolSchemaMode).toBe("minimal");
    expect(p.toolCallStrategy).toBe("native-with-xml-fallback");
    expect(p.supportsRequiredToolChoice).toBe(false);
  });

  it("deepseek-chat (legacy) returns compact + fallback", () => {
    const p = resolveModelExecutionProfile("deepseek", "deepseek-chat");
    expect(p.toolSchemaMode).toBe("compact");
    expect(p.toolCallStrategy).toBe("native-with-xml-fallback");
  });

  // ── Model family detection ────────────────────────────────────────────────

  it("llama models get compact + native", () => {
    for (const model of ["llama3.1", "meta-llama/llama-3.1-8b", "llama-3.3-70b"]) {
      const p = resolveModelExecutionProfile("groq", model);
      expect(p.toolSchemaMode).toBe("compact");
      expect(p.toolCallStrategy).toBe("native");
    }
  });

  it("mistral/mixtral models get compact + native", () => {
    for (const model of ["mistral-large", "mixtral-8x7b", "devstral", "codestral"]) {
      const p = resolveModelExecutionProfile("openrouter", model);
      expect(p.toolSchemaMode).toBe("compact");
      expect(p.toolCallStrategy).toBe("native");
    }
  });

  it("phi models get compact + fallback", () => {
    for (const model of ["phi-3-mini", "phi4", "microsoft/phi-3.5"]) {
      const p = resolveModelExecutionProfile("ollama", model);
      expect(p.toolSchemaMode).toBe("compact");
      expect(p.toolCallStrategy).toBe("native-with-xml-fallback");
    }
  });

  it("yi models get compact + fallback", () => {
    for (const model of ["yi-34b", "01-ai/yi-coder"]) {
      const p = resolveModelExecutionProfile("openrouter", model);
      expect(p.toolSchemaMode).toBe("compact");
      expect(p.toolCallStrategy).toBe("native-with-xml-fallback");
    }
  });

  it("gemma models get compact + fallback", () => {
    for (const model of ["gemma-2-9b", "google/gemma-3-27b"]) {
      const p = resolveModelExecutionProfile("openrouter", model);
      expect(p.toolSchemaMode).toBe("compact");
      expect(p.toolCallStrategy).toBe("native-with-xml-fallback");
    }
  });

  it("qwen/kimi/minimax/deepseek get compact + native (all support OpenAI tool_calls format)", () => {
    const cases: [string, string][] = [
      ["openrouter", "qwen/qwen3-coder"],
      ["openrouter", "moonshotai/kimi-k2"],
      ["openrouter", "minimax/minimax-m1"],
      ["openrouter", "deepseek/deepseek-chat"],
    ];
    for (const [provider, model] of cases) {
      const p = resolveModelExecutionProfile(provider as any, model);
      expect(p.toolSchemaMode).toBe("compact");
      expect(p.toolCallStrategy).toBe("native");
      expect(p.supportsRequiredToolChoice).toBe(false);
    }
  });

  it("reasoner/thinking models get minimal + fallback", () => {
    for (const model of ["qwen3-235b-a22b-thinking", "some-model-reasoner"]) {
      const p = resolveModelExecutionProfile("openrouter", model);
      expect(p.toolSchemaMode).toBe("minimal");
      expect(p.toolCallStrategy).toBe("native-with-xml-fallback");
    }
  });

  // ── Provider-level defaults ───────────────────────────────────────────────

  it("ollama unknown model gets compact + fallback (safe default for local models)", () => {
    const p = resolveModelExecutionProfile("ollama", "some-custom-gguf");
    expect(p.toolSchemaMode).toBe("compact");
    expect(p.toolCallStrategy).toBe("native-with-xml-fallback");
    expect(p.supportsRequiredToolChoice).toBe(false);
  });

  it("ollama with no model gets compact + fallback", () => {
    const p = resolveModelExecutionProfile("ollama");
    expect(p.toolSchemaMode).toBe("compact");
    expect(p.toolCallStrategy).toBe("native-with-xml-fallback");
  });

  it("groq unknown model gets compact + native", () => {
    const p = resolveModelExecutionProfile("groq", "some-future-model");
    expect(p.toolSchemaMode).toBe("compact");
    expect(p.toolCallStrategy).toBe("native");
  });

  it("openrouter/opencode unknown model gets compact + native", () => {
    expect(resolveModelExecutionProfile("openrouter", "unknown-model").toolSchemaMode).toBe("compact");
    expect(resolveModelExecutionProfile("opencode", "unknown-model").toolSchemaMode).toBe("compact");
  });

  // ── OpenCode GO model IDs ─────────────────────────────────────────────────

  it("OpenCode Qwen3 models get compact + native (XML fallback would break thinking mode)", () => {
    for (const model of ["qwen3.6-plus", "qwen3.5-plus"]) {
      const p = resolveModelExecutionProfile("opencode", model);
      expect(p.toolSchemaMode).toBe("compact");
      expect(p.toolCallStrategy).toBe("native");
      expect(p.supportsRequiredToolChoice).toBe(false);
    }
  });

  it("OpenCode Kimi K2 models get compact + native", () => {
    for (const model of ["kimi-k2.6", "kimi-k2.5"]) {
      const p = resolveModelExecutionProfile("opencode", model);
      expect(p.toolSchemaMode).toBe("compact");
      expect(p.toolCallStrategy).toBe("native");
      expect(p.supportsRequiredToolChoice).toBe(false);
    }
  });

  it("OpenCode MiniMax models get compact + native", () => {
    for (const model of ["minimax-m2.7", "minimax-m2.5"]) {
      const p = resolveModelExecutionProfile("opencode", model);
      expect(p.toolSchemaMode).toBe("compact");
      expect(p.toolCallStrategy).toBe("native");
      expect(p.supportsRequiredToolChoice).toBe(false);
    }
  });
});
