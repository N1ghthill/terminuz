import { CommandKind, type SlashCommand } from "./types.js";
import type { HistoryItemContextUsage, ContextCategoryBreakdown } from "../types.js";
import type { Message } from "@terminuz/shared";

const CONTEXT_WINDOW_DEFAULT = 128_000;
const AUTOCOMPACT_BUFFER_FRACTION = 0.2;

/** Rough token estimate: ~4 chars per token. */
function estimateTokens(messages: Message[]): number {
  return Math.ceil(
    messages.reduce((sum, m) => {
      let chars = m.content.length;
      if (m.toolCalls) {
        chars += m.toolCalls.reduce(
          (s, tc) => s + tc.name.length + JSON.stringify(tc.arguments).length,
          0,
        );
      }
      return sum + chars;
    }, 0) / 4,
  );
}

function buildContextUsageItem(
  messages: Message[],
  modelName: string,
  showDetails: boolean,
): HistoryItemContextUsage {
  const contextWindowSize = CONTEXT_WINDOW_DEFAULT;
  const autocompactBuffer = Math.round(contextWindowSize * AUTOCOMPACT_BUFFER_FRACTION);

  // Categorise messages by source/role
  const systemMsgs = messages.filter((m) => m.role === "system" || m.source === "agent_internal");
  const conversationMsgs = messages.filter(
    (m) => m.role !== "system" && m.source !== "agent_internal" && m.source !== "ui",
  );

  const systemTokens = estimateTokens(systemMsgs);
  const conversationTokens = estimateTokens(conversationMsgs);
  const totalTokens = systemTokens + conversationTokens;
  const freeSpace = Math.max(0, contextWindowSize - totalTokens - autocompactBuffer);

  const breakdown: ContextCategoryBreakdown = {
    systemPrompt: systemTokens,
    builtinTools: 0,
    mcpTools: 0,
    memoryFiles: 0,
    skills: 0,
    messages: conversationTokens,
    freeSpace,
    autocompactBuffer,
  };

  return {
    type: "context_usage",
    modelName: modelName || "(desconhecido)",
    totalTokens,
    contextWindowSize,
    breakdown,
    builtinTools: [],
    mcpTools: [],
    memoryFiles: [],
    skills: [],
    isEstimated: true,
    showDetails,
  };
}

export const contextCommand: SlashCommand = {
  name: "context",
  description: "Exibe o uso estimado da janela de contexto",
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  subCommands: [
    {
      name: "detail",
      description: "Exibe o detalhamento por categoria",
      kind: CommandKind.BUILT_IN,
      supportedModes: ["interactive"] as const,
      action: async (context) => {
        const messages = context.ui.getMessages?.() ?? [];
        const model = context.services.session?.getState().model ?? "";
        context.ui.addItem(buildContextUsageItem(messages, model, true), Date.now());
      },
    },
  ],
  action: async (context, args) => {
    const showDetails = args?.trim() === "detail";
    const messages = context.ui.getMessages?.() ?? [];
    const model = context.services.session?.getState().model ?? "";
    context.ui.addItem(buildContextUsageItem(messages, model, showDetails), Date.now());
  },
};
