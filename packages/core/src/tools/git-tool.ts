import { Effect } from "effect";
import { z } from "zod";
import { ToolExecutionError } from "../errors.js";
import { execFileAsync } from "./process.js";
import { defineTool } from "./tool.js";

const GitOperationSchema = z.enum([
  "status",
  "diff",
  "add",
  "commit",
  "push",
  "pull",
  "branch",
  "checkout",
  "log",
]);

export const gitTool = defineTool({
  name: "git",
  description: "Run supported git operations with permission checks.",
  parameters: z.object({
    operation: GitOperationSchema,
    args: z.record(z.unknown()).default({}),
  }),
  execute: (args, context) =>
    Effect.tryPromise({
      try: async () => {
        const commandArgs = buildGitArgs(args.operation, args.args);
        const kind =
          args.operation === "push"
            ? "dangerous"
            : args.operation === "status" || args.operation === "diff" || args.operation === "log"
              ? "read"
              : "git_local";
        await context.permissions.ensure({
          operation: `git ${commandArgs.join(" ")}`,
          kind,
          path: context.worktree,
          details: { operation: args.operation },
        });
        const result = await execFileAsync("git", commandArgs, {
          cwd: context.worktree,
          timeoutMs: 120_000,
          signal: context.abortSignal,
        });
        if (result.exitCode !== 0) {
          throw new Error(result.stderr || `git exited with ${result.exitCode}`);
        }
        context.logActivity({
          type: "git",
          message: `git ${args.operation}`,
          metadata: { operation: args.operation },
        });
        return result.stdout || result.stderr || `git ${args.operation} completed`;
      },
      catch: (error) => new ToolExecutionError("Failed to execute git operation", error),
    }),
});

function buildGitArgs(
  operation: z.infer<typeof GitOperationSchema>,
  args: Record<string, unknown>,
): string[] {
  switch (operation) {
    case "status":
      return ["status", "--short", "--branch"];
    case "diff":
      return ["diff", ...(typeof args.cached === "boolean" && args.cached ? ["--cached"] : [])];
    case "add": {
      const files = Array.isArray(args.files) ? args.files.map(String) : [String(args.file ?? ".")];
      return ["add", ...files];
    }
    case "commit": {
      const message = String(args.message ?? "");
      if (!message.trim()) throw new Error("git commit requires args.message");
      return ["commit", "-m", message];
    }
    case "push":
      return ["push", String(args.remote ?? "origin"), String(args.branch ?? "HEAD")];
    case "pull":
      return ["pull", String(args.remote ?? "origin"), String(args.branch ?? "")].filter(Boolean);
    case "branch":
      return args.name ? ["branch", String(args.name)] : ["branch", "--show-current"];
    case "checkout": {
      const branch = String(args.branch ?? "");
      if (!branch.trim()) throw new Error("git checkout requires args.branch");
      return ["checkout", branch];
    }
    case "log":
      return ["log", "--oneline", "-n", String(args.limit ?? 20)];
  }
}
