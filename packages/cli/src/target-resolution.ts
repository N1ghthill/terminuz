import {
  parseModelSelection,
  PROVIDER_IDS,
  ProviderIdSchema,
  resolveConfiguredModelForProvider,
  resolveUsableProviderTarget,
  type DeepCodeConfig,
  type ProviderId,
} from "@deepcode/shared";

export interface SessionTargetOverrides {
  provider?: string;
  model?: string;
}

type TargetConfig = Pick<
  DeepCodeConfig,
  "defaultProvider" | "defaultModel" | "defaultModels" | "providers"
>;

export function resolveSessionTarget(
  config: TargetConfig,
  overrides: SessionTargetOverrides = {},
): { provider: ProviderId; model?: string } {
  const requestedProvider = parseProviderId(overrides.provider);
  const fallback = resolveUsableProviderTarget(config, [
    requestedProvider,
    config.defaultProvider,
  ]);
  const parsedSelection = overrides.model
    ? requestedProvider
      ? { provider: requestedProvider, model: overrides.model.trim() }
      : parseModelSelection(overrides.model, fallback.provider)
    : null;
  if (overrides.model && !parsedSelection) {
    throw new Error(
      `Invalid model selection: ${overrides.model}. Use "<model>" or "<provider>/<model>".`,
    );
  }

  const provider = parsedSelection?.provider ?? requestedProvider ?? fallback.provider;
  const model = parsedSelection?.model
    ?? resolveConfiguredModelForProvider(config, provider)
    ?? (provider === fallback.provider ? fallback.model : undefined);
  return { provider, model };
}

function parseProviderId(value: string | undefined): ProviderId | undefined {
  if (!value) return undefined;
  const parsed = ProviderIdSchema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new Error(`Invalid provider: ${value}. Expected one of: ${PROVIDER_IDS.join(", ")}`);
}
