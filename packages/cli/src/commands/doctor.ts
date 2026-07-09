import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  AuditLogger,
  editFileTool,
  EventBus,
  execFileAsync,
  GitHubClient,
  listDirTool,
  PathSecurity,
  PermissionGateway,
  readFileTool,
  redactText,
  runToolEffect,
  type ProviderValidationResult,
  writeFileTool,
} from "@terminuz/core";
import { resolveUsableProviderTarget } from "@terminuz/shared";
import { createRuntime, type TerminuzRuntime } from "../runtime.js";
import { writeStdoutLine } from "../stream-flush.js";

interface DoctorCheck {
  name: string;
  ok: boolean;
  detail: string;
  fatal?: boolean;
}

function formatModelCatalogSummary(
  result: Pick<ProviderValidationResult, "modelCatalogStatus" | "modelCount">,
): string {
  if (result.modelCatalogStatus === "checked") {
    return `${result.modelCount} models visible`;
  }
  if (result.modelCatalogStatus === "skipped") {
    return "model catalog skipped";
  }
  return "model catalog unavailable";
}

function formatModelCheckDetail(result: ProviderValidationResult): string {
  if (result.modelCatalogStatus === "checked") {
    return result.modelFound
      ? result.model
      : `${result.model} (not present in provider model catalog)`;
  }

  return `${result.model} (model catalog ${result.modelCatalogStatus})`;
}

export async function doctorCommand(options: { cwd: string; config?: string }): Promise<void> {
  const runtime = await createRuntime({
    cwd: options.cwd,
    configPath: options.config,
    interactive: false,
  });
  const checks: DoctorCheck[] = [];

  checks.push(await commandCheck("git", ["--version"]));
  checks.push(await commandCheck("rg", ["--version"]));
  checks.push(await localToolSmokeCheck(runtime, options.cwd));
  checks.push(...(await providerChecks(runtime)));
  checks.push(await githubCheck(runtime.config.github, options.cwd));
  checks.push(await runtimeLogCheck(runtime));

  for (const server of runtime.config.lsp.servers) {
    checks.push(await lspCommandCheck(server.command));
  }

  for (const check of checks) {
    const status = check.ok ? "ok" : check.fatal === false ? "warn" : "fail";
    await writeStdoutLine(`${status} ${check.name}: ${check.detail}`);
  }

  const failed = checks.filter((check) => !check.ok && check.fatal !== false);
  if (failed.length > 0) {
    const recommendations = doctorRecommendations(failed);
    if (recommendations.length > 0) {
      await writeStdoutLine("");
      await writeStdoutLine("Next steps:");
      for (const recommendation of recommendations) {
        await writeStdoutLine(`  ${recommendation}`);
      }
    }
    process.exitCode = 1;
  }
}

function doctorRecommendations(failed: DoctorCheck[]): string[] {
  const recommendations: string[] = [];
  const providerFailed = failed.some(
    (check) => check.name === "provider" && check.detail.includes("credentials"),
  );
  const modelFailed = failed.some(
    (check) => check.name === "model" && check.detail.includes("missing configured model"),
  );

  if (providerFailed) {
    recommendations.push(
      "Set a provider API key with /provider, config set, or an environment variable.",
    );
  }
  if (modelFailed) {
    recommendations.push("Choose a model with /model or set defaultModels.<provider>.");
  }
  if (providerFailed || modelFailed) {
    recommendations.push("Run `terminuz` and use /setup for guided configuration.");
  }

  return recommendations;
}

async function providerChecks(runtime: TerminuzRuntime): Promise<DoctorCheck[]> {
  const target = resolveUsableProviderTarget(runtime.config, [runtime.config.defaultProvider]);
  if (!target.hasCredentials) {
    return [
      { name: "provider", ok: false, detail: "no provider credentials configured" },
      {
        name: "model",
        ok: Boolean(target.model),
        detail: target.model ?? `missing configured model for ${target.provider}`,
      },
    ];
  }

  if (!target.model) {
    try {
      const provider = runtime.providers.get(target.provider);
      const started = Date.now();
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15_000);
      let modelsVisible = 0;
      try {
        const models = await provider.listModels({ signal: controller.signal });
        modelsVisible = models.length;
      } finally {
        clearTimeout(timeout);
      }

      return [
        {
          name: "provider",
          ok: true,
          detail: `${target.provider} authenticated; ${modelsVisible} models visible (${Date.now() - started}ms)`,
        },
        {
          name: "model",
          ok: false,
          detail: `missing configured model for ${target.provider}`,
        },
      ];
    } catch (error) {
      return [
        {
          name: "provider",
          ok: false,
          detail: redactText(describeError(error)),
        },
        {
          name: "model",
          ok: false,
          detail: `missing configured model for ${target.provider}`,
        },
      ];
    }
  }

  try {
    const result = await runtime.providers.validateProviderModel(target.provider, {
      model: target.model,
      timeoutMs: 15_000,
    });
    return [
      {
        name: "provider",
        ok: true,
        detail: `${target.provider} authenticated; ${formatModelCatalogSummary(result)}; model call ok (${result.latencyMs}ms)`,
      },
      {
        name: "model",
        ok: result.modelFound,
        detail: formatModelCheckDetail(result),
      },
    ];
  } catch (error) {
    return [
      {
        name: "provider",
        ok: false,
        detail: redactText(error instanceof Error ? error.message : String(error)),
      },
      {
        name: "model",
        ok: false,
        detail: target.model
          ? `failed to validate configured model ${target.model}`
          : `missing configured model for ${target.provider}`,
      },
    ];
  }
}

