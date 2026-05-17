import {
  collectSecretValues,
  ConfigLoader,
  execFileAsync,
  GitHubClient,
  GitHubOAuthDeviceFlow,
  loginWithGitHubCli,
  redactText,
} from "@deepcode/core";
import { resolveUsableProviderTarget } from "@deepcode/shared";
import { createRuntime } from "../runtime.js";
import { writeStdout, writeStdoutLine } from "../stream-flush.js";

export async function githubLoginCommand(options: {
  cwd: string;
  config?: string;
  clientId?: string;
  scopes?: string[];
  openBrowser?: boolean | ((url: string) => Promise<void>);
}): Promise<void> {
  const loader = new ConfigLoader();
  const loadOptions = { cwd: options.cwd, configPath: options.config };
  const fileConfig = await loader.loadFile(loadOptions);
  const effectiveConfig = await loader.load(loadOptions);
  const clientId = options.clientId ?? effectiveConfig.github.oauthClientId;
  if (!clientId) {
    await writeStdoutLine("No DeepCode OAuth app configured; using GitHub CLI browser login.");
    const token = await loginWithGitHubCli({
      cwd: options.cwd,
      enterpriseUrl: effectiveConfig.github.enterpriseUrl,
      scopes:
        options.scopes && options.scopes.length > 0
          ? options.scopes
          : effectiveConfig.github.oauthScopes,
      onOutput: (chunk) => void writeStdout(chunk),
    });
    const client = new GitHubClient({
      token,
      enterpriseUrl: effectiveConfig.github.enterpriseUrl,
      worktree: options.cwd,
    });
    await client.getAuthenticatedUser();
    const savedPath = await loader.save(loadOptions, {
      ...fileConfig,
      github: {
        ...fileConfig.github,
        token,
        oauthScopes:
          options.scopes && options.scopes.length > 0
            ? options.scopes
            : fileConfig.github.oauthScopes,
      },
    });
    await writeStdoutLine(`GitHub token saved to ${savedPath}`);
    return;
  }
  const scopes =
    options.scopes && options.scopes.length > 0
      ? options.scopes
      : effectiveConfig.github.oauthScopes;
  const flow = new GitHubOAuthDeviceFlow({
    enterpriseUrl: effectiveConfig.github.enterpriseUrl,
    openBrowser: options.openBrowser ?? true,
    onBrowserOpenError: (error) => {
      void writeStdoutLine(`Unable to open browser automatically: ${error.message}`);
      void writeStdoutLine("Continue with the URL and code shown above.");
    },
  });
  const token = await flow.authorize({
    clientId,
    scopes,
    onVerification: (code) => {
      void writeStdoutLine(`Open ${code.verificationUri}`);
      void writeStdoutLine(`Enter code: ${code.userCode}`);
      void writeStdoutLine(`Code expires in ${Math.round(code.expiresIn / 60)} minutes.`);
    },
    onPoll: ({ attempt, nextIntervalSeconds }) => {
      if (attempt === 1) {
        void writeStdoutLine(`Waiting for GitHub authorization; polling every ${nextIntervalSeconds}s.`);
      }
    },
  });
  const savedPath = await loader.save(loadOptions, {
    ...fileConfig,
    github: {
      ...fileConfig.github,
      token: token.accessToken,
      oauthClientId: options.clientId ?? fileConfig.github.oauthClientId,
      oauthScopes:
        options.scopes && options.scopes.length > 0
          ? options.scopes
          : fileConfig.github.oauthScopes,
    },
  });
  await writeStdoutLine(`GitHub token saved to ${savedPath}`);
}

export async function githubWhoamiCommand(options: {
  cwd: string;
  config?: string;
}): Promise<void> {
  const runtime = await createRuntime({
    cwd: options.cwd,
    configPath: options.config,
    interactive: false,
  });
  const client = new GitHubClient({
    token: runtime.config.github.token,
    enterpriseUrl: runtime.config.github.enterpriseUrl,
    worktree: options.cwd,
  });
  const user = await client.getAuthenticatedUser();
  await writeStdoutLine(`${user.login} (${user.id})`);
  await writeStdoutLine(user.url);
}

