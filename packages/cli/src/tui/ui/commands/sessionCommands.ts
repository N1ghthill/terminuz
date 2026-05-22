import { ProviderIdSchema, type AgentMode } from "@deepcode/shared";
import { CommandKind, type MessageActionReturn, type SlashCommand } from "./types.js";
import { t } from "../../i18n/index.js";

function sessionNotReady(): MessageActionReturn {
  return {
    type: "message",
    messageType: "error",
    content: t("Session control is not available yet."),
  };
}

function parseSingleArg(input: string): string {
  return input.trim().split(/\s+/).filter(Boolean)[0] ?? "";
}

export const providerCommand: SlashCommand = {
  name: "provider",
  get description() {
    return t("Show or set current provider");
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  completion: async (context, partialArg) => {
    const session = context.services.session;
    if (!session) return null;
    const query = partialArg.trim().toLowerCase();
    const providers = session.listProviders();
    return providers.filter((provider) => provider.startsWith(query));
  },
  action: (context, args) => {
    const session = context.services.session;
    if (!session) return sessionNotReady();

    const target = parseSingleArg(args);
    if (!target) {
      return {
        type: "dialog",
        dialog: "provider",
      };
    }

    const parsed = ProviderIdSchema.safeParse(target);
    if (!parsed.success) {
      return {
        type: "message",
        messageType: "error",
        content: `Unknown provider: ${target}`,
      };
    }

    session.setProvider(parsed.data);
    const state = session.getState();
    const targetLabel = state.model ? `${state.provider}/${state.model}` : `${state.provider}/(model unset)`;
    return {
      type: "message",
      messageType: "info",
      content: `Session provider set: ${targetLabel}. Test connection did not run. Use /model to choose a model if unset.`,
    };
  },
};

export const modelCommand: SlashCommand = {
  name: "model",
  get description() {
    return t("Show or set current model");
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: (context, args) => {
    const session = context.services.session;
    if (!session) return sessionNotReady();

    const target = args.trim();
    if (!target) {
      return { type: "dialog", dialog: "model" };
    }

    session.setModel(target);
    const state = session.getState();
    return {
      type: "message",
      messageType: "info",
      content: `Session model set: ${state.provider}/${state.model ?? "(unset)"}.`,
    };
  },
};

export const renameCommand: SlashCommand = {
  name: "rename",
  argumentHint: "<name>",
  get description() {
    return t("Rename the current session");
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: (context, args) => {
    const session = context.services.session;
    if (!session) return sessionNotReady();
    const name = args.trim().replace(/^["']|["']$/g, "").trim();
    if (!name) {
      return {
        type: "message",
        messageType: "error",
        content: t("Usage: /rename <session name>"),
      };
    }
    if (context.ui.renameSession) {
      context.ui.renameSession(name);
    } else {
      session.setName(name);
    }
    return {
      type: "message",
      messageType: "info",
      content: `Sessão renomeada para "${name}".`,
    };
  },
};

const AGENT_MODES: readonly AgentMode[] = ["build", "plan"] as const;

export const modeCommand: SlashCommand = {
  name: "mode",
  get description() {
    return t("Show or set execution mode (build|plan)");
  },
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  completion: async (_context, partialArg) => {
    const query = partialArg.trim().toLowerCase();
    return AGENT_MODES.filter((mode) => mode.startsWith(query));
  },
  action: (context, args) => {
    const session = context.services.session;
    if (!session) return sessionNotReady();

    const target = parseSingleArg(args).toLowerCase();
    if (!target) {
      return {
        type: "message",
        messageType: "info",
        content: `Current mode: ${session.getState().mode}\nUsage: /mode <build|plan>`,
      };
    }

    if (!AGENT_MODES.includes(target as AgentMode)) {
      return {
        type: "message",
        messageType: "error",
        content: `Unknown mode: ${target}. Use build or plan.`,
      };
    }

    session.setMode(target as AgentMode);
    return {
      type: "message",
      messageType: "info",
      content: `Mode set: ${target.toUpperCase()}.`,
    };
  },
};
