import { describe, expect, it, vi } from "vitest";
import type { AgentRunOptions } from "../src/agent/agent.js";
import type { Agent } from "../src/agent/agent.js";
import { SubagentManager } from "../src/agent/subagent-manager.js";
import { EventBus } from "../src/events/event-bus.js";
import { SessionManager } from "../src/sessions/session-manager.js";

function makeFakeAgent(
  handler?: (options: AgentRunOptions) => Promise<string>,
): Agent {
  return {
    run: handler ?? (async (options: AgentRunOptions) => `done:${options.input}`),
  } as unknown as Agent;
}

describe("SubagentManager", () => {
  it("runs tasks in child sessions", async () => {
    const sessions = new SessionManager("/tmp/deepcode-subagent-test");
    const manager = new SubagentManager(makeFakeAgent(), sessions, "openrouter", "model");
    const results = await manager.runParallel(
      [
        { id: "a", prompt: "A" },
        { id: "b", prompt: "B" },
      ],
      { concurrency: 2 },
    );
    expect(results.map((result) => result.output).sort()).toEqual(["done:A", "done:B"]);
    expect(sessions.list().every((session) => session.metadata.subagent === true)).toBe(true);
  });

  it("emits subagent:start and subagent:complete on EventBus", async () => {
    const sessions = new SessionManager("/tmp/deepcode-subagent-events-test");
    const events = new EventBus();
    const manager = new SubagentManager(makeFakeAgent(), sessions, "openrouter", "model", 4, events);

    const started: Array<{ taskId: string; prompt: string }> = [];
    const completed: Array<{ taskId: string; error?: string }> = [];
    events.on("subagent:start", (p) => started.push(p));
    events.on("subagent:complete", (p) => completed.push(p));

    await manager.runOne({ id: "task-1", prompt: "do something" });

    expect(started).toHaveLength(1);
    expect(started[0]).toEqual({ taskId: "task-1", prompt: "do something" });
    expect(completed).toHaveLength(1);
    expect(completed[0]).toEqual({ taskId: "task-1" });
  });

  it("emits subagent:chunk events via onChunk callback", async () => {
    const sessions = new SessionManager("/tmp/deepcode-subagent-chunk-test");
    const events = new EventBus();

    const fakeAgent = makeFakeAgent(async (options: AgentRunOptions) => {
      options.onChunk?.("Hello ");
      options.onChunk?.("world");
      return "Hello world";
    });

    const manager = new SubagentManager(fakeAgent, sessions, "openrouter", "model", 4, events);

    const chunks: Array<{ taskId: string; text: string }> = [];
    events.on("subagent:chunk", (p) => chunks.push(p));

    await manager.runOne({ id: "task-chunk", prompt: "stream something" });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toEqual({ taskId: "task-chunk", text: "Hello " });
    expect(chunks[1]).toEqual({ taskId: "task-chunk", text: "world" });
  });

  it("emits subagent:tool events via onToolActivity callback", async () => {
    const sessions = new SessionManager("/tmp/deepcode-subagent-tool-test");
    const events = new EventBus();

    const fakeAgent = makeFakeAgent(async (options: AgentRunOptions) => {
      options.onToolActivity?.("read_file", true);
      options.onToolActivity?.("read_file", false);
      options.onToolActivity?.("bash", true);
      options.onToolActivity?.("bash", false);
      return "files read";
    });

    const manager = new SubagentManager(fakeAgent, sessions, "openrouter", "model", 4, events);

    const toolEvents: Array<{ taskId: string; toolName: string; active: boolean }> = [];
    events.on("subagent:tool", (p) => toolEvents.push(p));

    await manager.runOne({ id: "task-tools", prompt: "read some files" });

    expect(toolEvents).toHaveLength(4);
    expect(toolEvents[0]).toEqual({ taskId: "task-tools", toolName: "read_file", active: true });
    expect(toolEvents[1]).toEqual({ taskId: "task-tools", toolName: "read_file", active: false });
    expect(toolEvents[2]).toEqual({ taskId: "task-tools", toolName: "bash", active: true });
    expect(toolEvents[3]).toEqual({ taskId: "task-tools", toolName: "bash", active: false });
  });

  it("emits subagent:complete with error when agent.run throws", async () => {
    const sessions = new SessionManager("/tmp/deepcode-subagent-error-test");
    const events = new EventBus();

    const fakeAgent = makeFakeAgent(async () => {
      throw new Error("provider timeout");
    });

    const manager = new SubagentManager(fakeAgent, sessions, "openrouter", "model", 4, events);

    const started: Array<{ taskId: string }> = [];
    const completed: Array<{ taskId: string; error?: string }> = [];
    events.on("subagent:start", (p) => started.push(p));
    events.on("subagent:complete", (p) => completed.push(p));

    const result = await manager.runOne({ id: "task-fail", prompt: "do something broken" });

    expect(result.error).toContain("provider timeout");
    expect(result.output).toBe("");
    expect(started).toHaveLength(1);
    expect(completed).toHaveLength(1);
    expect(completed[0]?.error).toContain("provider timeout");
  });

  it("runParallel emits events for all tasks", async () => {
    const sessions = new SessionManager("/tmp/deepcode-subagent-parallel-test");
    const events = new EventBus();
    const manager = new SubagentManager(makeFakeAgent(), sessions, "openrouter", "model", 4, events);

    const starts: string[] = [];
    const completions: string[] = [];
    events.on("subagent:start", (p) => starts.push(p.taskId));
    events.on("subagent:complete", (p) => completions.push(p.taskId));

    await manager.runParallel([
      { id: "p1", prompt: "task one" },
      { id: "p2", prompt: "task two" },
      { id: "p3", prompt: "task three" },
    ], { concurrency: 3 });

    expect(starts.sort()).toEqual(["p1", "p2", "p3"]);
    expect(completions.sort()).toEqual(["p1", "p2", "p3"]);
  });

  it("does not emit EventBus events when no EventBus is provided", async () => {
    const sessions = new SessionManager("/tmp/deepcode-subagent-nobus-test");
    const events = new EventBus();
    const spy = vi.fn();
    events.on("subagent:start", spy);
    events.on("subagent:complete", spy);

    // No events arg — no EventBus wired
    const manager = new SubagentManager(makeFakeAgent(), sessions, "openrouter", "model");
    await manager.runOne({ id: "no-bus", prompt: "quiet task" });

    expect(spy).not.toHaveBeenCalled();
  });

  it("passes systemPrompt, allowedTools, and disallowedTools to agent.run", async () => {
    const sessions = new SessionManager("/tmp/deepcode-subagent-overrides-test");
    let capturedOptions: AgentRunOptions | undefined;

    const fakeAgent = makeFakeAgent(async (options: AgentRunOptions) => {
      capturedOptions = options;
      return "done";
    });

    const manager = new SubagentManager(fakeAgent, sessions, "openrouter", "model");
    await manager.runOne({
      id: "override-task",
      prompt: "review this code",
      systemPrompt: "You are a strict code reviewer.",
      allowedTools: ["read_file", "search_text"],
      disallowedTools: ["bash"],
    });

    expect(capturedOptions?.systemPrompt).toBe("You are a strict code reviewer.");
    expect(capturedOptions?.allowedTools).toEqual(["read_file", "search_text"]);
    expect(capturedOptions?.disallowedTools).toEqual(["bash"]);
  });
});
