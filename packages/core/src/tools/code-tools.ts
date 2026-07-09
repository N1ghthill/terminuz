import { readFile } from "node:fs/promises";
import path from "node:path";
import { Effect } from "effect";
import { z } from "zod";
import { ToolExecutionError } from "../errors.js";
import { execFileAsync } from "./process.js";
import { defineTool } from "./tool.js";

export const analyzeCodeTool = defineTool({
  name: "analyze_code",
  description: "Analyze source code structure using lightweight language-aware heuristics.",
  parameters: z.object({
    path: z.string(),
  }),
  execute: (args, context) =>
    Effect.tryPromise({
      try: async () => {
        const filePath = await context.pathSecurity.normalize(args.path, { enforceAccess: false });
        await context.permissions.ensure({
          operation: "analyze_code",
          kind: "read",
          path: filePath,
        });
        const content = await readFile(filePath, "utf8");
        const declarations = content
          .split(/\r?\n/)
          .map((line, index) => ({ line: index + 1, text: line.trim() }))
          .filter(({ text }) =>
            /^(export\s+)?(class|interface|type|function|const|let|var|def|func)\s+/.test(text),
          );
        const result = {
          file: filePath,
          extension: path.extname(filePath),
          lines: content.split(/\r?\n/).length,
          declarations,
        };
        return JSON.stringify(result, null, 2);
      },
      catch: (error) => new ToolExecutionError("Failed to analyze code", error),
    }),
});

export const lintTool = defineTool({
  name: "lint",
  description: "Run project lint script. Uses package manager scripts when present.",
  parameters: z.object({
    fix: z.boolean().default(false),
  }),
  execute: (args, context) =>
    Effect.tryPromise({
      try: async () => {
        const command = args.fix ? "pnpm lint -- --fix" : "pnpm lint";
        await context.permissions.ensure({
          operation: command,
          kind: "shell",
          path: context.worktree,
        });
        const result = await execFileAsync("pnpm", args.fix ? ["lint", "--", "--fix"] : ["lint"], {
          cwd: context.worktree,
          timeoutMs: 120_000,
          signal: context.abortSignal,
        });
        if (result.exitCode !== 0) throw new Error(result.stdout + result.stderr);
        return result.stdout || "Lint completed";
      },
      catch: (error) => new ToolExecutionError("Failed to run lint", error),
    }),
});

export const testTool = defineTool({
  name: "test",
  description: "Run project tests with pnpm.",
  parameters: z.object({
    pattern: z.string().optional(),
  }),
  execute: (args, context) =>
    Effect.tryPromise({
      try: async () => {
        const commandArgs = args.pattern ? ["test", "--", args.pattern] : ["test"];
        await context.permissions.ensure({
          operation: "pnpm test",
          kind: "shell",
          path: context.worktree,
        });
        const result = await execFileAsync("pnpm", commandArgs, {
          cwd: context.worktree,
          timeoutMs: 180_000,
          signal: context.abortSignal,
        });
        if (result.exitCode !== 0) throw new Error(result.stdout + result.stderr);
        return result.stdout || "Tests completed";
      },
      catch: (error) => new ToolExecutionError("Failed to run tests", error),
    }),
});
