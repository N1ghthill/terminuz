/**
 * Vim-mode context for the Terminuz TUI.
 *
 * Terminuz-native version of Qwen Code's `VimModeContext` — same API surface,
 * but without the Qwen settings system (vim-enabled is in-memory session state
 * rather than persisted). Persistence can be layered in later.
 */

import React, { createContext, useCallback, useContext, useState, type ReactNode } from "react";

export type VimMode = "NORMAL" | "INSERT";

interface VimModeContextType {
  vimEnabled: boolean;
  vimMode: VimMode;
  toggleVimEnabled: () => Promise<boolean>;
  setVimMode: (mode: VimMode) => void;
}

const VimModeContext = createContext<VimModeContextType | undefined>(undefined);

export const VimModeProvider = ({
  children,
  initialVimEnabled = false,
}: {
  children: ReactNode;
  initialVimEnabled?: boolean;
}) => {
  const [vimEnabled, setVimEnabled] = useState(initialVimEnabled);
  const [vimMode, setVimMode] = useState<VimMode>(initialVimEnabled ? "NORMAL" : "INSERT");

  const toggleVimEnabled = useCallback(async () => {
    const next = !vimEnabled;
    setVimEnabled(next);
    setVimMode(next ? "NORMAL" : "INSERT");
    return next;
  }, [vimEnabled]);

  return (
    <VimModeContext.Provider value={{ vimEnabled, vimMode, toggleVimEnabled, setVimMode }}>
      {children}
    </VimModeContext.Provider>
  );
};

export const useVimMode = () => {
  const context = useContext(VimModeContext);
  if (context === undefined) {
    throw new Error("useVimMode must be used within a VimModeProvider");
  }
  return context;
};
