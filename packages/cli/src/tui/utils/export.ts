import type { Message } from "@terminuz/shared";
import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

export type ExportFormat = "markdown" | "json";
export const EXPORT_FORMATS: readonly ExportFormat[] = ["markdown", "json"];

interface ExportOptions {
  messages: Message[];
  cwd: string;
  model?: string;
  format: ExportFormat;
}

function formatTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function toMarkdown({ messages, cwd, model }: Omit<ExportOptions, "format">): string {
  const lines: string[] = [];
  const now = new Date().toISOString();

  lines.push(`# Terminuz Session Export`);
  lines.push(``);
  lines.push(`**Exported:** ${formatTimestamp(now)}`);
  lines.push(`**Directory:** ${cwd}`);
  if (model) lines.push(`**Model:** ${model}`);
  lines.push(``);
  lines.push(`---`);
  lines.push(``);

  for (const msg of messages) {
    if (msg.source === "ui" || msg.source === "agent_internal") continue;

    if (msg.role === "system") {
      lines.push(`> *[system]*`);
      lines.push(``);
      continue;
    }

    if (msg.role === "user") {
      lines.push(`## User`);
      lines.push(``);
      lines.push(msg.content);
      lines.push(``);
      continue;
    }

    if (msg.role === "assistant") {
      lines.push(`## Assistant`);
      lines.push(``);
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        for (const call of msg.toolCalls) {
          lines.push(`**Tool:** \`${call.name}\``);
          lines.push(``);
          try {
            lines.push("```json");
            lines.push(JSON.stringify(call.arguments, null, 2));
            lines.push("```");
          } catch {
            lines.push(String(call.arguments));
          }
          lines.push(``);
        }
      }
      if (msg.content) {
        lines.push(msg.content);
        lines.push(``);
      }
      continue;
    }

    if (msg.role === "tool") {
      lines.push(`*[tool result]*`);
      lines.push(``);
      const preview = msg.content.slice(0, 500);
      lines.push("```");
      lines.push(preview + (msg.content.length > 500 ? "\n…" : ""));
      lines.push("```");
      lines.push(``);
      continue;
    }
  }

  return lines.join("\n");
}

function toJson({ messages, cwd, model }: Omit<ExportOptions, "format">): string {
  const exportable = messages.filter((m) => m.source !== "ui" && m.source !== "agent_internal");
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      cwd,
      model,
      messages: exportable,
    },
    null,
    2,
  );
}

function generateFilename(format: ExportFormat, cwd: string): string {
  const dirName = path.basename(cwd);
  const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const ext = format === "markdown" ? "md" : "json";
  return `terminuz-${dirName}-${ts}.${ext}`;
}

export async function exportSession(opts: ExportOptions): Promise<string> {
  const content = opts.format === "markdown" ? toMarkdown(opts) : toJson(opts);

  const downloadsDir = path.join(os.homedir(), "Downloads");
  let outputDir = opts.cwd;

  try {
    await fs.access(downloadsDir);
    outputDir = downloadsDir;
  } catch {
    // fall back to cwd
  }

  const filename = generateFilename(opts.format, opts.cwd);
  const outPath = path.join(outputDir, filename);
  await fs.writeFile(outPath, content, "utf8");
  return outPath;
}
