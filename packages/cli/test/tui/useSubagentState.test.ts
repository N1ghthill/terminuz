// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSubagentState } from "../../src/tui/ui/hooks/useSubagentState.js";

describe("useSubagentState", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces chunk bursts instead of updating React state every 100ms", () => {
    const { result } = renderHook(() => useSubagentState());

    act(() => {
      result.current.subagentStartBufferRef.current.push({
        taskId: "task-1",
        prompt: "Inspect auth",
      });
      result.current.flushSubagentBuffers();
    });

    act(() => {
      result.current.subagentChunkBufferRef.current.set("task-1", "first");
      result.current.flushSubagentBuffers();
    });
    expect(result.current.subagentMap.get("task-1")?.currentOutput).toBe("first");

    act(() => {
      vi.advanceTimersByTime(100);
      result.current.subagentChunkBufferRef.current.set("task-1", "first second");
      result.current.flushSubagentBuffers();
    });
    expect(result.current.subagentMap.get("task-1")?.currentOutput).toBe("first");

    act(() => {
      vi.advanceTimersByTime(400);
      result.current.flushSubagentBuffers();
    });
    expect(result.current.subagentMap.get("task-1")?.currentOutput).toBe("first second");
  });

  it("keeps terminal entries briefly and removes them in one batch", () => {
    const { result } = renderHook(() => useSubagentState());

    act(() => {
      result.current.subagentStartBufferRef.current.push(
        { taskId: "task-1", prompt: "One" },
        { taskId: "task-2", prompt: "Two" },
      );
      result.current.flushSubagentBuffers();
      result.current.subagentCompleteBufferRef.current.push(
        { taskId: "task-1" },
        { taskId: "task-2" },
      );
      result.current.flushSubagentBuffers();
    });
    expect(result.current.subagentMap.size).toBe(2);

    act(() => vi.advanceTimersByTime(7_999));
    expect(result.current.subagentMap.size).toBe(2);

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.subagentMap.size).toBe(0);
  });

  it("atomically marks orphaned running entries as cancelled", () => {
    const { result } = renderHook(() => useSubagentState());

    act(() => {
      result.current.subagentStartBufferRef.current.push({
        taskId: "task-1",
        prompt: "Inspect auth",
      });
      result.current.flushSubagentBuffers();
      result.current.settleRunningSubagents(true);
    });

    expect(result.current.subagentMap.get("task-1")).toMatchObject({
      status: "cancelled",
      currentTool: undefined,
      error: "Execution cancelled.",
    });
  });

  it("does not settle running background entries at parent turn end", () => {
    const { result } = renderHook(() => useSubagentState());

    act(() => {
      result.current.syncSubagentRecords([
        {
          taskId: "background-task",
          prompt: "Keep working",
          status: "running",
          mode: "background",
          sessionId: "child-session",
          parentSessionId: "parent-session",
          createdAt: Date.now(),
          startedAt: Date.now(),
        },
      ]);
      result.current.settleRunningSubagents(false);
    });

    expect(result.current.subagentMap.get("background-task")).toMatchObject({
      status: "running",
      mode: "background",
    });
  });

  it("reconciles lifecycle snapshots from the core registry", () => {
    const { result } = renderHook(() => useSubagentState());

    act(() => {
      result.current.syncSubagentRecords([
        {
          taskId: "task-1",
          prompt: "Inspect auth",
          status: "running",
          sessionId: "child-session",
          parentSessionId: "parent-session",
          createdAt: Date.now(),
          startedAt: Date.now(),
        },
      ]);
    });
    expect(result.current.subagentMap.get("task-1")?.status).toBe("running");

    act(() => {
      result.current.syncSubagentRecords([
        {
          taskId: "task-1",
          prompt: "Inspect auth",
          status: "completed",
          sessionId: "child-session",
          parentSessionId: "parent-session",
          createdAt: Date.now(),
          startedAt: Date.now(),
          completedAt: Date.now(),
          summary: "All checks passed",
        },
      ]);
    });
    expect(result.current.subagentMap.get("task-1")).toMatchObject({
      status: "done",
      summary: "All checks passed",
    });
  });

  it("keeps queued registry tasks visible without scheduling terminal cleanup", () => {
    const { result } = renderHook(() => useSubagentState());

    act(() => {
      result.current.syncSubagentRecords([
        {
          taskId: "queued-task",
          prompt: "Waiting for a worker",
          status: "queued",
          mode: "background",
          createdAt: Date.now(),
        },
      ]);
      vi.advanceTimersByTime(10_000);
    });

    expect(result.current.subagentMap.get("queued-task")).toMatchObject({
      status: "queued",
      mode: "background",
    });
  });
});
