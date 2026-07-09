// @vitest-environment happy-dom

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ApprovalRequest } from "@terminuz/core";
import {
  APPROVAL_ENTER_ARM_DELAY_MS,
  APPROVAL_PROMPT_REVEAL_DELAY_MS,
  useApprovalQueue,
} from "../../src/tui/ui/hooks/useApprovalQueue.js";

function request(id: string): ApprovalRequest {
  return {
    id,
    operation: "write_file",
    level: "write",
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("useApprovalQueue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("reveals the approval prompt after the reveal delay", () => {
    const emitDecision = vi.fn();
    const { result } = renderHook(() => useApprovalQueue({ emitDecision }));

    act(() => result.current.enqueueApproval(request("approval-1")));
    expect(result.current.approvalPromptVisible).toBe(false);

    act(() => vi.advanceTimersByTime(APPROVAL_PROMPT_REVEAL_DELAY_MS));
    expect(result.current.approvalPromptVisible).toBe(true);
  });

  it("guards enter approval until the arm delay has elapsed", () => {
    const emitDecision = vi.fn();
    const { result } = renderHook(() => useApprovalQueue({ emitDecision }));

    act(() => result.current.enqueueApproval(request("approval-1")));
    expect(result.current.canApproveWithEnter()).toBe(false);

    act(() => vi.advanceTimersByTime(APPROVAL_ENTER_ARM_DELAY_MS));
    expect(result.current.canApproveWithEnter()).toBe(true);
  });

  it("emits decisions and calls onQueueDrained when the queue empties", () => {
    const emitDecision = vi.fn();
    const onQueueDrained = vi.fn();
    const { result } = renderHook(() => useApprovalQueue({ emitDecision, onQueueDrained }));

    act(() => result.current.enqueueApproval(request("approval-1")));
    act(() => {
      result.current.resolveApproval({ allowed: true, scope: "once", reason: "test" });
    });

    expect(emitDecision).toHaveBeenCalledWith("approval-1", {
      allowed: true,
      scope: "once",
      reason: "test",
    });
    expect(result.current.approvalQueue).toEqual([]);
    expect(result.current.approvalQueueRef.current).toEqual([]);
    expect(onQueueDrained).toHaveBeenCalled();
  });
});
