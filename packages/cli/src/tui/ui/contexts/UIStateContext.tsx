/**
 * UIState contract for the DeepCode TUI.
 *
 * DeepCode-native, "enxuto" version of Qwen Code's `UIStateContext`. It carries
 * only the fields the ported Qwen UX components actually consume — Qwen-only
 * feature state (IDE, extensions, arena, MCP dialogs, rewind, welcome-back) is
 * intentionally dropped. Field names match Qwen's so ported components need
 * minimal edits. The interface grows as more components are ported.
 */

import { createContext, useContext } from "react";
import type { MutableRefObject, RefObject } from "react";
import type { DOMElement } from "ink";
import type {
  HistoryItem,
  StreamingState,
  ThoughtSummary,
} from "../types.js";
import type { TextBuffer } from "../components/shared/text-buffer.js";
import type { UseHistoryManagerReturn } from "../hooks/useHistoryManager.js";
import type { SlashCommand, CommandContext } from "../commands/types.js";
import type { RecentSlashCommands } from "../hooks/useSlashCompletion.js";
import type { ApprovalMode } from "@deepcode/tui-shim";

export interface SubagentEntry {
  taskId: string;
  /** First 50 chars of the prompt — used as label in the panel. */
  prompt: string;
  status: "running" | "done" | "failed";
  currentTool?: string;
  /** Last ~80 chars of streamed output — shown when no tool is active. */
  currentOutput?: string;
  startedAt: number;
  error?: string;
}

/** Session statistics surfaced in the footer / stats views. Grows as needed. */
export interface SessionStatsState {
  lastPromptTokenCount: number;
  lastOutputTokenCount: number;
  /** Running totals across all turns in this session. */
  totalPromptTokenCount: number;
  totalOutputTokenCount: number;
}

export interface UIState {
  // ── History & rendering ──────────────────────────────────────────────────
  history: HistoryItem[];
  historyManager: UseHistoryManagerReturn;
  /** Bumped to force a full <Static> remount (Ctrl+O, render-mode change). */
  historyRemountKey: number;
  quittingMessages: HistoryItem[] | null;

  // ── Streaming ────────────────────────────────────────────────────────────
  streamingState: StreamingState;
  thought: ThoughtSummary | null;
  currentLoadingPhrase: string;
  /** Polled char-length of the in-flight response (not React state). */
  streamingResponseLengthRef: RefObject<number>;
  /** true = receiving content (↓), false = waiting for response (↑). */
  isReceivingContent: boolean;
  initError: string | null;

  // ── Input ────────────────────────────────────────────────────────────────
  buffer: TextBuffer;
  inputWidth: number;
  suggestionsWidth: number;
  isInputActive: boolean;
  userMessages: string[];
  messageQueue: string[];
  shellModeActive: boolean;
  ctrlCPressedOnce: boolean;
  ctrlDPressedOnce: boolean;
  showEscapePrompt: boolean;
  rewindEscPending: boolean;

  // ── Commands ─────────────────────────────────────────────────────────────
  slashCommands: readonly SlashCommand[];
  commandContext: CommandContext;
  recentSlashCommands: RecentSlashCommands;

  // ── Embedded shell (inert in DeepCode) ───────────────────────────────────
  embeddedShellFocused: boolean;

  // ── Prompt suggestion (inert in DeepCode) ────────────────────────────────
  promptSuggestion: string | null;
  dismissPromptSuggestion: () => void;

  // ── Layout ───────────────────────────────────────────────────────────────
  terminalWidth: number;
  terminalHeight: number;
  mainAreaWidth: number;
  availableTerminalHeight: number | undefined;
  staticAreaMaxItemHeight: number;
  mainControlsRef: MutableRefObject<DOMElement | null>;
  constrainHeight: boolean;

  // ── Model / provider ─────────────────────────────────────────────────────
  currentModel: string;

  // ── Session ──────────────────────────────────────────────────────────────
  sessionName: string | null;
  isConfigInitialized: boolean;
  sessionStats: SessionStatsState;

  // ── Dialogs ──────────────────────────────────────────────────────────────
  dialogsVisible: boolean;
  isHelpDialogOpen: boolean;
  isThemeDialogOpen: boolean;
  isSettingsDialogOpen: boolean;
  isModelDialogOpen: boolean;
  isProviderDialogOpen: boolean;
  isPermissionsDialogOpen: boolean;
  isFeedbackDialogOpen: boolean;

  // ── MCP ──────────────────────────────────────────────────────────────────
  mcpConnected: number;
  mcpTotal: number;

  // ── Subagents ────────────────────────────────────────────────────────────
  activeSubagents: SubagentEntry[];

  // ── Approval ─────────────────────────────────────────────────────────────
  showAutoAcceptIndicator: ApprovalMode;
}

export const UIStateContext = createContext<UIState | null>(null);

export const useUIState = (): UIState => {
  const context = useContext(UIStateContext);
  if (!context) {
    throw new Error("useUIState must be used within a UIStateProvider");
  }
  return context;
};
