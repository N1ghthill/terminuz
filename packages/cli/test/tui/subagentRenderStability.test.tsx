import React, { act } from "react";
import { cleanup, render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubagentsPanel } from "../../src/tui/ui/components/SubagentsPanel.js";
import {
  useSubagentState,
  type SubagentStateReturn,
} from "../../src/tui/ui/hooks/useSubagentState.js";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

let controls: SubagentStateReturn;

function Harness() {
  controls = useSubagentState();
  return (
    <SubagentsPanel mainAreaWidth={80} subagents={Array.from(controls.subagentMap.values())} />
  );
}

describe("subagent render stability", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T00:00:00.000Z"));
  });

  afterEach(() => {
    act(() => cleanup());
    vi.useRealTimers();
  });

  it("keeps layout height fixed and coalesces a 10fps chunk burst", () => {
    let view: ReturnType<typeof render>;
    act(() => {
      view = render(<Harness />);
    });
    const initialLines = (view.lastFrame() ?? "").split("\n").length;

    act(() => {
      controls.subagentStartBufferRef.current.push({
        taskId: "task-1",
        prompt: "Inspect auth",
      });
      controls.flushSubagentBuffers();
    });
    const framesAfterStart = view.frames.length;

    for (let index = 0; index < 10; index += 1) {
      act(() => {
        vi.advanceTimersByTime(100);
        controls.subagentChunkBufferRef.current.set("task-1", `stream chunk ${index}`);
        controls.flushSubagentBuffers();
      });
    }

    const finalLines = (view.lastFrame() ?? "").split("\n").length;
    const burstFrames = view.frames.length - framesAfterStart;

    expect(finalLines).toBe(initialLines);
    expect(burstFrames).toBeLessThanOrEqual(3);
    expect(view.lastFrame()).toContain("1 running");
    expect(view.lastFrame()).not.toContain("stream chunk");
  });
});
