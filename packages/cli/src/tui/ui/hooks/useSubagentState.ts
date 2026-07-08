import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import type { SubagentTaskRecord } from "@deepcode/core";
import type { SubagentEntry } from "../contexts/UIStateContext.js";

const SUBAGENT_CLEANUP_DELAY_MS = 8_000;
const SUBAGENT_OUTPUT_FLUSH_INTERVAL_MS = 500;

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
  /** Atomically settle entries left running when the parent turn ends. */
  settleRunningSubagents: (cancelled: boolean) => void;
  /** Reconcile lifecycle state from the core registry source of truth. */
  syncSubagentRecords: (records: readonly SubagentTaskRecord[]) => void;
}

export function useSubagentState(): SubagentStateReturn {
  const [subagentMap, setSubagentMap] = useState<Map<string, SubagentEntry>>(new Map());

  const subagentStartBufferRef = useRef<Array<{ taskId: string; prompt: string }>>([]);
  const subagentCompleteBufferRef = useRef<Array<{ taskId: string; error?: string }>>([]);
  const subagentChunkBufferRef = useRef<Map<string, string>>(new Map());
  const subagentToolBufferRef = useRef<Map<string, { toolName: string; active: boolean }>>(
    new Map(),
  );
  const subagentCleanupTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOutputFlushAtRef = useRef(0);

  const flushSubagentBuffers = useCallback((): void => {
    const starts = subagentStartBufferRef.current;
    const completes = subagentCompleteBufferRef.current;
    const chunks = subagentChunkBufferRef.current;
    const tools = subagentToolBufferRef.current;
    const now = Date.now();
    const flushOutput =
      chunks.size > 0 &&
      (completes.length > 0 ||
        now - lastOutputFlushAtRef.current >= SUBAGENT_OUTPUT_FLUSH_INTERVAL_MS);
    const hasChanges = starts.length > 0 || completes.length > 0 || flushOutput || tools.size > 0;
    if (!hasChanges) return;

    if (starts.length > 0 && subagentCleanupTimerRef.current !== null) {
      clearTimeout(subagentCleanupTimerRef.current);
      subagentCleanupTimerRef.current = null;
    }
    subagentStartBufferRef.current = [];
    subagentCompleteBufferRef.current = [];
    subagentToolBufferRef.current = new Map();
    if (flushOutput) {
      subagentChunkBufferRef.current = new Map();
      lastOutputFlushAtRef.current = now;
    }

    setSubagentMap((prev) => {
      const next = new Map(prev);
      let changed = false;
      for (const { taskId, prompt } of starts) {
        next.set(taskId, {
          taskId,
          prompt: prompt.slice(0, 50),
          status: "running",
          startedAt: Date.now(),
        });
        changed = true;
      }
      if (flushOutput) {
        for (const [taskId, output] of chunks) {
          const entry = next.get(taskId);
          if (entry && entry.currentOutput !== output) {
            next.set(taskId, { ...entry, currentOutput: output });
            changed = true;
          }
        }
      }
      for (const [taskId, { toolName, active }] of tools) {
        const entry = next.get(taskId);
        const currentTool = active ? toolName : undefined;
        if (entry && entry.currentTool !== currentTool) {
          next.set(taskId, { ...entry, currentTool });
          changed = true;
        }
      }
      for (const { taskId, error } of completes) {
        const entry = next.get(taskId);
        if (entry) {
          const cancelled = Boolean(error && /abort|cancel/i.test(error));
          next.set(taskId, {
            ...entry,
            status: cancelled ? "cancelled" : error ? "failed" : "done",
            currentTool: undefined,
            error,
          });
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  const settleRunningSubagents = useCallback((cancelled: boolean): void => {
    setSubagentMap((prev) => {
      let changed = false;
      const next = new Map(prev);
      for (const [taskId, entry] of next) {
        if (entry.status !== "running") continue;
        if (entry.mode === "background") continue;
        next.set(taskId, {
          ...entry,
          status: cancelled ? "cancelled" : "failed",
          currentTool: undefined,
          error: cancelled ? "Execution cancelled." : "Execution ended without a final event.",
        });
        changed = true;
      }
      return changed ? next : prev;
    });
  }, []);

  const syncSubagentRecords = useCallback((records: readonly SubagentTaskRecord[]): void => {
    setSubagentMap((prev) => {
      const next = new Map(prev);
      let changed = false;
      const visibleIds = new Set<string>();
      const now = Date.now();

      for (const record of records) {
        if (
          record.mode !== "background" &&
          record.completedAt !== undefined &&
          now - record.completedAt >= SUBAGENT_CLEANUP_DELAY_MS
        ) {
          continue;
        }
        visibleIds.add(record.taskId);
        const status: SubagentEntry["status"] =
          record.status === "completed" ? "done" : record.status;
        const previous = next.get(record.taskId);
        const candidate: SubagentEntry = {
          taskId: record.taskId,
          prompt: record.prompt.slice(0, 50),
          status,
          mode: record.mode,
          currentTool: previous?.currentTool ?? record.currentTool,
          currentOutput: previous?.currentOutput ?? record.currentOutput,
          summary: record.summary,
          startedAt: record.startedAt ?? record.createdAt,
          error: record.error,
        };
        if (
          !previous ||
          previous.status !== candidate.status ||
          previous.mode !== candidate.mode ||
          previous.error !== candidate.error ||
          previous.currentOutput !== candidate.currentOutput ||
          previous.summary !== candidate.summary ||
          previous.currentTool !== candidate.currentTool ||
          previous.prompt !== candidate.prompt
        ) {
          next.set(record.taskId, candidate);
          changed = true;
        }
      }

      for (const taskId of next.keys()) {
        if (!visibleIds.has(taskId)) {
          next.delete(taskId);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, []);

  // When ALL subagents finish, schedule a single cleanup that removes every
  // done/failed entry at once — avoids staggered per-subagent removal renders
  // that cause the panel to shrink one line at a time.
  useEffect(() => {
    const allDone =
      subagentMap.size > 0 &&
      Array.from(subagentMap.values()).every(
        (entry) =>
          entry.status === "done" || entry.status === "failed" || entry.status === "cancelled",
      ) &&
      Array.from(subagentMap.values()).every((entry) => entry.mode !== "background");
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
    settleRunningSubagents,
    syncSubagentRecords,
  };
}
