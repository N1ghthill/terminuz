/**
 * Local shim standing in for `@qwen-code/qwen-code-core`.
 *
 * The TUI was ported from Qwen Code, whose components import a set of
 * utilities and types from that package. Terminuz does not ship the Qwen
 * core, so this module reimplements (or re-types) exactly the surface the
 * ported TUI touches. It grows as more of the TUI is ported; runtime-facing
 * pieces are bridged to `@terminuz/core` in the bridge layer.
 */

import os from "node:os";
import path from "node:path";
import { getProjectDataPath, PRODUCT_IDENTITY } from "@terminuz/shared";

// ── Debug logging ───────────────────────────────────────────────────────────

export interface DebugLogger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const noop = (): void => {};

/**
 * In Qwen Code this writes structured debug logs to a file. The TUI only uses
 * it for optional diagnostics, so a no-op keeps terminal rendering clean.
 */
export function createDebugLogger(_tag?: string): DebugLogger {
  return { debug: noop, info: noop, warn: noop, error: noop };
}

// ── Error utilities ─────────────────────────────────────────────────────────

/** Type guard for Node.js system errors (those carrying an `errno`/`code`). */
export function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

// ── Path utilities ──────────────────────────────────────────────────────────

const SHELL_SPECIAL_CHARS = /[ \t()[\]{};|*?$`'"#&<>!~]/;
const UNESCAPE_REGEX = new RegExp(`\\\\([${SHELL_SPECIAL_CHARS.source.slice(1, -1)}])`, "g");

/** Removes backslash escaping from shell metacharacters in a file path. */
export function unescapePath(filePath: string): string {
  if (os.platform() === "win32") return filePath;
  return filePath.replace(UNESCAPE_REGEX, "$1");
}

const SHELL_SPECIAL_CHARS_GLOBAL = /[ \t()[\]{};|*?$`'"#&<>!~]/g;

/** Backslash-escapes shell metacharacters in a file path. */
export function escapePath(filePath: string): string {
  if (os.platform() === "win32") return filePath;
  return filePath.replace(SHELL_SPECIAL_CHARS_GLOBAL, "\\$&");
}

// ── File search (re-exported from file-search.ts) ───────────────────────────

export { FileSearchFactory } from "./file-search.js";
export type { FileSearch, SearchOptions, FileSearchOptions } from "./file-search.js";

// ── Kitty keyboard protocol telemetry ───────────────────────────────────────

export class KittySequenceOverflowEvent {
  "event.name": "kitty_sequence_overflow";
  "event.timestamp": string;
  sequence_length: number;
  truncated_sequence: string;
  constructor(sequence_length: number, truncated_sequence: string) {
    this["event.name"] = "kitty_sequence_overflow";
    this["event.timestamp"] = new Date().toISOString();
    this.sequence_length = sequence_length;
    this.truncated_sequence = truncated_sequence.substring(0, 20);
  }
}

/** Telemetry sink for Kitty overflow events — no-op in Terminuz. */
export function logKittySequenceOverflow(
  _config: Config,
  _event: KittySequenceOverflowEvent,
): void {}

// ── Storage ─────────────────────────────────────────────────────────────────

/**
 * Per-project storage path helper. Stand-in for Qwen's `Storage`; the TUI uses
 * it to locate transient files (shell history, etc.) under `.terminuz/tmp`.
 */
export class Storage {
  constructor(private readonly projectRoot: string) {}

  /** Global (per-user) temp directory, under the home directory. */
  static getGlobalTempDir(): string {
    return path.join(os.homedir(), PRODUCT_IDENTITY.projectDirName, "tmp");
  }

  getProjectTempDir(): string {
    return getProjectDataPath(this.projectRoot, "tmp");
  }

  getHistoryFilePath(): string {
    return path.join(this.getProjectTempDir(), "shell_history");
  }
}

// ── Config ──────────────────────────────────────────────────────────────────

export interface FileFilteringOptions {
  respectGitIgnore?: boolean;
  respectQwenIgnore?: boolean;
}

export interface ContentGeneratorConfig {
  contextWindowSize?: number;
}

export interface AccessibilitySettings {
  enableLoadingPhrases?: boolean;
  screenReader?: boolean;
}

/**
 * Stand-in for Qwen's `Config` god-object. The ported TUI reads it through
 * `useConfig()`; the Terminuz `AppContainer` supplies an adapter implementing
 * this surface. New getters are added here as components are ported.
 */
export interface Config {
  getDebugMode(): boolean;
  getFileFilteringOptions(): FileFilteringOptions | undefined;
  getEnableRecursiveFileSearch(): boolean;
  getFileFilteringEnableFuzzySearch(): boolean;
  getProjectRoot(): string;
  getTargetDir(): string;
  getWorkingDir(): string;
  getContentGeneratorConfig(): ContentGeneratorConfig | undefined;
  getAccessibility(): AccessibilitySettings | undefined;
  getIdeMode(): boolean;
  isTrustedFolder(): boolean | undefined;
  getShouldUseNodePtyShell(): boolean;
}

// ── Editor integration ──────────────────────────────────────────────────────

export type EditorType =
  | "vscode"
  | "vscodium"
  | "windsurf"
  | "cursor"
  | "vim"
  | "neovim"
  | "zed"
  | "emacs"
  | "trae";

/**
 * Stand-in for Qwen's IDE companion client. Terminuz has no IDE integration,
 * so `getInstance()` resolves to `null` and all IDE branches stay inert.
 */
export class IdeClient {
  static async getInstance(): Promise<IdeClient | null> {
    return null;
  }
  isDiffingEnabled(): boolean {
    return false;
  }
  async resolveDiffFromCli(..._args: unknown[]): Promise<void> {}
}

/** Formats permission rule strings for display in confirmation prompts. */
export function buildHumanReadableRuleLabel(rules: string[]): string {
  return rules.join(", ");
}

// ── Git diff ────────────────────────────────────────────────────────────────

export type { GitDiffResult, GitDiffStats, PerFileStats } from "./git-diff.js";
export { fetchGitDiff } from "./git-diff.js";

// ── Approval mode ───────────────────────────────────────────────────────────

export enum ApprovalMode {
  PLAN = "plan",
  DEFAULT = "default",
  AUTO_EDIT = "auto-edit",
  YOLO = "yolo",
}

// ── Thought summaries ───────────────────────────────────────────────────────

export type ThoughtSummary = {
  subject: string;
  description: string;
};

// ── Compression ─────────────────────────────────────────────────────────────

export enum CompressionStatus {
  COMPRESSED = 1,
  COMPRESSION_FAILED_INFLATED_TOKEN_COUNT,
  COMPRESSION_FAILED_TOKEN_COUNT_ERROR,
  COMPRESSION_FAILED_EMPTY_SUMMARY,
  NOOP,
}

// ── Agent status ────────────────────────────────────────────────────────────

export enum AgentStatus {
  INITIALIZING = "initializing",
  RUNNING = "running",
  IDLE = "idle",
  COMPLETED = "completed",
  FAILED = "failed",
  CANCELLED = "cancelled",
}

export interface AgentStatsSummary {
  totalDurationMs?: number;
  totalTurns?: number;
  totalToolCalls?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  [key: string]: unknown;
}

// ── MCP ─────────────────────────────────────────────────────────────────────

export interface MCPServerConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  url?: string;
  httpUrl?: string;
  headers?: Record<string, string>;
  timeout?: number;
  trust?: boolean;
  description?: string;
  [key: string]: unknown;
}

