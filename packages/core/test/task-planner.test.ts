import { describe, expect, it } from "vitest";
import { TaskPlanner, type TaskPlan } from "../src/agent/task-planner.js";

describe("TaskPlanner", () => {
  it("rejects empty plans from the planner model", async () => {
    const planner = new TaskPlanner();

    await expect(
      planner.plan("inspect permissions", async () => "[]"),
    ).rejects.toThrow("At least one task is required");
  });

  it("only treats plans with all tasks completed as complete", () => {
    const planner = new TaskPlanner();
    const plan: TaskPlan = {
      objective: "fix permissions",
      tasks: [
        {
          id: "task-1",
          description: "inspect config",
          type: "research",
          dependencies: [],
          status: "completed",
        },
        {
          id: "task-2",
          description: "run validation",
          type: "verify",
          dependencies: ["task-1"],
          status: "failed",
        },
      ],
    };

    expect(planner.isComplete(plan)).toBe(false);
    expect(planner.hasFailures(plan)).toBe(true);
  });

  it("returns zero progress for empty task lists", () => {
    const planner = new TaskPlanner();
    const progress = planner.getProgress({ objective: "noop", tasks: [] });

    expect(progress).toEqual({ completed: 0, total: 0, percentage: 0 });
  });

  it("rejects mutating git plans for read-only discovery objectives", async () => {
    const planner = new TaskPlanner();

    await expect(
      planner.plan(
        "Use o git para rastrear os projetos e o diretorio",
        async () =>
          JSON.stringify([
            {
              id: "init-git",
              description: "Initialize a git repository in the home directory",
              type: "code",
              dependencies: [],
            },
          ]),
      ),
    ).rejects.toThrow("Unsafe mutating task in read-only plan");
  });
});
