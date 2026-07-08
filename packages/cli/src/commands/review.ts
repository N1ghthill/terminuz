import { collectSecretValues, execFileAsync, redactText } from "@deepcode/core";
import { createRuntime } from "../runtime.js";
import { resolveSessionTarget } from "../target-resolution.js";
import { writeStderrLine, writeStdoutLine } from "../stream-flush.js";
import { attachAutoApprover } from "../approval.js";

const DIFF_MAX_CHARS = 20_000;

export interface TruncationResult {
  diff: string;
  omittedFiles: number;
  totalFiles: number;
}

/**
 * Truncates a unified diff at file boundaries so the model never sees a
 * partial file section. Falls back to a hard char-cut only when a single
 * file diff exceeds the limit by itself.
 */
export function truncateDiff(raw: string, maxChars: number = DIFF_MAX_CHARS): TruncationResult {
  const fileChunks = raw.split(/(?=^diff --git )/m).filter(Boolean);
  const totalFiles = fileChunks.length;

  let result = "";
  let included = 0;
  for (const chunk of fileChunks) {
    if (result.length + chunk.length > maxChars) break;
    result += chunk;
    included++;
  }

  if (!result && fileChunks.length > 0) {
    result = fileChunks[0]!.slice(0, maxChars);
    included = 1;
  }

  return { diff: result.trimEnd(), omittedFiles: totalFiles - included, totalFiles };
}

export interface ReviewOptions {
  cwd: string;
  config?: string;
  ref?: string;
  staged?: boolean;
  file?: string;
  focus?: string[];
  provider?: string;
  model?: string;
  yes?: boolean;
  allowDangerous?: boolean;
}

async function runGit(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd, timeoutMs: 30_000 });
  if (result.exitCode !== 0) {
    throw new Error(result.stderr || `git ${args.join(" ")} failed`);
  }
  return result.stdout;
}

async function isGitRepo(cwd: string): Promise<boolean> {
  const result = await execFileAsync(
    "git",
    ["rev-parse", "--is-inside-work-tree"],
    { cwd, timeoutMs: 5_000 },
  );
  return result.exitCode === 0;
}

function buildDiffArgs(options: ReviewOptions): { args: string[]; label: string } {
  if (options.staged) {
    const args = ["diff", "--cached"];
    if (options.file) args.push("--", options.file);
    return { args, label: "staged changes" };
  }
  if (options.ref) {
    const args = ["diff", options.ref];
    if (options.file) args.push("--", options.file);
    return { args, label: `diff vs ${options.ref}` };
  }
  const args = ["diff", "HEAD"];
  if (options.file) args.push("--", options.file);
  return { args, label: options.file ? `local changes in ${options.file}` : "local changes vs HEAD" };
}

function buildPrompt(diff: string, label: string, focus: string[], truncation: TruncationResult): string {
  const focusLine =
    focus.length > 0 ? `\nFocus areas: ${focus.join(", ")}.` : "";

  const truncationNote = truncation.omittedFiles > 0
    ? `\n(Showing ${truncation.totalFiles - truncation.omittedFiles} of ${truncation.totalFiles} changed files; ${truncation.omittedFiles} file(s) omitted due to size.)\n`
    : "";

  return [
    `Review the following local git diff (${label}).`,
    "Do not modify any files. Output the review only.",
    focusLine,
    "",
    `\`\`\`diff`,
    diff,
    `\`\`\``,
    truncationNote,
    "Produce a structured code review:",
    "1. **Summary** — what changed (inferred from the diff)",
    "2. **Issues** — bugs, security concerns, logic errors, missing error handling; quote the relevant lines",
    "3. **Suggestions** — improvements and nitpicks",
    "4. **Verdict** — Looks good / Has issues, with a one-line rationale",
  ]
    .filter((l) => l !== undefined)
    .join("\n");
}

export async function reviewCommand(options: ReviewOptions): Promise<void> {
  if (options.allowDangerous && !options.yes) {
    throw new Error("--allow-dangerous requires --yes.");
  }
  if (!(await isGitRepo(options.cwd))) {
    await writeStderrLine("error: not inside a git repository");
    process.exit(1);
  }

  const { args, label } = buildDiffArgs(options);

  let rawDiff: string;
  try {
    rawDiff = await runGit(options.cwd, args);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await writeStderrLine(`error: ${msg}`);
    process.exit(1);
  }

  const trimmed = rawDiff.trim();
  if (!trimmed) {
    await writeStdoutLine(`No changes to review (${label}).`);
    return;
  }

  const truncation = truncateDiff(trimmed);

  const runtime = await createRuntime({
    cwd: options.cwd,
    configPath: options.config,
    interactive: Boolean(options.yes),
  });

  if (options.yes) {
    attachAutoApprover(runtime.events, {
      allowDangerous: options.allowDangerous,
      reason: "Approved by review --yes",
    });
  }

  const target = resolveSessionTarget(runtime.config, {
    provider: options.provider,
    model: options.model,
  });

  const session = runtime.sessions.create({
    provider: target.provider,
    model: target.model,
  });

  const prompt = buildPrompt(truncation.diff, label, options.focus ?? [], truncation);
  const secretValues = collectSecretValues(runtime.config);

  await writeStdoutLine(`Reviewing ${label}…\n`);

  let streamed = false;
  try {
    const output = await runtime.agent.run({
      session,
      input: prompt,
      mode: "plan",
      provider: target.provider,
      autoContinue: "off",
      onChunk: (text) => {
        streamed = true;
        process.stdout.write(redactText(text, secretValues));
      },
    });
    if (!streamed && output) {
      process.stdout.write(redactText(output, secretValues));
    }
    if (!streamed || !output) process.stdout.write("\n");
  } finally {
    await runtime.sessions.persist(session.id).catch(() => {});
    runtime.mcp.stop();
  }
}
