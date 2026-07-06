import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { CommandKind, type SlashCommand } from "./types.js";
import type { DoctorCheckResult, DoctorCheckStatus, HistoryItemWithoutId } from "../types.js";

function check(
  category: string,
  name: string,
  status: DoctorCheckStatus,
  message: string,
  detail?: string,
): DoctorCheckResult {
  return { category, name, status, message, detail };
}

function semverAtLeast(version: string, major: number): boolean {
  const [maj] = version.replace(/^v/, "").split(".").map(Number);
  return (maj ?? 0) >= major;
}

function runEnvironmentChecks(cwd: string): DoctorCheckResult[] {
  const results: DoctorCheckResult[] = [];

  // Node.js version
  const nodeVersion = process.versions.node ?? "0.0.0";
  results.push(
    semverAtLeast(nodeVersion, 22)
      ? check("Environment", "Node.js", "pass", `v${nodeVersion}`)
      : check("Environment", "Node.js", "fail", `v${nodeVersion} - requires >= 22`, "Install Node.js 22 or newer"),
  );

  // Working directory
  try {
    fs.accessSync(cwd, fs.constants.R_OK | fs.constants.W_OK);
    results.push(check("Environment", "Working directory", "pass", "readable and writable"));
  } catch {
    results.push(check("Environment", "Working directory", "fail", "missing read/write access", cwd));
  }

  // Git repo
  const gitDir = path.join(cwd, ".git");
  results.push(
    fs.existsSync(gitDir)
      ? check("Workspace", "Git repository", "pass", "found")
      : check("Workspace", "Git repository", "warn", "not found", "Some features require a git repository"),
  );

  // DeepCode config dir
  const deepcodeDir = path.join(cwd, ".deepcode");
  results.push(
    fs.existsSync(deepcodeDir)
      ? check("Workspace", "DeepCode config", "pass", ".deepcode found")
      : check("Workspace", "DeepCode config", "warn", ".deepcode missing", "Run deepcode init to create it"),
  );

  return results;
}

function runRuntimeChecks(
  diagnostics: { provider: string; model: string | undefined; hasApiKey: boolean; mcpConnected: number; mcpTotal: number; agentMode: string },
): DoctorCheckResult[] {
  const results: DoctorCheckResult[] = [];

  // Provider
  results.push(check("Runtime", "Provider", "pass", diagnostics.provider));

  // Model
  results.push(
    diagnostics.model
      ? check("Runtime", "Model", "pass", diagnostics.model)
      : check("Runtime", "Model", "warn", "not configured", `Run /model to choose a model for ${diagnostics.provider}`),
  );

  // API key
  results.push(
    diagnostics.hasApiKey
      ? check("Runtime", "API key", "pass", "configured")
      : check("Runtime", "API key", "fail", "not configured", "Save a key in /provider or set it in config"),
  );

  // MCP
  if (diagnostics.mcpTotal > 0) {
    const allConnected = diagnostics.mcpConnected === diagnostics.mcpTotal;
    results.push(
      allConnected
        ? check("Runtime", "MCP", "pass", `${diagnostics.mcpConnected}/${diagnostics.mcpTotal} connected`)
        : check("Runtime", "MCP", "warn", `${diagnostics.mcpConnected}/${diagnostics.mcpTotal} connected`, "Some MCP servers are unavailable"),
    );
  }

  // Agent mode
  results.push(check("Runtime", "Mode", "pass", diagnostics.agentMode));

  return results;
}

export const doctorCommand: SlashCommand = {
  name: "doctor",
  description: "Check local environment and DeepCode configuration",
  kind: CommandKind.BUILT_IN,
  supportedModes: ["interactive"] as const,
  action: (context) => {
    const cwd = context.ui.getCwd?.() ?? process.cwd();
    const diagnostics = context.ui.getRuntimeDiagnostics?.() ?? null;

    const checks: DoctorCheckResult[] = [
      ...runEnvironmentChecks(cwd),
      ...(diagnostics ? runRuntimeChecks(diagnostics) : []),
    ];

    const summary = {
      pass: checks.filter((c) => c.status === "pass").length,
      warn: checks.filter((c) => c.status === "warn").length,
      fail: checks.filter((c) => c.status === "fail").length,
    };

    context.ui.addItem(({ type: "doctor", checks, summary } as HistoryItemWithoutId), Date.now());
  },
};
