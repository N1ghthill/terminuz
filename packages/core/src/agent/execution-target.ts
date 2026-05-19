import {
  hasProviderCredentials,
  resolveConfiguredModelForProvider,
  resolveUsableProviderTarget,
  type AgentMode,
  type DeepCodeConfig,
  type ProviderId,
  type Session,
} from "@deepcode/shared";

export function resolveExecutionTarget(
  config: Pick<DeepCodeConfig, "defaultProvider" | "defaultModel" | "defaultModels" | "modeDefaults" | "providers">,
  session: Pick<Session, "provider" | "model" | "metadata">,
  mode: AgentMode,
  explicitProvider?: ProviderId,
): { provider: ProviderId; model?: string } {
  const modeOverride = config.modeDefaults?.[mode];
  const hasPinnedProvider =
    Boolean(explicitProvider ?? modeOverride?.provider) || session.metadata.providerPinned === true;
  const provider = explicitProvider ?? modeOverride?.provider ?? session.provider
    ?? config.defaultProvider
    ?? resolveUsableProviderTarget(config, []).provider;
  const modeModel = modeOverride?.provider && modeOverride.provider !== provider
    ? undefined
    : modeOverride?.model;
  const model = modeModel
    ?? (provider === session.provider ? session.model : undefined)
    ?? resolveConfiguredModelForProvider(config, provider);

  if ((explicitProvider || modeOverride?.provider) && model) {
    return { provider, model };
  }

  if (hasProviderCredentials(config.providers[provider], provider) && model) {
    return { provider, model };
  }

  if (hasPinnedProvider) {
    return { provider, model };
  }

  const fallback = resolveUsableProviderTarget(config, [
    explicitProvider,
    modeOverride?.provider,
    session.provider,
    config.defaultProvider,
  ]);

  if (fallback.provider === provider) {
    return {
      provider,
      model: model ?? fallback.model,
    };
  }

  return fallback;
}