export async function listIssuesCommand(options: {
  cwd: string;
  config?: string;
  state?: "open" | "closed" | "all";
}): Promise<void> {
  const runtime = await createRuntime({
    cwd: options.cwd,
    configPath: options.config,
    interactive: false,
  });
  const client = new GitHubClient({
    token: runtime.config.github.token,
    enterpriseUrl: runtime.config.github.enterpriseUrl,
    worktree: options.cwd,
  });
  const repo = await client.detectRepo();
  const issues = await client.listIssues({ ...repo, state: options.state });
  for (const issue of issues) {
    await writeStdoutLine(`#${issue.number} ${issue.state} ${issue.title}`);
    await writeStdoutLine(issue.url);
  }
}

export async function listPrsCommand(options: {
  cwd: string;
  config?: string;
  state?: "open" | "closed" | "all";
}): Promise<void> {
  const runtime = await createRuntime({
    cwd: options.cwd,
    configPath: options.config,
    interactive: false,
  });
  const client = new GitHubClient({
    token: runtime.config.github.token,
    enterpriseUrl: runtime.config.github.enterpriseUrl,
    worktree: options.cwd,
  });
  const repo = await client.detectRepo();
  const prs = await client.listPullRequests({ ...repo, state: options.state });
  for (const pr of prs) {
    await writeStdoutLine(`#${pr.number} ${pr.state} ${pr.title}`);
    await writeStdoutLine(pr.url);
  }
}

export async function mergePrCommand(
  prNumber: number,
  input: { method?: "merge" | "squash" | "rebase"; title?: string },
  options: { cwd: string; config?: string },
): Promise<void> {
  const runtime = await createRuntime({
    cwd: options.cwd,
    configPath: options.config,
    interactive: false,
  });
  const client = new GitHubClient({
    token: runtime.config.github.token,
    enterpriseUrl: runtime.config.github.enterpriseUrl,
    worktree: options.cwd,
  });
  const repo = await client.detectRepo();
  const result = await client.mergePullRequest({
    ...repo,
    number: prNumber,
    mergeMethod: input.method,
    commitTitle: input.title,
  });
  await writeStdoutLine(result.message);
  await writeStdoutLine(result.sha);
}

export async function createPrCommand(
  input: { title: string; body: string; head: string; base: string },
  options: { cwd: string; config?: string },
): Promise<void> {
  const runtime = await createRuntime({
    cwd: options.cwd,
    configPath: options.config,
    interactive: false,
  });
  const client = new GitHubClient({
    token: runtime.config.github.token,
    enterpriseUrl: runtime.config.github.enterpriseUrl,
    worktree: options.cwd,
  });
  const repo = await client.detectRepo();
  const pr = await client.createPullRequest({ ...repo, ...input });
  await writeStdoutLine(`#${pr.number} ${pr.title}`);
  await writeStdoutLine(pr.url);
}

