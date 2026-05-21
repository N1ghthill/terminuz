import { useState, useEffect, useRef } from "react";
import { StreamingState } from "../types.js";
import { useTimer } from "./useTimer.js";
import { usePhraseCycler } from "./usePhraseCycler.js";

export const useLoadingIndicator = (
  streamingState: StreamingState,
  customPhrases?: string[],
) => {
  const [timerResetKey, setTimerResetKey] = useState(0);
  const isTimerActive = streamingState === StreamingState.Responding;
  const elapsedTimeFromTimer = useTimer(isTimerActive, timerResetKey);

  const isPhraseCyclingActive = streamingState === StreamingState.Responding;
  const isWaiting = streamingState === StreamingState.WaitingForConfirmation;
  const currentLoadingPhrase = usePhraseCycler(isPhraseCyclingActive, isWaiting, customPhrases);

  const [retainedElapsedTime, setRetainedElapsedTime] = useState(0);
  const prevStateRef = useRef<StreamingState | null>(null);

  useEffect(() => {
    const prev = prevStateRef.current;

    if (
      prev === StreamingState.WaitingForConfirmation &&
      streamingState === StreamingState.Responding
    ) {
      setTimerResetKey((k) => k + 1);
      setRetainedElapsedTime(0);
    } else if (
      streamingState === StreamingState.Idle &&
      prev === StreamingState.Responding
    ) {
      setTimerResetKey((k) => k + 1);
      setRetainedElapsedTime(0);
    } else if (streamingState === StreamingState.WaitingForConfirmation) {
      setRetainedElapsedTime(elapsedTimeFromTimer);
    }

    prevStateRef.current = streamingState;
  }, [streamingState, elapsedTimeFromTimer]);

  return {
    elapsedTime:
      streamingState === StreamingState.WaitingForConfirmation
        ? retainedElapsedTime
        : elapsedTimeFromTimer,
    currentLoadingPhrase,
  };
};