async function runtimeLogCheck(runtime: TerminuzRuntime): Promise<DoctorCheck> {
  const stats = await runtime.logger.stats();
  return {
    name: "runtime-log",
    ok: true,
    detail: stats.exists
      ? `${stats.path} (${formatBytes(stats.sizeBytes)})`
      : `${stats.path} (not created yet)`,
  };
}

async function commandCheck(name: string, args: string[], command = name): Promise<DoctorCheck> {
  try {
    const result = await execFileAsync(command, args, { cwd: process.cwd(), timeoutMs: 10_000 });
    if (result.exitCode === 0) {
      return {
        name,
        ok: true,
        detail: firstLine(result.stdout || result.stderr) || "available",
      };
    }
    return {
      name,
      ok: false,
      detail: firstLine(result.stderr || result.stdout) || `exit ${result.exitCode}`,
    };
  } catch (error) {
    return { name, ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

async function lspCommandCheck(command: string): Promise<DoctorCheck> {
  const attempts: string[][] = [["--version"], ["-V"], ["version"], ["--help"]];

  let lastFailure: DoctorCheck | undefined;
  for (const args of attempts) {
    const check = await commandCheck(`lsp:${command}`, args, command);
    if (check.ok) return check;
    if (check.detail.includes("ENOENT")) return check;
    lastFailure = check;
  }

  return (
    lastFailure ?? {
      name: `lsp:${command}`,
      ok: false,
      detail: "unable to execute language server command",
    }
  );
}

async function githubCheck(
  config: {
    token?: string;
    enterpriseUrl?: string;
  },
  cwd: string,
): Promise<DoctorCheck> {
  if (!config.token) {
    return {
      name: "github",
      ok: false,
      fatal: false,
      detail: "token missing (optional; required only for GitHub commands)",
    };
  }
  try {
    const user = await new GitHubClient({
      token: config.token,
      enterpriseUrl: config.enterpriseUrl,
      worktree: cwd,
    }).getAuthenticatedUser();
    return { name: "github", ok: true, detail: `authenticated as ${user.login}` };
  } catch (error) {
    return {
      name: "github",
      ok: false,
      detail: redactText(error instanceof Error ? error.message : String(error)),
    };
  }
}

async function localToolSmokeCheck(runtime: TerminuzRuntime, cwd: string): Promise<DoctorCheck> {
  const worktree = path.resolve(cwd);
  const smokeDir = await mkdtemp(path.join(tmpdir(), "terminuz-doctor-"));
  const smokeFile = path.join(smokeDir, "roundtrip.txt");
  const smokeConfig = {
    ...runtime.config,
    permissions: {
      ...runtime.config.permissions,
      read: "allow" as const,
      write: "allow" as const,
    },
    paths: {
      ...runtime.config.paths,
      whitelist: [...runtime.config.paths.whitelist, `${smokeDir}/**`],
    },
  };
  const pathSecurity = new PathSecurity(worktree, smokeConfig.paths);
  const permissions = new PermissionGateway(
    smokeConfig,
    pathSecurity,
    new AuditLogger(worktree),
    new EventBus(),
    false,
  );
  const context = {
    sessionId: "doctor-smoke",
    messageId: "doctor-smoke",
    worktree,
    directory: worktree,
    abortSignal: new AbortController().signal,
    config: smokeConfig,
    agentMode: "build" as const,
    cache: runtime.cache,
    permissions,
    pathSecurity,
    subagentDepth: 0,
    logActivity: () => {},
  };

  try {
    await runToolEffect(
      writeFileTool.execute({ path: smokeFile, content: "status=before\n" }, context),
    );
    const listing = await runToolEffect(listDirTool.execute({ path: smokeDir }, context));
    if (!listing.includes("roundtrip.txt")) {
      throw new Error("list_dir did not return the smoke-test file");
    }

    const before = await runToolEffect(readFileTool.execute({ path: smokeFile }, context));
    if (!before.includes("status=before")) {
      throw new Error("read_file did not return the initial smoke-test content");
    }

    await runToolEffect(
      editFileTool.execute(
        { path: smokeFile, oldString: "status=before", newString: "status=after" },
        context,
      ),
    );

    const after = await runToolEffect(readFileTool.execute({ path: smokeFile }, context));
    if (!after.includes("status=after")) {
      throw new Error("edit_file did not persist the updated smoke-test content");
    }

    return {
      name: "smoke:tools",
      ok: true,
      detail: `write_file, list_dir, read_file, edit_file ok (${path.basename(smokeFile)} in temp dir)`,
    };
  } catch (error) {
    return {
      name: "smoke:tools",
      ok: false,
      detail: redactText(describeError(error)),
    };
  } finally {
    await rm(smokeDir, { recursive: true, force: true });
  }
}

function firstLine(input: string): string {
  return input.split(/\r?\n/).find(Boolean)?.trim() ?? "";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function describeError(error: unknown): string {
  const messages: string[] = [];
  let current: unknown = error;
  let depth = 0;

  while (current && depth < 6) {
    if (current instanceof Error) {
      messages.push(current.message);
      current = "cause" in current ? current.cause : undefined;
      depth += 1;
      continue;
    }

    if (typeof current === "object" && current !== null && "message" in current) {
      const message = (current as { message?: unknown }).message;
      if (typeof message === "string") {
        messages.push(message);
      }
      current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
      depth += 1;
      continue;
    }

    messages.push(String(current));
    break;
  }

  return messages.filter(Boolean).join(": ") || "Unknown error";
}
