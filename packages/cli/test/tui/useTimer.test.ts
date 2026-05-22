// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTimer } from "../../src/tui/ui/hooks/useTimer.js";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("useTimer", () => {
  it("initializes to 0", () => {
    const { result } = renderHook(() => useTimer(false, null));
    expect(result.current).toBe(0);
  });

  it("does not increment when inactive", () => {
    const { result } = renderHook(() => useTimer(false, null));
    act(() => void vi.advanceTimersByTime(5000));
    expect(result.current).toBe(0);
  });

  it("increments by 1 each second when active", () => {
    const { result } = renderHook(() => useTimer(true, null));
    act(() => void vi.advanceTimersByTime(3000));
    expect(result.current).toBe(3);
  });

  it("resets to 0 when transitioning from inactive to active", () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useTimer(active, null),
      { initialProps: { active: false } },
    );
    act(() => void vi.advanceTimersByTime(2000));
    rerender({ active: true });
    expect(result.current).toBe(0);
    act(() => void vi.advanceTimersByTime(1000));
    expect(result.current).toBe(1);
  });

  it("resets to 0 when resetKey changes (while active)", () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: number }) => useTimer(true, key),
      { initialProps: { key: 0 } },
    );
    act(() => void vi.advanceTimersByTime(3000));
    expect(result.current).toBe(3);
    act(() => rerender({ key: 1 }));
    expect(result.current).toBe(0);
    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current).toBe(2);
  });

  it("stays at 0 when inactive even if resetKey changes", () => {
    const { result, rerender } = renderHook(
      ({ key }: { key: number }) => useTimer(false, key),
      { initialProps: { key: 0 } },
    );
    act(() => rerender({ key: 1 }));
    act(() => void vi.advanceTimersByTime(3000));
    expect(result.current).toBe(0);
  });

  it("clears the interval on unmount", () => {
    const { result, unmount } = renderHook(() => useTimer(true, null));
    act(() => void vi.advanceTimersByTime(2000));
    expect(result.current).toBe(2);
    unmount();
    // No error from dangling interval after unmount
    act(() => void vi.advanceTimersByTime(2000));
  });

  it("preserves elapsed time when going from active to inactive", () => {
    const { result, rerender } = renderHook(
      ({ active }: { active: boolean }) => useTimer(active, null),
      { initialProps: { active: true } },
    );
    act(() => void vi.advanceTimersByTime(4000));
    expect(result.current).toBe(4);
    rerender({ active: false });
    act(() => void vi.advanceTimersByTime(3000));
    expect(result.current).toBe(4);
  });
});
