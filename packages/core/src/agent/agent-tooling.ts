import { createId, type ToolCall } from "@deepcode/shared";
import { mkdir, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, basename } from "node:path";
import { randomBytes } from "node:crypto";
import { parseToolArgumentsObject } from "../providers/tool-arguments.js";
import type { ToolSchemaMode } from "../providers/model-execution-profile.js";
import { redactText } from "../security/secret-redactor.js";

const MAX_TOOL_OUTPUT_LENGTH = 16_000;
const DEFAULT_TMP_OUTPUT_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_TMP_OUTPUT_FILES = 50;

const TOOL_CALL_OPEN = "<tool_call>";
const TOOL_CALL_CLOSE = "</tool_call>";

/**
 * Filters out <tool_call>...</tool_call> XML from a streaming response so that
 * visible text can be forwarded to the UI in real-time without exposing raw XML.
 * Maintains internal state across chunks to handle boundaries correctly.
 */
export class XmlToolCallStreamFilter {
  private buffer = "";
  private inToolCall = false;

  filter(text: string): string {
    this.buffer += text;
    let result = "";

    while (true) {
      if (!this.inToolCall) {
        const start = this.buffer.indexOf(TOOL_CALL_OPEN);
        if (start === -1) {
          // No tool_call opener — emit everything except a boundary-guard tail
          const safe = Math.max(0, this.buffer.length - TOOL_CALL_OPEN.length);
          result += this.buffer.slice(0, safe);
          this.buffer = this.buffer.slice(safe);
          break;
        }
        result += this.buffer.slice(0, start);
        this.buffer = this.buffer.slice(start);
        this.inToolCall = true;
      } else {
        const end = this.buffer.indexOf(TOOL_CALL_CLOSE);
        if (end === -1) break;
        this.buffer = this.buffer.slice(end + TOOL_CALL_CLOSE.length);
        this.inToolCall = false;
      }
    }

    return result;
  }

  flush(): string {
    if (this.inToolCall) return "";
    const result = this.buffer.trim();
    this.buffer = "";
    return result;
  }
}

export function compactToolDescription(description: string, schemaMode: ToolSchemaMode): string {
  const maxLength = schemaMode === "full" ? 240 : schemaMode === "compact" ? 140 : 120;
  if (description.length <= maxLength) {
    return description;
  }

  return `${description.slice(0, maxLength - 3).trimEnd()}...`;
}

export function simplifyToolSchema(schema: unknown, schemaMode: ToolSchemaMode): Record<string, unknown> {
  const normalized = sanitizeSchemaNode(schema, schemaMode);
  if (normalized && typeof normalized === "object" && !Array.isArray(normalized)) {
    return normalized as Record<string, unknown>;
  }

  return { type: "object", properties: {} };
}

export function buildFallbackToolCallPrompt(allowedToolNames: Set<string>): string {
  return [
    "Tool fallback for this model:",
    "Prefer native tool calling when the model supports it.",
    "If you need one or more tools and native tool calling is unavailable for this model, emit one XML block per tool call, each in this format:",
    "<tool_call>{\"name\":\"tool_name\",\"arguments\":{\"key\":\"value\"}}</tool_call>",
    "You may emit multiple <tool_call> blocks in a single response to invoke several tools in parallel.",
    "Do not wrap the JSON in markdown fences.",
    "Use only tool names from this turn's allowed set.",
    `Allowed tool names: ${[...allowedToolNames].join(", ")}`,
    "If no tool is needed, answer normally with plain text.",
  ].join("\n");
}

export function applyFallbackToolCallParsing(
  assistantText: string,
  nativeToolCalls: ToolCall[],
  allowedToolNames: Set<string>,
): { assistantText: string; toolCalls: ToolCall[] } {
  if (nativeToolCalls.length > 0) {
    return {
      assistantText: stripFallbackToolEnvelope(assistantText),
      toolCalls: nativeToolCalls,
    };
  }

  const fallbackCalls = extractFallbackToolCalls(assistantText, allowedToolNames);
  if (fallbackCalls.length === 0) {
    return {
      assistantText: stripFallbackToolEnvelope(assistantText),
      toolCalls: nativeToolCalls,
    };
  }

  return {
    assistantText: stripFallbackToolEnvelope(assistantText),
    toolCalls: fallbackCalls,
  };
}

/**
 * Truncates large tool output and saves the full content to a temp file so the
 * model can choose to read it if needed. Returns output unchanged when within limit.
 *
 * When truncated and read_file is available to the model, the returned string
 * includes the file path and an instruction to use read_file. When read_file is
 * not in the allowed tool set (e.g. a restricted subagent), only the head/tail
 * preview is returned — no dangling instruction to use an unavailable tool.
 *
 * @param allowedToolNames - active tool set for this turn; undefined means all tools allowed.
 */
