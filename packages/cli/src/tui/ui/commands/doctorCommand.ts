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
      ? check("Ambiente", "Node.js", "pass", `v${nodeVersion}`)
      : check("Ambiente", "Node.js", "fail", `v${nodeVersion} — requer ≥ 22`, "Instale Node.js 22 ou superior"),
  );

  // Working directory
  try {
    fs.accessSync(cwd, fs.constants.R_OK | fs.constants.W_OK);
    results.push(check("Ambiente", "Diretório de trabalho", "pass", "acessível e gravável"));
  } catch {
    results.push(check("Ambiente", "Diretório de trabalho", "fail", "sem acesso de leitura/escrita", cwd));
  }

  // Git repo
  const gitDir = path.join(cwd, ".git");
  results.push(
    fs.existsSync(gitDir)
      ? check("Workspace", "Repositório Git", "pass", "encontrado")
      : check("Workspace", "Repositório Git", "warn", "não encontrado", "Algumas funcionalidades requerem um repositório git"),
  );

  // DeepCode config dir
  const deepcodeDir = path.join(cwd, ".deepcode");
  results.push(
    fs.existsSync(deepcodeDir)
      ? check("Workspace", "Config DeepCode", "pass", ".deepcode encontrado")
      : check("Workspace", "Config DeepCode", "warn", ".deepcode ausente", "Execute deepcode para criar"),
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
      ? check("Runtime", "Modelo", "pass", diagnostics.model)
      : check("Runtime", "Modelo", "warn", "não configurado", `Execute /model para configurar um modelo para ${diagnostics.provider}`),
  );

  // API key
  results.push(
    diagnostics.hasApiKey
      ? check("Runtime", "API Key", "pass", "configurada")
      : check("Runtime", "API Key", "fail", "não configurada", `Defina a chave em /provider ou na configuração`),
  );

  // MCP
  if (diagnostics.mcpTotal > 0) {
    const allConnected = diagnostics.mcpConnected === diagnostics.mcpTotal;
    results.push(
      allConnected
        ? check("Runtime", "MCP", "pass", `${diagnostics.mcpConnected}/${diagnostics.mcpTotal} conectados`)
        : check("Runtime", "MCP", "warn", `${diagnostics.mcpConnected}/${diagnostics.mcpTotal} conectados`, "Alguns servidores MCP não estão disponíveis"),
    );
  }

  // Agent mode
  results.push(check("Runtime", "Modo", "pass", diagnostics.agentMode));

  return results;
}

export const doctorCommand: SlashCommand = {
  name: "doctor",
  description: "Diagnóstico de ambiente e configuração do DeepCode",
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
