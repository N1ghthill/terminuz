import { afterEach, describe, expect, it, vi } from "vitest";
import { AnthropicProvider } from "../src/providers/anthropic-provider.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AnthropicProvider", () => {
  it("maps model metadata from the Models API instead of using hardcoded pricing tables", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            data: [
              {
                id: "claude-sonnet-4-6",
                display_name: "Claude Sonnet 4.6",
                max_input_tokens: 1000000,
                capabilities: {
                  image_input: { supported: true },
                  structured_outputs: { supported: false },
                },
              },
            ],
          }),
          { status: 200 },
        )),
    );

    const provider = new AnthropicProvider({ apiKey: "anthropic-live-key" });
    const [model] = await provider.listModels();

    expect(model).toMatchObject({
      id: "claude-sonnet-4-6",
      name: "Claude Sonnet 4.6",
      provider: "anthropic",
      contextLength: 1000000,
      capabilities: {
        streaming: true,
        functionCalling: true,
        jsonMode: false,
        vision: true,
      },
    });
    expect(model?.pricing).toBeUndefined();
  });

  it("maps required tool choice to anthropic any-tool mode", async () => {
    const fetchSpy = vi.fn(async (...args: [string, RequestInit?]) => {
      void args;
      return new Response(
        [
          'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant"}}',
          "data: [DONE]",
          "",
        ].join("\n"),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new AnthropicProvider({ apiKey: "anthropic-live-key" });

    for await (const chunk of provider.chat([], {
      model: "claude-sonnet-4-6",
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
    expect(body.tool_choice).toEqual({ type: "any" });
  });

  it("maps disabled tool choice to anthropic none mode", async () => {
    const fetchSpy = vi.fn(async (...args: [string, RequestInit?]) => {
      void args;
      return new Response(
        [
          'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant"}}',
          "",
        ].join("\n"),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new AnthropicProvider({ apiKey: "anthropic-live-key" });

    for await (const chunk of provider.chat([], {
      model: "claude-sonnet-4-6",
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
      toolChoice: "none",
    })) {
      void chunk;
    }

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body.tool_choice).toEqual({ type: "none" });
  });

  it("parses streamed tool arguments and preserves usage across Anthropic events", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          [
            'data: {"type":"message_start","message":{"usage":{"input_tokens":42,"output_tokens":1}}}',
            "",
            'data: {"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_1","name":"list_dir","input":{}}}',
            "",
            'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\\"path\\":"}}',
            "",
            'data: {"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"\\"src\\"}"}}',
            "",
            'data: {"type":"content_block_stop","index":0}',
            "",
            'data: {"type":"message_delta","usage":{"output_tokens":9}}',
            "",
          ].join("\n"),
          { status: 200 },
        ),
      ),
    );

    const provider = new AnthropicProvider({ apiKey: "anthropic-live-key" });
    const chunks = [];
    for await (const chunk of provider.chat([], { model: "claude-sonnet-4-6" })) {
      chunks.push(chunk);
    }

    expect(chunks).toContainEqual({
      type: "tool_call",
      call: {
        id: "toolu_1",
        name: "list_dir",
        arguments: { path: "src" },
      },
    });
    expect(chunks).toContainEqual({ type: "usage", inputTokens: 42, outputTokens: 9 });
  });

  it("does not promise another retry after an Anthropic rate-limit error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ error: { message: "rate limit" } }), {
          status: 429,
          headers: { "retry-after": "1" },
        }),
      ),
    );

    const provider = new AnthropicProvider({ apiKey: "anthropic-live-key" });
    let caught: unknown;
    try {
      for await (const chunk of provider.chat([], { model: "claude-sonnet-4-6" })) {
        void chunk;
      }
    } catch (error) {
      caught = error;
    }

    expect(caught).toMatchObject({ statusCode: 429, retryAfterMs: 1_000 });
    expect((caught as Error).message).toContain("Retry shortly");
    expect((caught as Error).message).not.toContain("will be retried");
  });

  it("sends all system messages to Anthropic in order", async () => {
    const fetchSpy = vi.fn(async (...args: [string, RequestInit?]) => {
      void args;
      return new Response(
        [
          'data: {"type":"message_start","message":{"id":"msg_1","type":"message","role":"assistant"}}',
          "data: [DONE]",
          "",
        ].join("\n"),
        { status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchSpy);

    const provider = new AnthropicProvider({ apiKey: "anthropic-live-key" });

    for await (const chunk of provider.chat(
      [
        { id: "sys-1", role: "system", content: "mode prompt", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "sys-2", role: "system", content: "runtime context", createdAt: "2026-01-01T00:00:00.000Z" },
        { id: "user-1", role: "user", content: "hello", createdAt: "2026-01-01T00:00:00.000Z" },
      ],
      { model: "claude-sonnet-4-6" },
    )) {
      void chunk;
    }

    const body = JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body ?? "{}"));
    expect(body.system).toBe("mode prompt\n\nruntime context");
    expect(body.messages).toEqual([
      {
        role: "user",
        content: "hello",
      },
    ]);
  });
});
