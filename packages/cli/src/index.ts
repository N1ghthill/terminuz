import { render } from "ink";
import React from "react";
import { Command } from "commander";
import { redactText } from "@deepcode/core";
import type { AgentMode } from "@deepcode/shared";
import { cacheClearCommand } from "./commands/cache.js";
import {
  configGetCommand,
  configPathCommand,
  configSetCommand,
  configShowCommand,
  configUnsetCommand,
} from "./commands/config.js";
import { doctorCommand } from "./commands/doctor.js";
import { initCommand } from "./commands/init.js";
import { logsExportCommand, logsRecentCommand } from "./commands/logs.js";
import {
  createPrCommand,
  githubLoginCommand,
  githubWhoamiCommand,
  listIssuesCommand,
  listPrsCommand,
  mergePrCommand,
  reviewPrCommand,
  solveIssueCommand,
} from "./commands/github.js";
import { runCommand } from "./commands/run.js";
import { subagentsRunCommand } from "./commands/subagents.js";
import { projectsCommand } from "./commands/projects.js";
import { reviewCommand } from "./commands/review.js";
import { sessionsClearCommand, sessionsCommand } from "./commands/sessions.js";
import { updateCommand } from "./commands/update.js";
import { uninstallCommand } from "./commands/uninstall.js";
import {
  flushStandardStreams,
  writeStderrLine,
  writeStderrSync,
  writeStdoutSync,
} from "./stream-flush.js";
import { App } from "./tui/App.js";
import { VERSION } from "./version.js";

