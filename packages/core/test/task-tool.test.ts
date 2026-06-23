import { describe, expect, it, vi } from "vitest";
import { Effect } from "effect";
import { createTaskBatchTool, createTaskTool } from "../src/tools/task-tool.js";
import { SessionManager } from "../src/sessions/session-manager.js";
import type { SubagentManager } from "../src/agent/subagent-manager.js";
import type { ToolContext } from "../src/tools/tool.js";

describe("createTaskTool", () => {
  it("marks task activity as subagent activity for UI consumers", () => {
    const tool = createTaskTool({} as SubagentManager, "/tmp/worktree", {} as SessionManager);

    expect(tool.name).toBe("task");
    expect(tool.activityKind).toBe("subagent");
  });
});

describe("createTaskBatchTool", () => {
  it("runs named read-only agents through runParallel", async () => {
    const sessions = new SessionManager("/tmp/deepcode-task-batch-test");
    const parent = sessions.create({ provider: "openrouter", model: "model" });
    const runParallel = vi.fn(async (tasks: Array<{ id: string }>) =>
      tasks.map((task) => ({
        taskId: task.id,
        sessionId: `session-${task.id}`,
        output: "reviewed",
      })),
    );
    const tool = createTaskBatchTool(
      { runParallel } as unknown as SubagentManager,
      "/tmp/deepcode-task-batch-test",
      sessions,
    );

    const output = await Effect.runPromise(
      tool.execute(
        {
          tasks: [
            { prompt: "Review auth", subagent_type: "code-reviewer" },
            { prompt: "Review tests", subagent_type: "code-reviewer" },
          ],
          concurrency: 2,
        },
        {
          sessionId: parent.id,
          subagentDepth: 0,
          abortSignal: new AbortController().signal,
        } as ToolContext,
      ),
    );

    expect(runParallel).toHaveBeenCalledOnce();
    expect(runParallel.mock.calls[0]?.[0]).toHaveLength(2);
    expect(output).toContain("## code-reviewer");
  });

  it("rejects mutating named agents from parallel execution", async () => {
    const sessions = new SessionManager("/tmp/deepcode-task-batch-unsafe-test");
    const parent = sessions.create({ provider: "openrouter", model: "model" });
    const runParallel = vi.fn();
    const tool = createTaskBatchTool(
      { runParallel } as unknown as SubagentManager,
      "/tmp/deepcode-task-batch-unsafe-test",
      sessions,
    );

    await expect(
      Effect.runPromise(
        tool.execute(
          {
            tasks: [
              { prompt: "Refactor auth", subagent_type: "refactor" },
              { prompt: "Refactor tests", subagent_type: "refactor" },
            ],
          },
          {
            sessionId: parent.id,
            subagentDepth: 0,
            abortSignal: new AbortController().signal,
          } as ToolContext,
        ),
      ),
    ).rejects.toThrow("not safe for parallel execution");
    expect(runParallel).not.toHaveBeenCalled();
  });
});
