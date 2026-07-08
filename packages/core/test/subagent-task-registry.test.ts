import { describe, expect, it, vi } from "vitest";
import { SubagentTaskRegistry } from "../src/agent/subagent-task-registry.js";

describe("SubagentTaskRegistry", () => {
  it("tracks the complete task lifecycle and publishes snapshots", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-23T00:00:00.000Z"));
    const registry = new SubagentTaskRegistry();
    const snapshots: string[][] = [];
    const unsubscribe = registry.subscribe((records) => {
      snapshots.push(records.map((record) => `${record.taskId}:${record.status}`));
    });

    registry.register({
      taskId: "task-1",
      prompt: "Inspect auth",
      parentSessionId: "parent-1",
      subagentType: "code-reviewer",
    });
    registry.start("task-1", "child-1");
    registry.setTool("task-1", "read_file", true);
    registry.appendOutput("task-1", "done");
    registry.complete("task-1", "review complete");

    expect(registry.get("task-1")).toMatchObject({
      taskId: "task-1",
      sessionId: "child-1",
      parentSessionId: "parent-1",
      subagentType: "code-reviewer",
      status: "completed",
      currentOutput: "done",
      currentTool: undefined,
      summary: "review complete",
    });
    expect(snapshots).toEqual([[], ["task-1:queued"], ["task-1:running"], ["task-1:completed"]]);

    unsubscribe();
    vi.useRealTimers();
  });

  it("cancels all active children of one parent without touching others", () => {
    const registry = new SubagentTaskRegistry();
    registry.register({ taskId: "a", prompt: "A", parentSessionId: "parent-1" });
    registry.register({ taskId: "b", prompt: "B", parentSessionId: "parent-1" });
    registry.register({ taskId: "c", prompt: "C", parentSessionId: "parent-2" });
    registry.start("a", "child-a");
    registry.start("b", "child-b");
    registry.start("c", "child-c");

    expect(registry.cancelByParentSession("parent-1")).toBe(2);
    expect(registry.get("a")?.status).toBe("cancelled");
    expect(registry.get("b")?.status).toBe("cancelled");
    expect(registry.get("c")?.status).toBe("running");
  });

  it("keeps background tasks alive when cancelling a parent session", () => {
    const registry = new SubagentTaskRegistry();
    registry.register({ taskId: "blocking", prompt: "A", parentSessionId: "parent-1" });
    registry.register({
      taskId: "background",
      prompt: "B",
      parentSessionId: "parent-1",
      mode: "background",
    });
    registry.start("blocking", "child-a");
    registry.start("background", "child-b");

    expect(registry.cancelByParentSession("parent-1")).toBe(1);
    expect(registry.get("blocking")?.status).toBe("cancelled");
    expect(registry.get("background")).toMatchObject({
      status: "running",
      mode: "background",
    });
  });

  it("restores interrupted active tasks as cancelled records", () => {
    const registry = new SubagentTaskRegistry();

    registry.restore([
      {
        taskId: "background",
        prompt: "Keep working",
        status: "running",
        mode: "background",
        createdAt: Date.now() - 1000,
        startedAt: Date.now() - 500,
      },
    ]);

    expect(registry.get("background")).toMatchObject({
      taskId: "background",
      status: "cancelled",
      mode: "background",
      error: "Background task was interrupted because the previous DeepCode process ended.",
    });
  });

  it("publishes one snapshot when several queued tasks are registered as a batch", () => {
    const registry = new SubagentTaskRegistry();
    const snapshots: string[][] = [];
    registry.subscribe((records) => snapshots.push(records.map((record) => record.taskId)));

    registry.batch(() => {
      registry.register({ taskId: "a", prompt: "A" });
      registry.register({ taskId: "b", prompt: "B" });
      registry.register({ taskId: "c", prompt: "C" });
    });

    expect(snapshots).toEqual([[], ["a", "b", "c"]]);
  });
});
