import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "../src/errors.js";
import { OpenAICompatibleProvider } from "../src/providers/openai-compatible-provider.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OpenAICompatibleProvider", () => {
  it("sends required tool choice for models that should be forced into tool use", async () => {
    const fetchSpy = vi.fn(async (...args: [string, RequestInit?]) => {
      void args;
      return new Response(
        toSseStream(
          { choices: [{ delta: { content: "ok" } }] },
          "[DONE]",
        ),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new OpenAICompatibleProvider({
      id: "openai",
      name: "OpenAI",
      defaultBaseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-4.1-mini",
      config: { apiKey: "openai-live-key" },
    });

    for await (const chunk of provider.chat([], {
      model: "gpt-4.1-mini",
      tools: [
        {
          type: "function",
          function: {
            name: "list_dir",
            description: "List a directory.",
            parameters: { type: "object", properties: { path: { type: "string" } } },
          },
        },
      ],
      toolChoice: "required",
    })) {
      void chunk;
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body.tool_choice).toBe("required");
  });

  it("repairs partial tool call arguments emitted over multiple deltas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          toSseStream(
            {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        id: "call_read",
                        function: {
                          name: "read_file",
                          arguments: "{\"path\":\"README.md\",",
                        },
                      },
                    ],
                  },
                },
              ],
            },
            {
              choices: [
                {
                  delta: {
                    tool_calls: [
                      {
                        index: 0,
                        function: {
                          arguments: "\"encoding\":\"utf8\"}",
                        },
                      },
                    ],
                  },
                },
              ],
            },
            {
              choices: [
                {
                  finish_reason: "tool_calls",
                },
              ],
            },
            "[DONE]",
          ),
          { status: 200 },
        )),
    );

    const provider = new OpenAICompatibleProvider({
      id: "openrouter",
      name: "OpenRouter",
      defaultBaseUrl: "https://openrouter.ai/api/v1",
      defaultModel: "qwen/qwen3-coder",
      config: { apiKey: "openrouter-live-key" },
    });

    const chunks = [];
    for await (const chunk of provider.chat([], {
      model: "qwen/qwen3-coder",
      tools: [
        {
          type: "function",
          function: {
            name: "read_file",
            description: "Read a file.",
            parameters: { type: "object", properties: { path: { type: "string" } } },
          },
        },
      ],
    })) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual({
      type: "tool_call",
      call: {
        id: "call_read",
        name: "read_file",
        arguments: {
          path: "README.md",
          encoding: "utf8",
        },
      },
    });
  });

  it("parses CRLF-separated SSE frames", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          toSseStreamWithSeparator(
            "\r\n\r\n",
            { choices: [{ delta: { content: "ok" } }] },
            "[DONE]",
          ),
          { status: 200 },
        )),
    );

    const provider = new OpenAICompatibleProvider({
      id: "groq",
      name: "Groq",
      defaultBaseUrl: "https://api.groq.com/openai/v1",
      defaultModel: "llama-3.3-70b-versatile",
      config: { apiKey: "groq-live-key" },
    });

    const chunks = [];
    for await (const chunk of provider.chat([], {})) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual({ type: "delta", content: "ok" });
    expect(chunks).toContainEqual({ type: "done" });
  });

  it("allows providers to customize the request body", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        toSseStream(
          { choices: [{ delta: { content: "ok" } }] },
          "[DONE]",
        ),
        { status: 200 },
      ));
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new OpenAICompatibleProvider({
      id: "deepseek",
      name: "DeepSeek",
      defaultBaseUrl: "https://api.deepseek.com/v1",
      defaultModel: "deepseek-v4-flash",
      config: { apiKey: "deepseek-live-key" },
      buildRequestBody: (body) => ({
        ...body,
        thinking: { type: "disabled" },
      }),
    });

    for await (const chunk of provider.chat([], {
      model: "deepseek-v4-flash",
    })) {
      void chunk;
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit] | undefined;
    const body = JSON.parse(String(callArgs?.[1]?.body ?? "{}"));
    expect(body.thinking).toEqual({ type: "disabled" });
  });

  it("does not parse content-embedded tool calls when no tools were offered", async () => {
    let parserCalls = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          toSseStream(
            {
              choices: [
                {
                  delta: {
                    content: "<dsml>{\"name\":\"read_file\",\"arguments\":{\"path\":\"README.md\"}}</dsml>",
                  },
                },
              ],
            },
            "[DONE]",
          ),
          { status: 200 },
        )),
    );

    const provider = new OpenAICompatibleProvider({
      id: "deepseek",
      name: "DeepSeek",
      defaultBaseUrl: "https://api.deepseek.com/v1",
      defaultModel: "deepseek-v4-flash",
      config: { apiKey: "deepseek-live-key" },
      contentToolCallMarker: "<dsml>",
      contentToolCallParser: () => {
        parserCalls++;
        return {
          remainder: "",
          toolCalls: [{ name: "read_file", arguments: { path: "README.md" } }],
        };
      },
    });

    const chunks = [];
    for await (const chunk of provider.chat([], { model: "deepseek-v4-flash" })) {
      chunks.push(chunk);
    }

    expect(parserCalls).toBe(0);
    expect(chunks).toContainEqual({
      type: "delta",
      content: "<dsml>{\"name\":\"read_file\",\"arguments\":{\"path\":\"README.md\"}}</dsml>",
    });
    expect(chunks.some((chunk) => chunk.type === "tool_call")).toBe(false);
  });

  it("sets statusCode and retryAfterMs on ProviderError for 429 responses", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: "rate limit" } }), {
          status: 429,
          headers: { "retry-after": "30" },
        }),
      ),
    );

    const provider = new OpenAICompatibleProvider({
      id: "openrouter",
      name: "OpenRouter",
      defaultBaseUrl: "https://openrouter.ai/api/v1",
      defaultModel: "test-model",
      config: { apiKey: "test-key" },
    });

    let caught: unknown;
    try {
      for await (const _ of provider.chat([], {})) { void _; }
    } catch (e) { caught = e; }

    expect(caught).toBeInstanceOf(ProviderError);
    expect((caught as ProviderError).statusCode).toBe(429);
    expect((caught as ProviderError).retryAfterMs).toBe(30_000);
    expect((caught as ProviderError).message).toContain("Retry shortly");
    expect((caught as ProviderError).message).not.toContain("will be retried");
  });

  it("sets statusCode on ProviderError for 401 responses without retryAfterMs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: "unauthorized" } }), { status: 401 }),
      ),
    );

    const provider = new OpenAICompatibleProvider({
      id: "openai",
      name: "OpenAI",
      defaultBaseUrl: "https://api.openai.com/v1",
      defaultModel: "gpt-4.1",
      config: { apiKey: "bad-key" },
    });

    let caught: unknown;
    try {
      for await (const _ of provider.chat([], {})) { void _; }
    } catch (e) { caught = e; }

    expect(caught).toBeInstanceOf(ProviderError);
    expect((caught as ProviderError).statusCode).toBe(401);
    expect((caught as ProviderError).retryAfterMs).toBeUndefined();
  });

  it("normalizes provider-specific model identifiers before sending the request", async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(
        toSseStream(
          { choices: [{ delta: { content: "ok" } }] },
          "[DONE]",
        ),
        { status: 200 },
      ));
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new OpenAICompatibleProvider({
      id: "opencode",
      name: "OpenCode",
      defaultBaseUrl: "https://opencode.ai/zen/go/v1",
      defaultModel: "opencode-go/kimi-k2.6",
      config: { apiKey: "opencode-live-key" },
      normalizeModelId: (model) => model.replace(/^opencode-go\//, ""),
    });

    for await (const chunk of provider.chat([], {})) {
      void chunk;
    }

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const callArgs = fetchSpy.mock.calls[0] as [string, RequestInit] | undefined;
    const body = JSON.parse(String(callArgs?.[1]?.body ?? "{}"));
    expect(body.model).toBe("kimi-k2.6");
  });
});

function toSseData(payload: unknown): string {
  return `data: ${typeof payload === "string" ? payload : JSON.stringify(payload)}`;
}

function toSseStream(...frames: unknown[]): string {
  return `${frames.map((frame) => toSseData(frame)).join("\n\n")}\n\n`;
}

function toSseStreamWithSeparator(separator: string, ...frames: unknown[]): string {
  return `${frames.map((frame) => toSseData(frame)).join(separator)}${separator}`;
}