// ── ANSI terminal output ────────────────────────────────────────────────────

export interface AnsiToken {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  dim: boolean;
  inverse: boolean;
  fg: string;
  bg: string;
}
export type AnsiLine = AnsiToken[];
export type AnsiOutput = AnsiLine[];

// ── Tool result display ─────────────────────────────────────────────────────

export interface DiffStat {
  model_added_lines: number;
  model_removed_lines: number;
  model_added_chars: number;
  model_removed_chars: number;
  user_added_lines: number;
  user_removed_lines: number;
  user_added_chars: number;
  user_removed_chars: number;
}

export interface FileDiff {
  fileDiff: string;
  fileName: string;
  originalContent: string | null;
  newContent: string;
  diffStat?: DiffStat;
  truncatedForSession?: boolean;
  fileDiffLength?: number;
  originalContentLength?: number;
  newContentLength?: number;
  fileDiffTruncated?: boolean;
  originalContentTruncated?: boolean;
}

export interface TodoResultDisplay {
  type: "todo_list";
  todos: Array<{
    id: string;
    content: string;
    status: "pending" | "in_progress" | "completed";
  }>;
}

export interface PlanResultDisplay {
  type: "plan_summary";
  message: string;
  plan: string;
  rejected?: boolean;
}

export interface AgentResultDisplay {
  type: "task_execution";
  subagentName: string;
  subagentColor?: string;
  taskDescription: string;
  taskPrompt: string;
  status: "running" | "completed" | "failed" | "cancelled" | "background";
  terminateReason?: string;
  result?: string;
  executionSummary?: AgentStatsSummary;
  tokenCount?: number;
  pendingConfirmation?: ToolCallConfirmationDetails;
}

