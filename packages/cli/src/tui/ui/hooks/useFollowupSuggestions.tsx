import { useState, useCallback, useRef } from "react";
import type { Config } from "@deepcode/tui-shim";

export interface FollowupState {
  isVisible: boolean;
  suggestion: string | null;
}

export interface UseFollowupSuggestionsOptions {
  enabled?: boolean;
  onAccept?: (suggestion: string) => void;
  config?: Config;
  isFocused?: boolean;
}

export interface UseFollowupSuggestionsReturn {
  state: FollowupState;
  setSuggestion: (text: string | null) => void;
  accept: (
    method?: "tab" | "enter" | "right",
    options?: { skipOnAccept?: boolean },
  ) => void;
  dismiss: () => void;
  clear: () => void;
  recordKeystroke: () => void;
}

export function useFollowupSuggestionsCLI(
  options?: UseFollowupSuggestionsOptions,
): UseFollowupSuggestionsReturn {
  const [state, setState] = useState<FollowupState>({ isVisible: false, suggestion: null });
  const onAcceptRef = useRef(options?.onAccept);
  onAcceptRef.current = options?.onAccept;

  const setSuggestion = useCallback((text: string | null) => {
    setState({ isVisible: text !== null && text.trim().length > 0, suggestion: text });
  }, []);

  const dismiss = useCallback(() => {
    setState({ isVisible: false, suggestion: null });
  }, []);

  const accept = useCallback(
    (_method?: "tab" | "enter" | "right", opts?: { skipOnAccept?: boolean }) => {
      setState((prev) => {
        if (prev.suggestion && !opts?.skipOnAccept) {
          onAcceptRef.current?.(prev.suggestion);
        }
        return { isVisible: false, suggestion: null };
      });
    },
    [],
  );

  return {
    state,
    setSuggestion,
    accept,
    dismiss,
    clear: dismiss,
    recordKeystroke: dismiss,
  };
}
