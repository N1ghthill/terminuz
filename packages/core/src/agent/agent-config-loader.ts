import fs from "node:fs";
import path from "node:path";

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
 * Load all named agent configs from `.deepcode/agents/*.md` in the given worktree.
 */
export function loadAgentConfigs(worktree: string): AgentConfig[] {
  const dir = path.join(worktree, ".deepcode", "agents");
  if (!fs.existsSync(dir)) return [];

  const configs: AgentConfig[] = [];
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return [];
  }

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const filePath = path.join(dir, entry);
    let content: string;
    try {
      content = fs.readFileSync(filePath, "utf8");
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
      allowedTools: Array.isArray(meta["allowed_tools"]) ? (meta["allowed_tools"] as string[]) : undefined,
      disallowedTools: Array.isArray(meta["disallowed_tools"]) ? (meta["disallowed_tools"] as string[]) : undefined,
    });
  }

  return configs;
}
