// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHistory } from "../../src/tui/ui/hooks/useHistoryManager.js";

const BASE_TS = 1_000_000;

describe("useHistory", () => {
  it("starts with an empty history", () => {
    const { result } = renderHook(() => useHistory());
    expect(result.current.history).toEqual([]);
  });

  it("addItem returns a unique ID and appends to history", () => {
    const { result } = renderHook(() => useHistory());
    let id: number;
    act(() => {
      id = result.current.addItem({ type: "user", text: "hello" }, BASE_TS);
    });
    expect(result.current.history).toHaveLength(1);
    expect(result.current.history[0]!.id).toBe(id!);
    expect(result.current.history[0]!.type).toBe("user");
  });

  it("generates unique IDs when timestamps are equal", () => {
    const { result } = renderHook(() => useHistory());
    let id1: number, id2: number;
    act(() => {
      id1 = result.current.addItem({ type: "user", text: "a" }, BASE_TS);
      id2 = result.current.addItem({ type: "info", text: "b" }, BASE_TS);
    });
    expect(id1!).not.toBe(id2!);
    expect(result.current.history).toHaveLength(2);
  });

  it("updateItem modifies an existing item by ID", () => {
    const { result } = renderHook(() => useHistory());
    let id: number;
    act(() => {
      id = result.current.addItem({ type: "info", text: "original" }, BASE_TS);
    });
    act(() => {
      result.current.updateItem(id!, { text: "updated" });
    });
    expect(result.current.history[0]!.text).toBe("updated");
  });

  it("updateItem with a nonexistent ID leaves history unchanged", () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.addItem({ type: "info", text: "only item" }, BASE_TS);
    });
    const before = result.current.history.slice();
    act(() => {
      result.current.updateItem(99999, { text: "ghost" });
    });
    expect(result.current.history).toEqual(before);
  });

  it("clearItems empties history and resets the ID counter", () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.addItem({ type: "info", text: "a" }, BASE_TS);
      result.current.addItem({ type: "info", text: "b" }, BASE_TS);
    });
    act(() => {
      result.current.clearItems();
    });
    expect(result.current.history).toEqual([]);
    // After reset the next ID starts from BASE_TS + 1 again
    let id: number;
    act(() => {
      id = result.current.addItem({ type: "info", text: "c" }, BASE_TS);
    });
    expect(id!).toBe(BASE_TS + 1);
  });

  it("does not add a consecutive duplicate user message", () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.addItem({ type: "user", text: "same" }, BASE_TS);
      result.current.addItem({ type: "user", text: "same" }, BASE_TS);
    });
    expect(result.current.history).toHaveLength(1);
  });

  it("allows non-consecutive duplicate user messages", () => {
    const { result } = renderHook(() => useHistory());
    act(() => {
      result.current.addItem({ type: "user", text: "same" }, BASE_TS);
      result.current.addItem({ type: "info", text: "interlude" }, BASE_TS);
      result.current.addItem({ type: "user", text: "same" }, BASE_TS);
    });
    expect(result.current.history).toHaveLength(3);
  });
});
