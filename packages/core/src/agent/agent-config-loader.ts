import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { getLegacyProjectDataPath, getProjectDataPath } from "@terminuz/shared";
import { BUILTIN_AGENTS } from "./builtin-agents.js";

export interface AgentConfig {
  name: string;
  description?: string;
  systemPrompt: string;
  model?: string;
  allowedTools?: string[];
  disallowedTools?: string[];
}

/**
 * Parse YAML-style frontmatter from a markdown file.
 * Only handles simple key: value and key: [a, b, c] forms.
 */
function parseFrontmatter(content: string): { meta: Record<string, unknown>; body: string } {
  const meta: Record<string, unknown> = {};
  let body = content;

  const fmMatch = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(content);
  if (!fmMatch) return { meta, body };

  const fmBlock = fmMatch[1]!;
  body = fmMatch[2]!;

  for (const line of fmBlock.split(/\r?\n/)) {
    const kv = /^(\w[\w-]*):\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const key = kv[1]!;
    const raw = kv[2]!.trim();
    if (raw.startsWith("[") && raw.endsWith("]")) {
      meta[key] = raw
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else {
      meta[key] = raw.replace(/^['"]|['"]$/g, "");
    }
  }

  return { meta, body };
}

/**
 * Load all named agent configs from `.terminuz/agents/*.md` in the given worktree,
 * falling back to `.deepcode/agents/*.md` during the compatibility window.
 * Project-level configs override built-in agents with the same name.
 */
export async function loadAgentConfigs(worktree: string): Promise<AgentConfig[]> {
  const projectConfigs = await loadProjectAgentConfigs(worktree);
  const projectNames = new Set(projectConfigs.map((c) => c.name));
  return [...BUILTIN_AGENTS.filter((a) => !projectNames.has(a.name)), ...projectConfigs];
}

export async function loadProjectAgentConfigs(worktree: string): Promise<AgentConfig[]> {
  const preferred = await loadProjectAgentConfigsFromDir(getProjectDataPath(worktree, "agents"));
  const preferredNames = new Set(preferred.map((config) => config.name));
  const legacy = await loadProjectAgentConfigsFromDir(getLegacyProjectDataPath(worktree, "agents"));
  return [...preferred, ...legacy.filter((config) => !preferredNames.has(config.name))];
}

async function loadProjectAgentConfigsFromDir(dir: string): Promise<AgentConfig[]> {
  try {
    await access(dir);
  } catch {
    return [];
  }

  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return [];
  }

  const configs: AgentConfig[] = [];
  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const filePath = path.join(dir, entry);
    let content: string;
    try {
      content = await readFile(filePath, "utf8");
    } catch {
      continue;
    }

    const { meta, body } = parseFrontmatter(content);
    const name = typeof meta["name"] === "string" ? meta["name"] : path.basename(entry, ".md");

    configs.push({
      name,
      description: typeof meta["description"] === "string" ? meta["description"] : undefined,
      systemPrompt: body.trim(),
      model: typeof meta["model"] === "string" ? meta["model"] : undefined,
      allowedTools: Array.isArray(meta["allowed_tools"])
        ? (meta["allowed_tools"] as string[])
        : undefined,
      disallowedTools: Array.isArray(meta["disallowed_tools"])
        ? (meta["disallowed_tools"] as string[])
        : undefined,
    });
  }

  return configs;
}
