import {
  hasProviderCredentials,
  resolveConfiguredModelForProvider,
  type DeepCodeConfig,
  type ProviderId,
} from "@deepcode/shared";

export interface StartupGuideInput {
  config: DeepCodeConfig;
  provider: ProviderId;
  model?: string;
  targetSource: "config" | "cli" | "session";
}

export function buildStartupGuide({
  config,
  provider,
  model,
  targetSource,
}: StartupGuideInput): string | null {
  const configuredModel = model ?? resolveConfiguredModelForProvider(config, provider);
  const hasModel = Boolean(configuredModel?.trim());
  const hasCredentials = hasProviderCredentials(config.providers[provider], provider);
  const hasSavedDefault = Boolean(config.defaultProvider);
  const issues: string[] = [];

  if (!hasSavedDefault && targetSource === "config") {
    issues.push("no default provider is saved");
  }
  if (!hasModel) {
    issues.push(`no model is configured for ${provider}`);
  }
  if (!hasCredentials) {
    issues.push(`no API key or key file is configured for ${provider}`);
  }

  if (issues.length === 0) return null;

  const target = `${provider}/${configuredModel ?? "(model unset)"}`;
  return [
    "Setup needed before model-backed tasks.",
    `Active target: ${target}`,
    `Missing: ${issues.join("; ")}.`,
    "Next: run /setup, or use /provider to save a key, /model to pick a model, and /doctor to validate.",
    "Env alternative: set DEEPCODE_PROVIDER, DEEPCODE_MODEL, and the provider API key variable.",
  ].join("\n");
}