export interface AnsiOutputDisplay {
  ansiOutput: AnsiOutput;
  totalLines?: number;
  totalBytes?: number;
  timeoutMs?: number;
}

export interface McpToolProgressData {
  type: "mcp_tool_progress";
  progress: number;
  total?: number;
  message?: string;
}

export type ToolResultDisplay =
  | string
  | FileDiff
  | TodoResultDisplay
  | PlanResultDisplay
  | AgentResultDisplay
  | AnsiOutputDisplay
  | McpToolProgressData;

// ── Tool confirmation ───────────────────────────────────────────────────────

export enum ToolConfirmationOutcome {
  ProceedOnce = "proceed_once",
  ProceedAlways = "proceed_always",
  /** @deprecated */
  ProceedAlwaysServer = "proceed_always_server",
  /** @deprecated */
  ProceedAlwaysTool = "proceed_always_tool",
  ProceedAlwaysProject = "proceed_always_project",
  ProceedAlwaysUser = "proceed_always_user",
  ModifyWithEditor = "modify_with_editor",
  RestorePrevious = "restore_previous",
  Cancel = "cancel",
}

export interface ToolConfirmationPayload {
  newContent?: string;
  cancelMessage?: string;
  permissionRules?: string[];
  answers?: Record<string, string>;
}

type ConfirmHandler = (
  outcome: ToolConfirmationOutcome,
  payload?: ToolConfirmationPayload,
) => Promise<void>;

export interface ToolEditConfirmationDetails {
  type: "edit";
  title: string;
  onConfirm: ConfirmHandler;
  hideAlwaysAllow?: boolean;
  fileName: string;
  filePath: string;
  fileDiff: string;
  originalContent: string | null;
  newContent: string;
  isModifying?: boolean;
}

export interface ToolExecuteConfirmationDetails {
  type: "exec";
  title: string;
  onConfirm: ConfirmHandler;
  hideAlwaysAllow?: boolean;
  command: string;
  rootCommand: string;
  permissionRules?: string[];
}

export interface ToolMcpConfirmationDetails {
  type: "mcp";
  title: string;
  hideAlwaysAllow?: boolean;
  serverName: string;
  toolName: string;
  toolDisplayName: string;
  onConfirm: ConfirmHandler;
  permissionRules?: string[];
}

export interface ToolInfoConfirmationDetails {
  type: "info";
  title: string;
  onConfirm: ConfirmHandler;
  hideAlwaysAllow?: boolean;
  prompt: string;
  urls?: string[];
  permissionRules?: string[];
}

export interface ToolPlanConfirmationDetails {
  type: "plan";
  title: string;
  hideAlwaysAllow?: boolean;
  plan: string;
  prePlanMode?: string;
  onConfirm: ConfirmHandler;
}

export interface ToolAskUserQuestionConfirmationDetails {
  type: "ask_user_question";
  title: string;
  questions: Array<{
    question: string;
    header: string;
    options: Array<{ label: string; description: string }>;
    multiSelect?: boolean;
  }>;
  metadata?: { source?: string };
  onConfirm: ConfirmHandler;
}

export type ToolCallConfirmationDetails =
  | ToolEditConfirmationDetails
  | ToolExecuteConfirmationDetails
  | ToolMcpConfirmationDetails
  | ToolInfoConfirmationDetails
  | ToolPlanConfirmationDetails
  | ToolAskUserQuestionConfirmationDetails;

// ── Arena ───────────────────────────────────────────────────────────────────

export interface ArenaFileChangeSummary {
  path: string;
  additions: number;
  deletions: number;
}

export interface ArenaDiffSummary {
  files: ArenaFileChangeSummary[];
  additions: number;
  deletions: number;
}
