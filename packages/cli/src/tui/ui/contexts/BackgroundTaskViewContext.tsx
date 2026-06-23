import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { SubagentEntry } from "./UIStateContext.js";

export type BackgroundDialogMode = "closed" | "list" | "detail";

export interface BackgroundTaskViewState {
  entries: readonly SubagentEntry[];
  selectedIndex: number;
  dialogMode: BackgroundDialogMode;
  dialogOpen: boolean;
  pillFocused: boolean;
  minimized: boolean;
}

export interface BackgroundTaskViewActions {
  moveSelectionUp(): boolean;
  moveSelectionDown(): boolean;
  openDialog(): void;
  closeDialog(): void;
  enterDetail(): void;
  exitDetail(): void;
  setPillFocused(focused: boolean): void;
  setMinimized(minimized: boolean): void;
  toggleMinimized(): void;
}

const DEFAULT_STATE: BackgroundTaskViewState = {
  entries: [],
  selectedIndex: 0,
  dialogMode: "closed",
  dialogOpen: false,
  pillFocused: false,
  minimized: false,
};

const DEFAULT_ACTIONS: BackgroundTaskViewActions = {
  moveSelectionUp: () => false,
  moveSelectionDown: () => false,
  openDialog: () => {},
  closeDialog: () => {},
  enterDetail: () => {},
  exitDetail: () => {},
  setPillFocused: () => {},
  setMinimized: () => {},
  toggleMinimized: () => {},
};

const BackgroundTaskViewStateContext = createContext<BackgroundTaskViewState | null>(null);
const BackgroundTaskViewActionsContext = createContext<BackgroundTaskViewActions | null>(null);

export function useBackgroundTaskViewState(): BackgroundTaskViewState {
  return useContext(BackgroundTaskViewStateContext) ?? DEFAULT_STATE;
}

export function useBackgroundTaskViewActions(): BackgroundTaskViewActions {
  return useContext(BackgroundTaskViewActionsContext) ?? DEFAULT_ACTIONS;
}

export function BackgroundTaskViewProvider({
  children,
  entries,
}: {
  children: ReactNode;
  entries: readonly SubagentEntry[];
}): ReactNode {
  const [rawSelectedIndex, setRawSelectedIndex] = useState(0);
  const [dialogMode, setDialogMode] = useState<BackgroundDialogMode>("closed");
  const [pillFocused, setPillFocused] = useState(false);
  const [minimized, setMinimized] = useState(false);

  const selectedIndex =
    entries.length === 0 ? 0 : Math.min(Math.max(0, rawSelectedIndex), entries.length - 1);

  useEffect(() => {
    if (entries.length === 0) {
      setPillFocused(false);
      setDialogMode("closed");
    }
  }, [entries.length]);

  const moveSelectionUp = useCallback(() => {
    if (selectedIndex <= 0) return false;
    setRawSelectedIndex(selectedIndex - 1);
    return true;
  }, [selectedIndex]);

  const moveSelectionDown = useCallback(() => {
    if (selectedIndex >= entries.length - 1) return false;
    setRawSelectedIndex(selectedIndex + 1);
    return true;
  }, [entries.length, selectedIndex]);

  const openDialog = useCallback(() => {
    if (entries.length === 0) return;
    setDialogMode("list");
    setPillFocused(false);
  }, [entries.length]);
  const closeDialog = useCallback(() => setDialogMode("closed"), []);
  const enterDetail = useCallback(() => {
    if (entries.length > 0) setDialogMode("detail");
  }, [entries.length]);
  const exitDetail = useCallback(() => setDialogMode("list"), []);
  const toggleMinimized = useCallback(() => setMinimized((value) => !value), []);

  const state = useMemo<BackgroundTaskViewState>(
    () => ({
      entries,
      selectedIndex,
      dialogMode,
      dialogOpen: dialogMode !== "closed",
      pillFocused,
      minimized,
    }),
    [dialogMode, entries, minimized, pillFocused, selectedIndex],
  );
  const actions = useMemo<BackgroundTaskViewActions>(
    () => ({
      moveSelectionUp,
      moveSelectionDown,
      openDialog,
      closeDialog,
      enterDetail,
      exitDetail,
      setPillFocused,
      setMinimized,
      toggleMinimized,
    }),
    [
      closeDialog,
      enterDetail,
      exitDetail,
      moveSelectionDown,
      moveSelectionUp,
      openDialog,
      toggleMinimized,
    ],
  );

  return (
    <BackgroundTaskViewStateContext.Provider value={state}>
      <BackgroundTaskViewActionsContext.Provider value={actions}>
        {children}
      </BackgroundTaskViewActionsContext.Provider>
    </BackgroundTaskViewStateContext.Provider>
  );
}
