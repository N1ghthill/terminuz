/**
 * Slash-command contract for the DeepCode TUI.
 *
 * Ported from Qwen Code's `ui/commands/types.ts`. The `SlashCommand` shape and
 * action-return types are kept faithful; `CommandContext` is trimmed to a
 * DeepCode-native, self-contained surface (no Qwen `Config`/`GitService`/
 * settings/extensions coupling). It grows as the command system is wired.
 */

import type { MutableRefObject, ReactNode } from "react";
import type { Config } from "@deepcode/tui-shim";
import type { AgentMode, Message, ProviderId } from "@deepcode/shared";
import type { HistoryItem, HistoryItemWithoutId } from "../types.js";
import type { UseHistoryManagerReturn } from "../hooks/useHistoryManager.js";

/** Dialogs the TUI can open via a command action. DeepCode-scoped. */
export type DialogType =
  | "help"
  | "theme"
  | "settings"
  | "model"
  | "provider"
  | "permissions"
  | "auth"
  | "feedback"
  | "sessions";

/** Snapshot of runtime health used by /doctor. */
export interface RuntimeDiagnostics {
  provider: string;
  model: string | undefined;
  hasApiKey: boolean;
  mcpConnected: number;
  mcpTotal: number;
  agentMode: string;
}

/** Grouped dependencies handed to a slash command's `action`. */
export interface SessionCommandState {
  provider: ProviderId;
  model?: string;
  mode: AgentMode;
}

export interface SessionCommandServices {
  getState: () => SessionCommandState;
  setProvider: (provider: ProviderId) => void;
  setModel: (model: string) => void;
  setMode: (mode: AgentMode) => void;
  setName: (name: string) => void;
  listProviders: () => readonly ProviderId[];
}

export interface CommandContext {
  /** Execution mode for the current invocation. */
  executionMode?: ExecutionMode;
  /** Raw/parsed invocation for the current call. */
  invocation?: {
    raw: string;
    name: string;
    args: string;
  };
  /** Core services. Widened as the command system is wired to the runtime. */
  services: {
    config: Config | null;
    session: SessionCommandServices | null;
  };
  /** UI state and history management. */
  ui: {
    addItem: UseHistoryManagerReturn["addItem"];
    clear: () => void;
    setDebugMessage: (message: string) => void;
    pendingItem: HistoryItemWithoutId | null;
    setPendingItem: (item: HistoryItemWithoutId | null) => void;
    loadHistory: UseHistoryManagerReturn["loadHistory"];
    toggleVimEnabled: () => Promise<boolean>;
    reloadCommands: () => void | Promise<void>;
    undo: () => Promise<{ path: string; restored: boolean } | null>;
    compact: () => Promise<void>;
    /** Returns the current session messages for export commands. */
    getMessages?: () => Message[];
    getCwd?: () => string;
    /** Returns a snapshot of runtime health for /doctor. */
    getRuntimeDiagnostics?: () => RuntimeDiagnostics | null;
  };
  /** Session-scoped data. */
  session: {
    sessionShellAllowlist: Set<string>;
  };
  overwriteConfirmed?: boolean;
  abortSignal?: AbortSignal;
}

// ── Action return types ─────────────────────────────────────────────────────

export interface ToolActionReturn {
  type: "tool";
  toolName: string;
  toolArgs: Record<string, unknown>;
}

export interface QuitActionReturn {
  type: "quit";
  messages: HistoryItem[];
}

export interface MessageActionReturn {
  type: "message";
  messageType: "info" | "error";
  content: string;
}

export interface OpenDialogActionReturn {
  type: "dialog";
  dialog: DialogType;
}

export interface LoadHistoryActionReturn {
  type: "load_history";
  history: HistoryItemWithoutId[];
}

export interface SubmitPromptActionReturn {
  type: "submit_prompt";
  content: string;
  onComplete?: () => Promise<void>;
}

export interface ConfirmActionReturn {
  type: "confirm_action";
  prompt: ReactNode;
  originalInvocation: { raw: string };
}

export type SlashCommandActionReturn =
  | ToolActionReturn
  | MessageActionReturn
  | QuitActionReturn
  | OpenDialogActionReturn
  | LoadHistoryActionReturn
  | SubmitPromptActionReturn
  | ConfirmActionReturn;

export enum CommandKind {
  BUILT_IN = "built-in",
  FILE = "file",
  MCP_PROMPT = "mcp-prompt",
  SKILL = "skill",
}

export type CommandSourceDetail = "user" | "project" | "custom" | "extension";

/** Execution mode for a slash command invocation. */
export type ExecutionMode = "interactive" | "non_interactive" | "acp";

/** Origin of a slash command — drives completion badges and Help grouping. */
export type CommandSource =
  | "builtin-command"
  | "bundled-skill"
  | "skill-dir-command"
  | "plugin-command"
  | "mcp-prompt";

export interface CommandCompletionItem {
  value: string;
  label?: string;
  description?: string;
}

/** The standardized contract for any command in the system. */
export interface SlashCommand {
  name: string;
  altNames?: string[];
  description: string;
  hidden?: boolean;
  /** Higher values win when completion candidates have comparable quality. */
  completionPriority?: number;
  kind: CommandKind;
  extensionName?: string;
  source?: CommandSource;
  sourceLabel?: string;
  sourceDetail?: CommandSourceDetail;
  supportedModes?: ExecutionMode[];
  userInvocable?: boolean;
  modelInvocable?: boolean;
  argumentHint?: string;
  examples?: string[];
  action?: (
    context: CommandContext,
    args: string,
  ) =>
    | void
    | SlashCommandActionReturn
    | Promise<void | SlashCommandActionReturn>;
  completion?: (
    context: CommandContext,
    partialArg: string,
  ) => Promise<Array<string | CommandCompletionItem> | null>;
  subCommands?: SlashCommand[];
}

/** Ref handle some commands use to coordinate with the input loop. */
export type CommandAbortRef = MutableRefObject<AbortController | null>;