export async function truncateToolOutput(
  output: string,
  toolName: string,
  worktree: string,
  maxLength: number = MAX_TOOL_OUTPUT_LENGTH,
  allowedToolNames?: Set<string>,
  options: {
    secretValues?: string[];
    persistFullOutput?: boolean;
    tmpOutputTtlMs?: number;
    maxTmpOutputFiles?: number;
  } = {},
): Promise<string> {
  const displayOutput = options.secretValues
    ? redactText(output, options.secretValues)
    : output;

  if (displayOutput.length <= maxLength) return displayOutput;

  const headLen = Math.floor(maxLength * 0.2);
  const tailLen = maxLength - headLen;
  const head = displayOutput.slice(0, headLen);
  const tail = displayOutput.slice(-tailLen);
  const omitted = displayOutput.length - headLen - tailLen;
  const canReadFile = allowedToolNames === undefined || allowedToolNames.has("read_file");

  const preview = [
    ``,
    `--- Truncated preview (beginning) ---`,
    head,
    ``,
    `... [${omitted} characters omitted] ...`,
    ``,
    `--- Truncated preview (end) ---`,
    tail,
  ].join("\n");

  if (canReadFile && options.persistFullOutput !== false) {
    const tmpDir = join(worktree, ".deepcode", "tmp");
    const safeName = `${basename(toolName)}_${randomBytes(6).toString("hex")}.output`;
    const outputFile = join(tmpDir, safeName);

    try {
      await mkdir(tmpDir, { recursive: true, mode: 0o700 });
      await cleanupTmpOutputs(tmpDir, {
        ttlMs: options.tmpOutputTtlMs ?? DEFAULT_TMP_OUTPUT_TTL_MS,
        maxFiles: options.maxTmpOutputFiles ?? DEFAULT_MAX_TMP_OUTPUT_FILES,
      });
      await writeFile(outputFile, displayOutput, { encoding: "utf8", mode: 0o600 });

      return [
        `Tool output was too large (${displayOutput.length} chars) and has been truncated.`,
        `The full output has been saved to: ${outputFile}`,
        `To read the complete output, use the read_file tool with the path above.`,
        preview,
      ].join("\n");
    } catch {
      // fall through to simple truncation if write fails
    }
  }

  return `Tool output was too large (${displayOutput.length} chars) and has been truncated.${preview}`;
}

async function cleanupTmpOutputs(
  tmpDir: string,
  options: { ttlMs: number; maxFiles: number },
): Promise<void> {
  let entries: Array<{ name: string; path: string; mtimeMs: number }> = [];
  try {
    const names = await readdir(tmpDir);
    entries = await Promise.all(
      names
        .filter((name) => name.endsWith(".output"))
        .map(async (name) => {
          const filePath = join(tmpDir, name);
          const info = await stat(filePath);
          return { name, path: filePath, mtimeMs: info.mtimeMs };
        }),
    );
  } catch {
    return;
  }

  const now = Date.now();
  const expired = entries.filter((entry) => now - entry.mtimeMs > options.ttlMs);
  const extra = entries
    .filter((entry) => !expired.includes(entry))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .slice(Math.max(0, options.maxFiles));

  await Promise.all(
    [...expired, ...extra].map((entry) => rm(entry.path, { force: true }).catch(() => undefined)),
  );
}

function sanitizeSchemaNode(
  value: unknown,
  schemaMode: ToolSchemaMode,
): unknown {
  if (Array.isArray(value)) {
    return value
      .map((item) => sanitizeSchemaNode(item, schemaMode))
      .filter((item) => item !== undefined);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const input = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  for (const [key, child] of Object.entries(input)) {
    if (shouldDropSchemaKey(key, schemaMode)) {
      continue;
    }

    const normalizedChild = sanitizeSchemaNode(child, schemaMode);
    if (normalizedChild !== undefined) {
      next[key] = normalizedChild;
    }
  }

  if (next.type === "object") {
    const properties = next.properties;
    if (properties && typeof properties === "object" && !Array.isArray(properties)) {
      const propertyNames = new Set(Object.keys(properties as Record<string, unknown>));
      if (Array.isArray(next.required)) {
        next.required = next.required.filter(
          (item): item is string => typeof item === "string" && propertyNames.has(item),
        );
      }
    }
  }

  return next;
}

function shouldDropSchemaKey(
  key: string,
  schemaMode: ToolSchemaMode,
): boolean {
  if (key === "$schema" || key === "definitions" || key === "$defs") {
    return true;
  }

  if (
    schemaMode !== "full"
    && (key === "title" || key === "default" || key === "examples" || key === "example" || key === "deprecated")
  ) {
    return true;
  }

  return false;
}

function extractFallbackToolCalls(
  assistantText: string,
  allowedToolNames: Set<string>,
): ToolCall[] {
  const matches = [...assistantText.matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/gi)];
  const calls: ToolCall[] = [];

  for (const match of matches) {
    const payload = parseFallbackToolPayload(match[1] ?? "");
    if (!payload || !allowedToolNames.has(payload.name)) continue;
    calls.push({
      id: createId("toolcall"),
      name: payload.name,
      arguments: payload.arguments,
    });
  }

  return calls;
}

function stripFallbackToolEnvelope(assistantText: string): string {
  return collapseFallbackWhitespace(
    assistantText.replace(/<tool_call>\s*[\s\S]*?\s*<\/tool_call>/gi, ""),
  );
}

function parseFallbackToolPayload(
  raw: string,
): { name: string; arguments: Record<string, unknown> } | undefined {
  const payload = parseFallbackJsonObject(raw);
  if (!payload) {
    return undefined;
  }

  const name = firstStringField(payload, ["name", "tool", "tool_name"]);
  if (!name) {
    return undefined;
  }

  const explicitArguments = firstObjectField(payload, ["arguments", "args", "input"]);
  if (explicitArguments) {
    return { name, arguments: explicitArguments };
  }

  const argumentsObject = Object.fromEntries(
    Object.entries(payload).filter(([key]) => !["name", "tool", "tool_name"].includes(key)),
  );
  return { name, arguments: argumentsObject };
}

function parseFallbackJsonObject(raw: string): Record<string, unknown> | undefined {
  const payload = parseToolArgumentsObject(raw);
  if (Object.keys(payload).length > 0) {
    return payload;
  }
  return undefined;
}

function firstStringField(
  payload: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    if (typeof payload[key] === "string" && payload[key]) {
      return payload[key] as string;
    }
  }
  return undefined;
}

function firstObjectField(
  payload: Record<string, unknown>,
  keys: string[],
): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = payload[key];
    if (value && typeof value === "object" && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
  }
  return undefined;
}

function collapseFallbackWhitespace(input: string): string {
  return input
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
