import { useState, useEffect, useRef } from "react";

export const useTimer = (isActive: boolean, resetKey: unknown): number => {
  const [elapsedTime, setElapsedTime] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevResetKeyRef = useRef(resetKey);
  const prevIsActiveRef = useRef(isActive);

  useEffect(() => {
    let shouldReset = false;

    if (prevResetKeyRef.current !== resetKey) {
      shouldReset = true;
      prevResetKeyRef.current = resetKey;
    }
    if (!prevIsActiveRef.current && isActive) {
      shouldReset = true;
    }
    if (shouldReset) setElapsedTime(0);
    prevIsActiveRef.current = isActive;

    if (isActive) {
      if (timerRef.current) clearInterval(timerRef.current);
      timerRef.current = setInterval(() => {
        setElapsedTime((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [isActive, resetKey]);

  return elapsedTime;
};
