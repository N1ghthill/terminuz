import { spawn } from "node:child_process";
import { URL } from "node:url";
import { execFileAsync } from "../tools/process.js";

export interface GitHubCliAuthOptions {
  cwd: string;
  enterpriseUrl?: string;
  scopes?: string[];
  signal?: AbortSignal;
  onOutput?: (chunk: string) => void;
}

export async function readGitHubCliToken(options: GitHubCliAuthOptions): Promise<string> {
  const hostname = githubHostnameFromEnterpriseUrl(options.enterpriseUrl);
  const result = await execFileAsync("gh", ["auth", "token", "--hostname", hostname], {
    cwd: options.cwd,
    timeoutMs: 10_000,
    signal: options.signal,
  });
  if (result.exitCode !== 0) {
    throw new Error(
      result.stderr.trim() || result.stdout.trim() || "GitHub CLI is not authenticated.",
    );
  }
  const token = result.stdout.trim();
  if (!token) {
    throw new Error("GitHub CLI did not return an authentication token.");
  }
  return token;
}

export async function loginWithGitHubCli(options: GitHubCliAuthOptions): Promise<string> {
  try {
    if (await hasValidGitHubCliAuth(options)) {
      const token = await readGitHubCliToken(options);
      options.onOutput?.("GitHub CLI is already authenticated; importing token.\n");
      return token;
    }
  } catch {
    // Continue to browser login when gh is installed but no account is authenticated.
  }
  options.onOutput?.("GitHub CLI authentication missing or invalid; opening browser login.\n");

  const hostname = githubHostnameFromEnterpriseUrl(options.enterpriseUrl);
  const args = [
    "auth",
    "login",
    "--hostname",
    hostname,
    "--web",
    "--git-protocol",
    "https",
    "--skip-ssh-key",
  ];
  if (options.scopes && options.scopes.length > 0) {
    args.push("--scopes", options.scopes.join(","));
  }

  const result = await runStreamingCommand("gh", args, options);
  if (result.exitCode !== 0) {
    const output = `${result.stderr}\n${result.stdout}`.trim();
    throw new Error(output || "GitHub CLI login failed.");
  }
  return readGitHubCliToken(options);
}

async function hasValidGitHubCliAuth(options: GitHubCliAuthOptions): Promise<boolean> {
  const hostname = githubHostnameFromEnterpriseUrl(options.enterpriseUrl);
  const result = await execFileAsync("gh", ["auth", "status", "--hostname", hostname], {
    cwd: options.cwd,
    timeoutMs: 10_000,
    signal: options.signal,
  });
  return result.exitCode === 0;
}

export function githubHostnameFromEnterpriseUrl(enterpriseUrl?: string): string {
  if (!enterpriseUrl) return "github.com";
  try {
    return new URL(enterpriseUrl).hostname;
  } catch {
    return enterpriseUrl.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  }
}

function runStreamingCommand(
  command: string,
  args: string[],
  options: GitHubCliAuthOptions,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, FORCE_COLOR: "0" },
      signal: options.signal,
    });
    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      const value = String(chunk);
      stdout += value;
      options.onOutput?.(value);
    });
    child.stderr?.on("data", (chunk) => {
      const value = String(chunk);
      stderr += value;
      options.onOutput?.(value);
    });
    child.on("error", (error) => {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            "GitHub CLI não encontrado.\n\n" +
              "Opções para fazer login:\n" +
              "1. Instale o GitHub CLI: https://cli.github.com\n" +
              "2. Ou configure um OAuth App:\n" +
              "   terminuz config set github.oauthClientId SEU_CLIENT_ID",
          ),
        );
        return;
      }
      reject(error);
    });
    child.on("close", (exitCode) => {
      resolve({ stdout, stderr, exitCode });
    });
  });
}
