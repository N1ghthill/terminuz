import {
  hasProviderCredentials,
  resolveConfiguredModelForProvider,
  resolveUsableProviderTarget,
  type AgentMode,
  type TerminuzConfig,
  type ProviderId,
  type Session,
} from "@terminuz/shared";

export function resolveExecutionTarget(
  config: Pick<
    TerminuzConfig,
    "defaultProvider" | "defaultModel" | "defaultModels" | "modeDefaults" | "providers"
  >,
  session: Pick<Session, "provider" | "model" | "metadata">,
  mode: AgentMode,
  explicitProvider?: ProviderId,
): { provider: ProviderId; model?: string } {
  // User explicitly pinned this provider via TUI — honour it unconditionally.
  // modeDefaults and credential scanning must not override an explicit user choice.
  if (session.metadata.providerPinned === true && !explicitProvider) {
    return { provider: session.provider, model: session.model };
  }

  const modeOverride = config.modeDefaults?.[mode];
  const hasPinnedProvider = Boolean(explicitProvider ?? modeOverride?.provider);
  const provider =
    explicitProvider ??
    modeOverride?.provider ??
    session.provider ??
    config.defaultProvider ??
    resolveUsableProviderTarget(config, []).provider;
  const modeModel =
    modeOverride?.provider && modeOverride.provider !== provider ? undefined : modeOverride?.model;
  const model =
    modeModel ??
    (provider === session.provider ? session.model : undefined) ??
    resolveConfiguredModelForProvider(config, provider);

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
