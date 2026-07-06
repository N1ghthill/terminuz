import { describe, expect, it } from "vitest";
import { DeepCodeConfigSchema, type DeepCodeConfig } from "@deepcode/shared";
import { buildStartupGuide } from "../../src/tui/onboarding.js";

function makeConfig(partial: unknown = {}): DeepCodeConfig {
  return DeepCodeConfigSchema.parse(partial);
}

describe("buildStartupGuide", () => {
  it("returns null when the active provider has credentials and model", () => {
    const config = makeConfig({
      defaultProvider: "anthropic",
      defaultModels: { anthropic: "claude-sonnet-4-5" },
      providers: { anthropic: { apiKey: "test-key" } },
    });

    expect(
      buildStartupGuide({
        config,
        provider: "anthropic",
        model: "claude-sonnet-4-5",
        targetSource: "config",
      }),
    ).toBeNull();
  });

  it("guides first-run users when no provider, model, or credentials are saved", () => {
    const guide = buildStartupGuide({
      config: makeConfig(),
      provider: "openrouter",
      targetSource: "config",
    });

    expect(guide).toContain("Setup needed");
    expect(guide).toContain("no default provider is saved");
    expect(guide).toContain("no model is configured for openrouter");
    expect(guide).toContain("no API key or key file is configured for openrouter");
    expect(guide).toContain("/setup");
    expect(guide).toContain("/provider");
    expect(guide).toContain("/model");
    expect(guide).toContain("/doctor");
  });

  it("does not require API keys for credential-free providers", () => {
    const guide = buildStartupGuide({
      config: makeConfig({
        defaultProvider: "ollama",
      }),
      provider: "ollama",
      targetSource: "config",
    });

    expect(guide).toContain("no model is configured for ollama");
    expect(guide).not.toContain("no API key");
  });
});
