import { describe, expect, it } from "vitest";
import { EventBus } from "@deepcode/core";
import { attachAutoApprover } from "../src/approval.js";

describe("attachAutoApprover", () => {
  it("approves non-dangerous requests when --yes is active", () => {
    const events = new EventBus();
    attachAutoApprover(events, { reason: "Approved in test" });

    let decision: unknown;
    events.on("approval:decision", (payload) => {
      decision = payload;
    });

    events.emit("approval:request", {
      id: "approval_1",
      operation: "write_file",
      level: "write",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(decision).toEqual({
      requestId: "approval_1",
      decision: { allowed: true, reason: "Approved in test" },
    });
  });

  it("denies dangerous requests unless explicitly enabled", () => {
    const events = new EventBus();
    attachAutoApprover(events, { reason: "Approved in test" });

    let decision: unknown;
    events.on("approval:decision", (payload) => {
      decision = payload;
    });

    events.emit("approval:request", {
      id: "approval_2",
      operation: "mcp server tool",
      level: "dangerous",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(decision).toEqual({
      requestId: "approval_2",
      decision: {
        allowed: false,
        reason:
          "Dangerous or external-tool operation requires explicit approval. Re-run with --allow-dangerous if you trust this task.",
      },
    });
  });

  it("denies MCP requests unless explicitly enabled", () => {
    const events = new EventBus();
    attachAutoApprover(events, { reason: "Approved in test" });

    let decision: unknown;
    events.on("approval:decision", (payload) => {
      decision = payload;
    });

    events.emit("approval:request", {
      id: "approval_mcp",
      operation: "mcp server tool",
      level: "mcp",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(decision).toEqual({
      requestId: "approval_mcp",
      decision: {
        allowed: false,
        reason:
          "Dangerous or external-tool operation requires explicit approval. Re-run with --allow-dangerous if you trust this task.",
      },
    });
  });

  it("approves dangerous requests when explicitly enabled", () => {
    const events = new EventBus();
    attachAutoApprover(events, { reason: "Approved in test", allowDangerous: true });

    let decision: unknown;
    events.on("approval:decision", (payload) => {
      decision = payload;
    });

    events.emit("approval:request", {
      id: "approval_3",
      operation: "mcp server tool",
      level: "dangerous",
      createdAt: "2026-01-01T00:00:00.000Z",
    });

    expect(decision).toEqual({
      requestId: "approval_3",
      decision: { allowed: true, reason: "Approved in test" },
    });
  });
});