export async function solveIssueCommand(
  issueNumber: number,
  options: { cwd: string; config?: string; base?: string; yes?: boolean },
): Promise<void> {
  if (!options.yes) {
    throw new Error(
      "github solve performs commit, push, and PR creation. Re-run with --yes to approve this workflow.",
    );
  }

  const runtime = await createRuntime({
    cwd: options.cwd,
    configPath: options.config,
    interactive: true,
  });
  runtime.events.on("approval:request", (request) => {
    runtime.events.emit("approval:decision", {
      requestId: request.id,
      decision: { allowed: true, reason: "Approved by github solve --yes" },
    });
  });

  const client = new GitHubClient({
    token: runtime.config.github.token,
    enterpriseUrl: runtime.config.github.enterpriseUrl,
    worktree: options.cwd,
  });
  const repo = await client.detectRepo();
  const issue = await client.getIssue({ ...repo, number: issueNumber });
  const base = options.base ?? "main";
  const branch = `deepcode/issue-${issueNumber}-${slugify(issue.title)}`.slice(0, 80);

  await runGit(options.cwd, ["fetch", "origin", base]);
  await runGit(options.cwd, ["checkout", "-B", branch, `origin/${base}`]);

  const target = resolveUsableProviderTarget(runtime.config, [runtime.config.defaultProvider]);
  const session = runtime.sessions.create({
    provider: target.provider,
    model: target.model,
  });
  const secretValues = collectSecretValues(runtime.config);
  const prompt = [
    `Resolva a issue GitHub #${issue.number}: ${issue.title}`,
    "",
    issue.body ?? "",
    "",
    "Requisitos:",
    "- Inspecione o código relevante antes de editar.",
    "- Implemente a correção completa.",
    "- Adicione ou atualize testes quando fizer sentido.",
    "- Execute validações adequadas.",
  ].join("\n");

  await writeStdoutLine(`Solving issue #${issue.number} on ${branch}`);
  await runtime.agent.run({
    session,
    input: prompt,
    onChunk: (text) => void writeStdout(redactText(text, secretValues)),
  });
  await writeStdout("\n");

  const status = await runGit(options.cwd, ["status", "--porcelain"]);
  const aheadLog = await runGit(options.cwd, ["log", `origin/${base}..HEAD`, "--oneline"]);
  const hasUncommitted = Boolean(status.stdout.trim());
  const hasCommits = Boolean(aheadLog.stdout.trim());

  if (!hasUncommitted && !hasCommits) {
    throw new Error("Agent completed without file changes; no PR was created.");
  }

  if (hasUncommitted) {
    await runGit(options.cwd, ["add", "."]);
    await runGit(options.cwd, [
      "commit",
      "-m",
      `fix: resolve issue #${issue.number}`,
      "-m",
      `${issue.title}\n\nCloses #${issue.number}`,
    ]);
  }
  await runGit(options.cwd, ["push", "-u", "origin", branch]);

  const pr = await client.createPullRequest({
    ...repo,
    title: `Fix: ${issue.title}`,
    body: [
      `Resolves #${issue.number}.`,
      "",
      "Implemented by DeepCode.",
      "",
      `Session: ${session.id}`,
    ].join("\n"),
    head: branch,
    base,
  });
  await client.addIssueComment({
    ...repo,
    number: issue.number,
    body: `DeepCode opened PR #${pr.number}: ${pr.url}`,
  });
  await writeStdoutLine(`PR created: ${pr.url}`);
}

export async function reviewPrCommand(
  prNumber: number,
  options: { cwd: string; config?: string; focus?: string[] },
): Promise<void> {
  const runtime = await createRuntime({
    cwd: options.cwd,
    configPath: options.config,
    interactive: false,
  });

  const client = new GitHubClient({
    token: runtime.config.github.token,
    enterpriseUrl: runtime.config.github.enterpriseUrl,
    worktree: options.cwd,
  });
  const repo = await client.detectRepo();
  const [pr, diff] = await Promise.all([
    client.getPullRequest({ ...repo, number: prNumber }),
    client.getPullRequestDiff({ ...repo, number: prNumber }),
  ]);

  const focusLine =
    options.focus && options.focus.length > 0
      ? `\nFocus areas: ${options.focus.join(", ")}.`
      : "";

  const prompt = [
    `Review PR #${pr.number}: ${pr.title}`,
    `Branch: ${pr.head ?? "?"} → ${pr.base ?? "?"}`,
    "",
    pr.body ? `Description:\n${pr.body}` : "No description provided.",
    "",
    `Diff:\n\`\`\`diff\n${diff}\n\`\`\``,
    "",
    `Produce a structured code review with:${focusLine}`,
    "1. **Summary** — what the PR does",
    "2. **Issues** — bugs, security concerns, performance problems",
    "3. **Suggestions** — improvements and nitpicks",
    "4. **Verdict** — Approve / Request Changes / Neutral with a one-line rationale",
  ].join("\n");

  const target = resolveUsableProviderTarget(runtime.config, [runtime.config.defaultProvider]);
  const session = runtime.sessions.create({
    provider: target.provider,
    model: target.model,
  });
  const secretValues = collectSecretValues(runtime.config);

  await writeStdoutLine(`Reviewing PR #${pr.number}: ${pr.title}`);
  await runtime.agent.run({
    session,
    input: prompt,
    onChunk: (text) => void writeStdout(redactText(text, secretValues)),
  });
  await writeStdout("\n");
}

async function runGit(cwd: string, args: string[]) {
  const result = await execFileAsync("git", args, { cwd, timeoutMs: 180_000 });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || result.stdout || `git ${args.join(" ")} failed`);
  }
  return result;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 48);
}
