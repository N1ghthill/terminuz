import { useState, useEffect, useRef } from "react";
import { StreamingState } from "../types.js";
import { useTimer } from "./useTimer.js";

/**
 * Returns the elapsed seconds for the current streaming turn.
 * While WaitingForConfirmation the last Responding-phase value is frozen so
 * the approval prompt shows how long the model had been running.
 * Isolates 1-second timer state so only the consuming component re-renders,
 * not all useUIState() subscribers.
 */
export function useElapsedTime(streamingState: StreamingState): number {
  const [timerResetKey, setTimerResetKey] = useState(0);
  const isTimerActive = streamingState === StreamingState.Responding;
  const elapsedFromTimer = useTimer(isTimerActive, timerResetKey);
  const elapsedFromTimerRef = useRef(0);
  elapsedFromTimerRef.current = elapsedFromTimer;

  const [retained, setRetained] = useState(0);
  const prevStateRef = useRef<StreamingState>(StreamingState.Idle);

  useEffect(() => {
    const prev = prevStateRef.current;
    prevStateRef.current = streamingState;

    if (
      prev === StreamingState.WaitingForConfirmation &&
      streamingState === StreamingState.Responding
    ) {
      setTimerResetKey((k) => k + 1);
      setRetained(0);
    } else if (prev === StreamingState.Responding && streamingState === StreamingState.Idle) {
      setTimerResetKey((k) => k + 1);
      setRetained(0);
    } else if (
      prev === StreamingState.Responding &&
      streamingState === StreamingState.WaitingForConfirmation
    ) {
      setRetained(elapsedFromTimerRef.current);
    }
  }, [streamingState]);

  return streamingState === StreamingState.WaitingForConfirmation ? retained : elapsedFromTimer;
}
