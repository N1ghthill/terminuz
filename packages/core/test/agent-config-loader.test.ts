import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { loadAgentConfigs } from "../src/agent/agent-config-loader.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("loadAgentConfigs", () => {
  it("returns empty array when .deepcode/agents directory does not exist", () => {
    const result = loadAgentConfigs("/tmp/nonexistent-deepcode-dir-xyz");
    expect(result).toEqual([]);
  });

  it("returns empty array when agents directory is empty", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-agents-"));
    await mkdir(path.join(tempDir, ".deepcode", "agents"), { recursive: true });
    const result = loadAgentConfigs(tempDir);
    expect(result).toEqual([]);
  });

  it("parses a full agent config from frontmatter", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-agents-"));
    await mkdir(path.join(tempDir, ".deepcode", "agents"), { recursive: true });
    await writeFile(
      path.join(tempDir, ".deepcode", "agents", "code-reviewer.md"),
      `---
name: code-reviewer
description: Reviews code for quality and security issues
model: anthropic/claude-3-5-sonnet
allowed_tools: [read_file, search_text, search_files]
disallowed_tools: [bash, write_file, edit_file]
---
You are a strict code reviewer. Focus on correctness, security, and maintainability.
`,
      "utf8",
    );

    const result = loadAgentConfigs(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      name: "code-reviewer",
      description: "Reviews code for quality and security issues",
      systemPrompt: "You are a strict code reviewer. Focus on correctness, security, and maintainability.",
      model: "anthropic/claude-3-5-sonnet",
      allowedTools: ["read_file", "search_text", "search_files"],
      disallowedTools: ["bash", "write_file", "edit_file"],
    });
  });

  it("uses filename as name when frontmatter has no name field", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-agents-"));
    await mkdir(path.join(tempDir, ".deepcode", "agents"), { recursive: true });
    await writeFile(
      path.join(tempDir, ".deepcode", "agents", "my-specialist.md"),
      `---
description: A specialist agent
---
You are a specialist.
`,
      "utf8",
    );

    const result = loadAgentConfigs(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("my-specialist");
  });

  it("parses an agent with no frontmatter — body becomes systemPrompt", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-agents-"));
    await mkdir(path.join(tempDir, ".deepcode", "agents"), { recursive: true });
    await writeFile(
      path.join(tempDir, ".deepcode", "agents", "simple.md"),
      "You are a simple agent that just answers questions.",
      "utf8",
    );

    const result = loadAgentConfigs(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("simple");
    expect(result[0]?.systemPrompt).toBe("You are a simple agent that just answers questions.");
    expect(result[0]?.allowedTools).toBeUndefined();
    expect(result[0]?.disallowedTools).toBeUndefined();
    expect(result[0]?.model).toBeUndefined();
  });

  it("skips non-.md files in the agents directory", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-agents-"));
    await mkdir(path.join(tempDir, ".deepcode", "agents"), { recursive: true });
    await writeFile(path.join(tempDir, ".deepcode", "agents", "README.txt"), "not an agent", "utf8");
    await writeFile(path.join(tempDir, ".deepcode", "agents", "config.json"), "{}", "utf8");
    await writeFile(
      path.join(tempDir, ".deepcode", "agents", "real-agent.md"),
      "---\nname: real-agent\n---\nYou are real.",
      "utf8",
    );

    const result = loadAgentConfigs(tempDir);
    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("real-agent");
  });

  it("loads multiple agent configs from the same directory", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-agents-"));
    await mkdir(path.join(tempDir, ".deepcode", "agents"), { recursive: true });
    await writeFile(
      path.join(tempDir, ".deepcode", "agents", "agent-a.md"),
      "---\nname: agent-a\n---\nI am A.",
      "utf8",
    );
    await writeFile(
      path.join(tempDir, ".deepcode", "agents", "agent-b.md"),
      "---\nname: agent-b\n---\nI am B.",
      "utf8",
    );

    const result = loadAgentConfigs(tempDir);
    expect(result).toHaveLength(2);
    const names = result.map((r) => r.name).sort();
    expect(names).toEqual(["agent-a", "agent-b"]);
  });
});
