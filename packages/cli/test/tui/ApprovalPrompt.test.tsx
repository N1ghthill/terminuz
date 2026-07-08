import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup } from "ink-testing-library";
import type { ApprovalRequest } from "@deepcode/core";
import {
  ApprovalPrompt,
  formatApprovalOperationLabel,
} from "../../src/tui/ui/components/ApprovalPrompt.js";

const strip = (s: string | undefined) => (s ?? "").replace(/\x1b\[[0-9;]*[mGKHFJ]/g, "");

afterEach(() => cleanup());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRequest(overrides: any = {}): ApprovalRequest {
  return {
    id: "req-1",
    operation: "write_file",
    level: "normal",
    createdAt: new Date().toISOString(),
    path: "/tmp/foo.ts",
    ...overrides,
  } as ApprovalRequest;
}

// ── formatApprovalOperationLabel ──────────────────────────────────────────────

describe("formatApprovalOperationLabel", () => {
  const cases: Array<[string, string]> = [
    ["write_file", "write file"],
    ["edit_file", "edit file"],
    ["read_file", "read file"],
    ["bash", "run shell command"],
    ["shell", "run shell command"],
    ["git", "run git command"],
    ["fetch_web", "access URL"],
    ["search_text", "search files"],
    ["list_dir", "list directory"],
    ["analyze_code", "analyze code"],
    ["mcp github create_issue", "MCP tool"],
  ];

  it.each(cases)("maps %s → %s", (op, expected) => {
    const req = makeRequest({ operation: op });
    expect(formatApprovalOperationLabel(req)).toBe(expected);
  });

  it("falls back to operation with underscores replaced for unknown ops", () => {
    const req = makeRequest({ operation: "custom_op_xyz" });
    expect(formatApprovalOperationLabel(req)).toBe("custom op xyz");
  });

  it("returns operation as-is when no underscores", () => {
    const req = makeRequest({ operation: "unknown" });
    expect(formatApprovalOperationLabel(req)).toBe("unknown");
  });
});

// ── ApprovalPrompt rendering ──────────────────────────────────────────────────

describe("ApprovalPrompt", () => {
  it("renders nothing when request is undefined", () => {
    const { lastFrame } = render(<ApprovalPrompt />);
    expect(strip(lastFrame())).toBe("");
  });

  it("renders the operation label", () => {
    const { lastFrame } = render(
      <ApprovalPrompt request={makeRequest({ operation: "write_file" })} />,
    );
    expect(strip(lastFrame())).toContain("write file");
  });

  it("renders the permission level", () => {
    const { lastFrame } = render(
      <ApprovalPrompt request={makeRequest({ operation: "bash", level: "dangerous" })} />,
    );
    expect(strip(lastFrame())).toContain("[dangerous]");
  });

  it("renders the file path", () => {
    const { lastFrame } = render(
      <ApprovalPrompt request={makeRequest({ path: "/src/index.ts" })} />,
    );
    expect(strip(lastFrame())).toContain("/src/index.ts");
  });

  it("identifies the subagent that requested approval", () => {
    const { lastFrame } = render(
      <ApprovalPrompt
        request={makeRequest({
          origin: {
            sessionId: "child-session",
            taskId: "task-1",
            subagent: true,
            subagentType: "code-reviewer",
          },
        })}
      />,
    );
    expect(strip(lastFrame())).toContain("Requested by subagent code-reviewer");
  });

  it("renders shell command preview with $ prefix", () => {
    const req = makeRequest({
      operation: "bash",
      preview: { type: "shell_command", command: "git", args: ["status"] },
    });
    const { lastFrame } = render(<ApprovalPrompt request={req} />);
    expect(strip(lastFrame())).toContain("$ git status");
  });

  it("renders shell command preview without args", () => {
    const req = makeRequest({
      operation: "bash",
      preview: { type: "shell_command", command: "ls", args: [] },
    });
    const { lastFrame } = render(<ApprovalPrompt request={req} />);
    expect(strip(lastFrame())).toContain("$ ls");
  });

  it("renders MCP approval details without shell-style command preview", () => {
    const req = makeRequest({
      operation: "mcp github create_issue",
      level: "mcp",
      details: {
        server: "github",
        tool: "create_issue",
        arguments: { title: "Bug", body: "Details" },
      },
      preview: { type: "shell_command", command: "mcp", args: ["github", "create_issue"] },
    });
    const { lastFrame } = render(<ApprovalPrompt request={req} />);
    const out = strip(lastFrame());

    expect(out).toContain("MCP tool");
    expect(out).toContain("[mcp]");
    expect(out).toContain("Server: github");
    expect(out).toContain("Tool: create_issue");
    expect(out).toContain("Args:");
    expect(out).not.toContain("$ mcp github create_issue");
  });

  it("renders diff with before/after headers", () => {
    const req = makeRequest({
      operation: "edit_file",
      diff: { before: "old line", after: "new line", filePath: "/tmp/foo.ts" },
    });
    const { lastFrame } = render(<ApprovalPrompt request={req} />);
    const out = strip(lastFrame());
    expect(out).toContain("before");
    expect(out).toContain("after");
    expect(out).toContain("old line");
    expect(out).toContain("new line");
  });

  it("renders diff lines with − and + prefixes", () => {
    const req = makeRequest({
      operation: "edit_file",
      diff: { before: "removed", after: "added", filePath: "/tmp/foo.ts" },
    });
    const { lastFrame } = render(<ApprovalPrompt request={req} />);
    const out = strip(lastFrame());
    expect(out).toContain("− removed");
    expect(out).toContain("+ added");
  });

  it("renders preview content for write_file (single-content mode)", () => {
    const req = makeRequest({
      operation: "write_file",
      preview: { type: "file_write", content: "const x = 1;" },
    });
    const { lastFrame } = render(<ApprovalPrompt request={req} />);
    expect(strip(lastFrame())).toContain("const x = 1;");
  });

  it("shows queue indicator when queueLength > 1", () => {
    const { lastFrame } = render(<ApprovalPrompt request={makeRequest()} queueLength={3} />);
    expect(strip(lastFrame())).toContain("1 of 3");
  });

  it("does not show queue indicator when queueLength is 1", () => {
    const { lastFrame } = render(<ApprovalPrompt request={makeRequest()} queueLength={1} />);
    expect(strip(lastFrame())).not.toContain("of 1");
  });

  it("renders the action hint footer", () => {
    const { lastFrame } = render(<ApprovalPrompt request={makeRequest()} />);
    const out = strip(lastFrame());
    expect(out).toContain("once");
    expect(out).toContain("deny");
  });

  it("shows truncation indicator when diff exceeds max lines", () => {
    const manyLines = Array.from({ length: 10 }, (_, i) => `line${i}`).join("\n");
    const req = makeRequest({
      operation: "edit_file",
      diff: { before: manyLines, after: manyLines, filePath: "/tmp/foo.ts" },
    });
    const { lastFrame } = render(<ApprovalPrompt request={req} />);
    expect(strip(lastFrame())).toContain("…");
  });

  it("shows truncation indicator when single content exceeds max lines", () => {
    const manyLines = Array.from({ length: 10 }, (_, i) => `line${i}`).join("\n");
    const req = makeRequest({
      operation: "write_file",
      preview: { type: "file_write", content: manyLines },
    });
    const { lastFrame } = render(<ApprovalPrompt request={req} />);
    expect(strip(lastFrame())).toContain("…");
  });
});
