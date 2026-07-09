/**
 * UIActions contract for the Terminuz TUI.
 *
 * Terminuz-native, "enxuto" version of Qwen Code's `UIActionsContext` — the
 * callbacks the ported Qwen UX components invoke. Grows as more components and
 * the runtime bridge are wired.
 */

import { createContext, useContext } from "react";
import type { Key } from "../hooks/useKeypress.js";

export interface UIActions {
  /** Clears the terminal and forces a full <Static> remount. */
  refreshStatic: () => void;
  /** Submits the composed input as a prompt (or slash command). */
  handleFinalSubmit: (value: string) => void;
  /** Clears the on-screen conversation. */
  handleClearScreen: () => void;
  /** Toggles shell-passthrough input mode. */
  setShellModeActive: (active: boolean) => void;
  /** Reports whether the "esc to cancel/clear" hint should be shown. */
  onEscapePromptChange: (show: boolean) => void;
  /** Reports autocomplete-suggestion visibility (drives Tab handling). */
  onSuggestionsVisibilityChange: (visible: boolean) => void;
  /** Routes a keypress through vim-mode handling; true = consumed. */
  vimHandleInput: (key: Key) => boolean;
  /** Closes the feedback dialog for the current keypress (inert in Terminuz). */
  temporaryCloseFeedbackDialog: () => void;
  /** Drains the queued-message buffer, returning the joined text. */
  popAllQueuedMessages: () => string;
  /** Re-submits the most recent prompt. */
  handleRetryLastPrompt: () => void;
}

export const UIActionsContext = createContext<UIActions | null>(null);

export const useUIActions = (): UIActions => {
  const context = useContext(UIActionsContext);
  if (!context) {
    throw new Error("useUIActions must be used within a UIActionsProvider");
  }
  return context;
};