export function createProgram(): Command {
  const program = new Command();
  program.configureOutput({
    writeOut: writeStdoutSync,
    writeErr: writeStderrSync,
  });
  program
    .name("deepcode")
    .description("AI coding agent for the terminal")
    .version(VERSION)
    .option("-C, --cwd <path>", "working directory", process.cwd())
    .option("--config <path>", "config file path");

  program
    .command("init")
    .description("create .deepcode/config.json")
    .action(async () => {
      await initCommand(program.opts().cwd);
    });

  program
    .command("run")
    .description("run one non-interactive task")
    .argument("<prompt...>", "task prompt")
    .option("--mode <mode>", "agent mode: plan or build")
    .option("--provider <provider>", "provider override for this run")
    .option("--model <model>", "model override for this run (or <provider>/<model>)")
    .option("-y, --yes", "approve permission requests for this run")
    .action(
      async (
        prompt: string[],
        options: { yes?: boolean; mode?: AgentMode; provider?: string; model?: string },
      ) => {
        await runCommand(prompt.join(" "), {
          cwd: program.opts().cwd,
          config: program.opts().config,
          yes: options.yes,
          mode: options.mode,
          provider: options.provider,
          model: options.model,
        });
      },
    );

  program
    .command("review")
    .description("AI code review of local git changes")
    .argument("[ref]", "git ref to diff against (e.g. HEAD~3, main); defaults to HEAD")
    .option("--staged", "review only staged changes (git diff --cached)")
    .option("--file <path>", "limit review to a specific file")
    .option(
      "--focus <area>",
      "focus area: security, performance, correctness, style; repeat for multiple",
      (val: string, acc: string[]) => {
        acc.push(val);
        return acc;
      },
      [] as string[],
    )
    .option("--provider <provider>", "provider override")
    .option("--model <model>", "model override")
    .option("-y, --yes", "approve permission requests")
    .action(
      async (
        ref: string | undefined,
        options: {
          staged?: boolean;
          file?: string;
          focus: string[];
          provider?: string;
          model?: string;
          yes?: boolean;
        },
      ) => {
        await reviewCommand({
          cwd: program.opts().cwd,
          config: program.opts().config,
          ref,
          staged: options.staged,
          file: options.file,
          focus: options.focus,
          provider: options.provider,
          model: options.model,
          yes: options.yes,
        });
      },
    );

  program
    .command("projects")
    .description(
      'interactive project browser — Enter/c prints selected path (add shell fn: dc() { cd "$(deepcode projects)"; })',
    )
    .option("--path <path>", "root path to scan for git repos (default: $HOME)")
    .action(async (options: { path?: string }) => {
      await projectsCommand({
        cwd: options.path ?? process.env["HOME"] ?? program.opts().cwd,
      });
    });

  const sessions = program.command("sessions").description("manage persisted sessions");

  sessions
    .command("list", { isDefault: true })
    .description(
      'interactive session picker — Enter prints session ID (use with: deepcode chat --resume "$(deepcode sessions)")',
    )
    .action(async () => {
      await sessionsCommand({ cwd: program.opts().cwd });
    });

  sessions
    .command("clear")
    .description("delete persisted sessions")
    .option("--all", "delete all sessions regardless of age")
    .option(
      "--older-than <days>",
      "delete sessions older than N days (default: 30)",
      parsePositiveInt,
    )
    .action(async (options: { all?: boolean; olderThan?: number }) => {
      await sessionsClearCommand({
        cwd: program.opts().cwd,
        all: options.all,
        olderThanDays: options.olderThan,
      });
    });

  program
    .command("doctor")
    .description("validate local tools, provider config, GitHub token, and LSP servers")
    .action(async () => {
      await doctorCommand({ cwd: program.opts().cwd, config: program.opts().config });
    });

  program
    .command("update")
    .description("check for published updates")
    .action(async () => {
      await updateCommand();
    });

  program
    .command("uninstall")
    .description("remove all DeepCode data (sessions, caches) and print uninstall instructions")
    .option("--project", "also remove .deepcode/ config and cache in the current directory")
    .action(async (options: { project?: boolean }) => {
      await uninstallCommand({ cwd: program.opts().cwd, project: options.project });
    });

  const cache = program.command("cache").description("manage persistent tool cache");
  cache
    .command("clear")
    .description("clear .deepcode/cache")
    .action(async () => {
      await cacheClearCommand({ cwd: program.opts().cwd, config: program.opts().config });
    });

  const logs = program.command("logs").description("inspect DeepCode runtime logs");
  logs
    .command("recent", { isDefault: true })
    .description("print recent .deepcode/runtime.log entries")
    .option("-n, --lines <number>", "number of log entries to print", parsePositiveInt)
    .action(async (options: { lines?: number }) => {
      await logsRecentCommand({ cwd: program.opts().cwd, lines: options.lines });
    });
  logs
    .command("export")
    .description("export .deepcode/runtime.log to a file")
    .option("-o, --output <path>", "output path (default: .deepcode/exports/runtime-log-*.jsonl)")
    .action(async (options: { output?: string }) => {
      await logsExportCommand({ cwd: program.opts().cwd, output: options.output });
    });

  const config = program.command("config").description("view and edit .deepcode/config.json");
  config
    .command("path")
    .description("print the active config file path")
    .action(async () => {
      await configPathCommand({ cwd: program.opts().cwd, config: program.opts().config });
    });
  config
    .command("show")
    .description("print config as JSON with secrets masked")
    .option("--effective", "include environment variable overrides")
    .action(async (options: { effective?: boolean }) => {
      await configShowCommand({
        cwd: program.opts().cwd,
        config: program.opts().config,
        effective: options.effective,
      });
    });
  config
    .command("get")
    .description("print one config value with secrets masked")
    .argument("<key>", "dot-separated config key")
    .option("--effective", "include environment variable overrides")
    .action(async (key: string, options: { effective?: boolean }) => {
      await configGetCommand(key, {
        cwd: program.opts().cwd,
        config: program.opts().config,
        effective: options.effective,
      });
    });
  config
    .command("set")
    .description("set one config value")
    .argument("<key>", "dot-separated config key")
    .argument("<value>", "new value; arrays and objects must be JSON")
    .option("--json", "parse value as JSON")
    .action(async (key: string, value: string, options: { json?: boolean }) => {
      await configSetCommand(key, value, {
        cwd: program.opts().cwd,
        config: program.opts().config,
        json: options.json,
      });
    });
  config
    .command("unset")
    .description("remove one config value and fall back to schema defaults when applicable")
    .argument("<key>", "dot-separated config key")
    .action(async (key: string) => {
      await configUnsetCommand(key, { cwd: program.opts().cwd, config: program.opts().config });
    });

  const github = program.command("github").description("GitHub operations");
  github
    .command("login")
    .description("authorize GitHub with the real OAuth device flow")
    .option("--client-id <id>", "GitHub OAuth app client ID")
    .option("--no-browser", "print the verification URL without opening a browser")
    .option(
      "--scope <scope>",
      "OAuth scope to request; repeat for multiple scopes",
      collectOption,
      [],
    )
    .action(async (options: { clientId?: string; scope: string[]; browser?: boolean }) => {
      await githubLoginCommand({
        cwd: program.opts().cwd,
        config: program.opts().config,
        clientId: options.clientId,
        scopes: options.scope,
        openBrowser: options.browser !== false,
      });
    });
  github
    .command("whoami")
    .description("validate the configured GitHub token against the real GitHub API")
    .action(async () => {
      await githubWhoamiCommand({
        cwd: program.opts().cwd,
        config: program.opts().config,
      });
    });
  github
    .command("issues")
    .description("list repository issues")
    .option("--state <state>", "open, closed, or all", "open")
    .action(async (options: { state: "open" | "closed" | "all" }) => {
      await listIssuesCommand({
        cwd: program.opts().cwd,
        config: program.opts().config,
        state: options.state,
      });
    });

  const subagents = program.command("subagents").description("run real child agent sessions");
  subagents
    .command("run")
    .description("run multiple tasks in parallel subagent sessions")
    .requiredOption("--task <prompt>", "task prompt; repeat for multiple tasks", collectOption, [])
    .option("--concurrency <number>", "parallelism", parsePositiveInt)
    .option("-y, --yes", "approve permission requests for this run")
    .action(async (options: { task: string[]; concurrency?: number; yes?: boolean }) => {
      await subagentsRunCommand({
        cwd: program.opts().cwd,
        config: program.opts().config,
        tasks: options.task,
        concurrency: options.concurrency,
        yes: options.yes,
      });
    });
  github
    .command("prs")
    .description("list pull requests")
    .option("--state <state>", "open, closed, or all", "open")
    .action(async (options: { state: "open" | "closed" | "all" }) => {
      await listPrsCommand({
        cwd: program.opts().cwd,
        config: program.opts().config,
        state: options.state,
      });
    });
  github
    .command("merge")
    .description("merge a pull request")
    .argument("<number>", "PR number")
    .option("--method <method>", "merge method: merge, squash, or rebase", "merge")
    .option("--title <title>", "commit title for squash/merge")
    .action(
      async (
        number: string,
        options: { method?: "merge" | "squash" | "rebase"; title?: string },
      ) => {
        const prNumber = Number.parseInt(number, 10);
        if (!Number.isInteger(prNumber) || prNumber <= 0) {
          throw new Error(`Invalid PR number: ${number}`);
        }
        await mergePrCommand(prNumber, options, {
          cwd: program.opts().cwd,
          config: program.opts().config,
        });
      },
    );
  github
    .command("pr")
    .description("create a pull request")
    .requiredOption("--title <title>", "PR title")
    .requiredOption("--body <body>", "PR body")
    .requiredOption("--head <head>", "head branch")
    .option("--base <base>", "base branch", "main")
    .action(async (options: { title: string; body: string; head: string; base: string }) => {
      await createPrCommand(options, { cwd: program.opts().cwd, config: program.opts().config });
    });
  github
    .command("review")
    .description("AI code review of a pull request")
    .argument("<number>", "PR number")
    .option(
      "--focus <area>",
      "focus area: security, performance, correctness, style; repeat for multiple",
      collectOption,
      [],
    )
    .option("--provider <provider>", "provider override")
    .option("--model <model>", "model override")
    .action(
      async (number: string, options: { focus: string[]; provider?: string; model?: string }) => {
        const prNumber = Number.parseInt(number, 10);
        if (!Number.isInteger(prNumber) || prNumber <= 0) {
          throw new Error(`Invalid PR number: ${number}`);
        }
        await reviewPrCommand(prNumber, {
          cwd: program.opts().cwd,
          config: program.opts().config,
          focus: options.focus,
          provider: options.provider,
          model: options.model,
        });
      },
    );
  github
    .command("solve")
    .description("solve a GitHub issue end-to-end with branch, commit, push, and PR")
    .argument("<number>", "issue number")
    .option("--base <base>", "base branch", "main")
    .option("-y, --yes", "approve commit/push/PR workflow")
    .action(async (number: string, options: { base?: string; yes?: boolean }) => {
      const issueNumber = Number.parseInt(number, 10);
      if (!Number.isInteger(issueNumber) || issueNumber <= 0) {
        throw new Error(`Invalid issue number: ${number}`);
      }
      await solveIssueCommand(issueNumber, {
        cwd: program.opts().cwd,
        config: program.opts().config,
        base: options.base,
        yes: options.yes,
      });
    });

  program
    .command("chat", { isDefault: true })
    .description("open the terminal UI")
    .option("--provider <provider>", "provider override for this chat session")
    .option("--model <model>", "model override for this chat session (or <provider>/<model>)")
    .option("--resume <id>", "resume a previous session by ID")
    .action((options: { provider?: string; model?: string; resume?: string }) => {
      render(
        React.createElement(App, {
          cwd: program.opts().cwd,
          config: program.opts().config,
          provider: options.provider,
          model: options.model,
          resumeSessionId: options.resume,
        }),
      );
    });

  return program;
}

export async function main(argv = process.argv): Promise<void> {
  try {
    await createProgram().parseAsync(argv);
  } catch (error) {
    await writeStderrLine(redactText(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  } finally {
    await flushStandardStreams();
  }
}

function collectOption(value: string, previous: string[]): string[] {
  return [...previous, value];
}

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected positive integer, got ${value}`);
  }
  return parsed;
}
