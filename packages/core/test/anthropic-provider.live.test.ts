import { describe, expect, it } from "vitest";
import { AnthropicProvider } from "../src/providers/anthropic-provider.js";

const apiKey = process.env.ANTHROPIC_API_KEY;
const model = process.env.ANTHROPIC_MODEL;

describe.skipIf(!apiKey || !model)("AnthropicProvider live", () => {
  it("lists the configured model and completes a minimal request", async () => {
    const provider = new AnthropicProvider({ apiKey });

    const models = await provider.listModels();
    expect(models.some((item) => item.id === model)).toBe(true);

    const response = await provider.complete("Reply exactly with: OK", {
      model,
      maxTokens: 16,
      temperature: 0,
    });
    expect(response.trim()).toBeTruthy();
  }, 30_000);
});
