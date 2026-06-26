// @vitest-environment happy-dom

import React, { type ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import {
  BackgroundTaskViewProvider,
  useBackgroundTaskViewActions,
  useBackgroundTaskViewState,
} from "../../src/tui/ui/contexts/BackgroundTaskViewContext.js";
import type { SubagentEntry } from "../../src/tui/ui/contexts/UIStateContext.js";

const entries: SubagentEntry[] = [
  {
    taskId: "task-1",
    prompt: "Inspect auth",
    status: "running",
    startedAt: 1,
  },
  {
    taskId: "task-2",
    prompt: "Run tests",
    status: "done",
    startedAt: 2,
  },
];

function wrapper({ children }: { children: ReactNode }) {
  return <BackgroundTaskViewProvider entries={entries}>{children}</BackgroundTaskViewProvider>;
}

describe("BackgroundTaskViewProvider", () => {
  it("exposes subagents and supports list/detail navigation", () => {
    const { result } = renderHook(
      () => ({
        state: useBackgroundTaskViewState(),
        actions: useBackgroundTaskViewActions(),
      }),
      { wrapper },
    );

    expect(result.current.state.entries).toEqual(entries);
    expect(result.current.state.dialogMode).toBe("closed");

    act(() => result.current.actions.openDialog());
    expect(result.current.state.dialogMode).toBe("list");

    act(() => result.current.actions.moveSelectionDown());
    expect(result.current.state.selectedIndex).toBe(1);

    act(() => result.current.actions.enterDetail());
    expect(result.current.state.dialogMode).toBe("detail");

    act(() => result.current.actions.exitDetail());
    expect(result.current.state.dialogMode).toBe("list");
  });

  it("minimizes only the presentation state", () => {
    const { result } = renderHook(
      () => ({
        state: useBackgroundTaskViewState(),
        actions: useBackgroundTaskViewActions(),
      }),
      { wrapper },
    );

    act(() => result.current.actions.toggleMinimized());
    expect(result.current.state.minimized).toBe(true);
    expect(result.current.state.entries).toEqual(entries);

    act(() => result.current.actions.toggleMinimized());
    expect(result.current.state.minimized).toBe(false);
  });

  it("cancels the selected running task only", () => {
    const onCancelTask = vi.fn(() => true);
    const customWrapper = ({ children }: { children: ReactNode }) => (
      <BackgroundTaskViewProvider entries={entries} onCancelTask={onCancelTask}>
        {children}
      </BackgroundTaskViewProvider>
    );
    const { result } = renderHook(
      () => ({
        state: useBackgroundTaskViewState(),
        actions: useBackgroundTaskViewActions(),
      }),
      { wrapper: customWrapper },
    );

    expect(result.current.actions.cancelSelected()).toBe(true);
    expect(onCancelTask).toHaveBeenCalledWith("task-1");

    act(() => result.current.actions.moveSelectionDown());
    expect(result.current.actions.cancelSelected()).toBe(false);
    expect(onCancelTask).toHaveBeenCalledTimes(1);
  });
});
