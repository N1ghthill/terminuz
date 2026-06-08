import { useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { SubagentEntry } from "../contexts/UIStateContext.js";

const SUBAGENT_CLEANUP_DELAY_MS = 2000;

export interface SubagentStateReturn {
  subagentMap: Map<string, SubagentEntry>;
  /** Append-only buffer — flushed by the 100ms interval in AppContainer. */
  subagentStartBufferRef: RefObject<Array<{ taskId: string; prompt: string }>>;
  subagentCompleteBufferRef: RefObject<Array<{ taskId: string; error?: string }>>;
  /** Map buffers — keyed by taskId so only the latest value per agent matters. */
  subagentChunkBufferRef: RefObject<Map<string, string>>;
  subagentToolBufferRef: RefObject<Map<string, { toolName: string; active: boolean }>>;
  /** Flush pending buffer entries into subagentMap. Called from the 100ms interval. */
  flushSubagentBuffers: () => void;
}

export function useSubagentState(): SubagentStateReturn {
  const [subagentMap, setSubagentMap] = useState<Map<string, SubagentEntry>>(new Map());

  const subagentStartBufferRef = useRef<Array<{ taskId: string; prompt: string }>>([]);
  const subagentCompleteBufferRef = useRef<Array<{ taskId: string; error?: string }>>([]);
  const subagentChunkBufferRef = useRef<Map<string, string>>(new Map());
  const subagentToolBufferRef = useRef<Map<string, { toolName: string; active: boolean }>>(new Map());
  const subagentCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flushSubagentBuffers = (): void => {
    const starts = subagentStartBufferRef.current;
    const completes = subagentCompleteBufferRef.current;
    const chunks = subagentChunkBufferRef.current;
    const tools = subagentToolBufferRef.current;
    const hasChanges =
      starts.length > 0 || completes.length > 0 || chunks.size > 0 || tools.size > 0;
    if (!hasChanges) return;

    if (starts.length > 0 && subagentCleanupTimerRef.current !== null) {
      clearTimeout(subagentCleanupTimerRef.current);
      subagentCleanupTimerRef.current = null;
    }
    subagentStartBufferRef.current = [];
    subagentCompleteBufferRef.current = [];
    subagentChunkBufferRef.current = new Map();
    subagentToolBufferRef.current = new Map();

    setSubagentMap((prev) => {
      const next = new Map(prev);
      for (const { taskId, prompt } of starts) {
        next.set(taskId, { taskId, prompt: prompt.slice(0, 50), status: "running", startedAt: Date.now() });
      }
      for (const [taskId, output] of chunks) {
        const entry = next.get(taskId);
        if (entry) next.set(taskId, { ...entry, currentOutput: output });
      }
      for (const [taskId, { toolName, active }] of tools) {
        const entry = next.get(taskId);
        if (entry) next.set(taskId, { ...entry, currentTool: active ? toolName : undefined });
      }
      for (const { taskId, error } of completes) {
        const entry = next.get(taskId);
        if (entry) {
          next.set(taskId, { ...entry, status: error ? "failed" : "done", currentTool: undefined, error });
        }
      }
      return next;
    });
  };

  // When ALL subagents finish, schedule a single cleanup that removes every
  // done/failed entry at once — avoids staggered per-subagent removal renders
  // that cause the panel to shrink one line at a time.
  useEffect(() => {
    const allDone =
      subagentMap.size > 0 &&
      Array.from(subagentMap.values()).every((e) => e.status !== "running");
    if (allDone) {
      if (subagentCleanupTimerRef.current === null) {
        subagentCleanupTimerRef.current = setTimeout(() => {
          subagentCleanupTimerRef.current = null;
          setSubagentMap(new Map());
        }, SUBAGENT_CLEANUP_DELAY_MS);
      }
    } else if (subagentCleanupTimerRef.current !== null) {
      clearTimeout(subagentCleanupTimerRef.current);
      subagentCleanupTimerRef.current = null;
    }
  }, [subagentMap]);

  // Cancel the cleanup timer on unmount to prevent setState on a dead component.
  useEffect(() => {
    return () => {
      if (subagentCleanupTimerRef.current !== null) {
        clearTimeout(subagentCleanupTimerRef.current);
        subagentCleanupTimerRef.current = null;
      }
    };
  }, []);

  return {
    subagentMap,
    subagentStartBufferRef,
    subagentCompleteBufferRef,
    subagentChunkBufferRef,
    subagentToolBufferRef,
    flushSubagentBuffers,
  };
}
