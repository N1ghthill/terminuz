import { describe, it, expect, afterEach } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  compactToolDescription,
  simplifyToolSchema,
  applyFallbackToolCallParsing,
  truncateToolOutput,
} from "../src/agent/agent-tooling.js";

// ── compactToolDescription ────────────────────────────────────────────────────

describe("compactToolDescription", () => {
  const short = "Short description.";

  it("returns description unchanged when within limit for all modes", () => {
    expect(compactToolDescription(short, "full")).toBe(short);
    expect(compactToolDescription(short, "compact")).toBe(short);
    expect(compactToolDescription(short, "minimal")).toBe(short);
  });

  it("truncates to 240 chars for full mode", () => {
    const long = "a".repeat(250);
    const result = compactToolDescription(long, "full");
    expect(result.length).toBe(240);
    expect(result.endsWith("...")).toBe(true);
  });

  it("truncates to 140 chars for compact mode", () => {
    const long = "a".repeat(160);
    const result = compactToolDescription(long, "compact");
    expect(result.length).toBe(140);
    expect(result.endsWith("...")).toBe(true);
  });

  it("truncates to 120 chars for minimal mode", () => {
    const long = "a".repeat(140);
    const result = compactToolDescription(long, "minimal");
    expect(result.length).toBe(120);
    expect(result.endsWith("...")).toBe(true);
  });

  it("does not truncate 120-char string in minimal mode", () => {
    const exact = "a".repeat(120);
    expect(compactToolDescription(exact, "minimal")).toBe(exact);
  });
});

// ── simplifyToolSchema ────────────────────────────────────────────────────────

const SCHEMA_WITH_NESTED_DESCRIPTIONS = {
  type: "object",
  $schema: "http://json-schema.org/draft-07/schema#",
  properties: {
    path: {
      type: "string",
      description: "Target file path",
      title: "Path",
      default: ".",
      examples: ["/tmp/foo"],
    },
    options: {
      type: "object",
      description: "Extra options",
      properties: {
        recursive: {
          type: "boolean",
          description: "Recurse into subdirectories",
          default: false,
        },
      },
    },
  },
  required: ["path"],
};

describe("simplifyToolSchema", () => {
  it("always drops $schema", () => {
    const result = simplifyToolSchema(SCHEMA_WITH_NESTED_DESCRIPTIONS, "full");
    expect(result).not.toHaveProperty("$schema");
  });

  it("keeps all descriptions in full mode", () => {
    const result = simplifyToolSchema(SCHEMA_WITH_NESTED_DESCRIPTIONS, "full") as any;
    expect(result.properties.path.description).toBe("Target file path");
    expect(result.properties.options.description).toBe("Extra options");
    expect(result.properties.options.properties.recursive.description).toBe("Recurse into subdirectories");
  });

  it("keeps all descriptions in compact mode", () => {
    const result = simplifyToolSchema(SCHEMA_WITH_NESTED_DESCRIPTIONS, "compact") as any;
    expect(result.properties.path.description).toBe("Target file path");
    expect(result.properties.options.description).toBe("Extra options");
    expect(result.properties.options.properties.recursive.description).toBe("Recurse into subdirectories");
  });

  it("keeps all descriptions in minimal mode including nested ones", () => {
    const result = simplifyToolSchema(SCHEMA_WITH_NESTED_DESCRIPTIONS, "minimal") as any;
    expect(result.properties.path.description).toBe("Target file path");
    expect(result.properties.options.description).toBe("Extra options");
    expect(result.properties.options.properties.recursive.description).toBe("Recurse into subdirectories");
  });

  it("drops title, default, examples in compact and minimal modes", () => {
    for (const mode of ["compact", "minimal"] as const) {
      const result = simplifyToolSchema(SCHEMA_WITH_NESTED_DESCRIPTIONS, mode) as any;
      expect(result.properties.path).not.toHaveProperty("title");
      expect(result.properties.path).not.toHaveProperty("default");
      expect(result.properties.path).not.toHaveProperty("examples");
    }
  });

  it("keeps title, default, examples in full mode", () => {
    const result = simplifyToolSchema(SCHEMA_WITH_NESTED_DESCRIPTIONS, "full") as any;
    expect(result.properties.path.title).toBe("Path");
    expect(result.properties.path.default).toBe(".");
    expect(result.properties.path.examples).toEqual(["/tmp/foo"]);
  });

  it("preserves required array", () => {
    const result = simplifyToolSchema(SCHEMA_WITH_NESTED_DESCRIPTIONS, "minimal") as any;
    expect(result.required).toEqual(["path"]);
  });

  it("returns empty schema for non-object input", () => {
    const result = simplifyToolSchema(null, "full");
    expect(result).toEqual({ type: "object", properties: {} });
  });
});

// ── applyFallbackToolCallParsing ──────────────────────────────────────────────

describe("applyFallbackToolCallParsing", () => {
  const allowed = new Set(["list_dir", "read_file"]);

  it("returns native tool calls when present, stripping any XML", () => {
    const native = [{ id: "tc1", name: "list_dir", arguments: { path: "." } }];
    const text = "checking <tool_call>{\"name\":\"list_dir\",\"arguments\":{\"path\":\".\"}}</tool_call>";
    const result = applyFallbackToolCallParsing(text, native, allowed);
    expect(result.toolCalls).toEqual(native);
    expect(result.assistantText).not.toContain("<tool_call>");
  });

  it("extracts a single XML fallback tool call", () => {
    const text = '<tool_call>{"name":"read_file","arguments":{"path":"/tmp/x"}}</tool_call>';
    const result = applyFallbackToolCallParsing(text, [], allowed);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("read_file");
    expect(result.toolCalls[0]!.arguments).toEqual({ path: "/tmp/x" });
    expect(result.assistantText).not.toContain("<tool_call>");
  });

  it("extracts multiple XML fallback tool calls in one response", () => {
    const text = [
      '<tool_call>{"name":"list_dir","arguments":{"path":"."}}</tool_call>',
      '<tool_call>{"name":"read_file","arguments":{"path":"/tmp/x"}}</tool_call>',
    ].join("\n");
    const result = applyFallbackToolCallParsing(text, [], allowed);
    expect(result.toolCalls).toHaveLength(2);
    expect(result.toolCalls.map((c) => c.name)).toEqual(["list_dir", "read_file"]);
  });

  it("silently drops tool calls with unknown names", () => {
    const text = [
      '<tool_call>{"name":"list_dir","arguments":{"path":"."}}</tool_call>',
      '<tool_call>{"name":"unknown_tool","arguments":{}}</tool_call>',
    ].join("\n");
    const result = applyFallbackToolCallParsing(text, [], allowed);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("list_dir");
  });

  it("returns no tool calls when all XML blocks have unknown names", () => {
    const text = '<tool_call>{"name":"hack_system","arguments":{}}</tool_call>';
    const result = applyFallbackToolCallParsing(text, [], allowed);
    expect(result.toolCalls).toHaveLength(0);
    expect(result.assistantText).not.toContain("<tool_call>");
  });

  it("preserves surrounding text and strips XML envelopes", () => {
    const text = "Here is the plan.\n<tool_call>{\"name\":\"list_dir\",\"arguments\":{\"path\":\".\"}}</tool_call>\nDone.";
    const result = applyFallbackToolCallParsing(text, [], allowed);
    expect(result.assistantText).toContain("Here is the plan.");
    expect(result.assistantText).toContain("Done.");
    expect(result.assistantText).not.toContain("<tool_call>");
  });

  it("returns empty tool calls and strips XML when no valid blocks present", () => {
    const text = "Just a normal answer with no tool calls.";
    const result = applyFallbackToolCallParsing(text, [], allowed);
    expect(result.toolCalls).toHaveLength(0);
    expect(result.assistantText).toBe(text);
  });
});

// ── truncateToolOutput ────────────────────────────────────────────────────────

describe("truncateToolOutput", () => {
  let tmpDir: string | undefined;

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true });
      tmpDir = undefined;
    }
  });

  it("returns output unchanged when within limit", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "deepcode-test-"));
    const output = "short output";
    const result = await truncateToolOutput(output, "shell", tmpDir, 100);
    expect(result).toBe("short output");
  });

  it("truncates and saves full output to file when over limit (all tools available)", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "deepcode-test-"));
    const output = "A".repeat(200);
    const result = await truncateToolOutput(output, "shell", tmpDir, 50);

    expect(result).toContain("full output has been saved to:");
    expect(result).toContain("read_file");
    expect(result).toContain("characters omitted");
  });

  it("includes read_file instruction when read_file is in allowedToolNames", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "deepcode-test-"));
    const output = "A".repeat(200);
    const result = await truncateToolOutput(output, "shell", tmpDir, 50, new Set(["shell", "read_file"]));

    expect(result).toContain("read_file");
    expect(result).toContain("saved to:");
  });

  it("omits read_file instruction when read_file is NOT in allowedToolNames", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "deepcode-test-"));
    const output = "A".repeat(200);
    const result = await truncateToolOutput(output, "shell", tmpDir, 50, new Set(["shell", "search_text"]));

    expect(result).not.toContain("read_file");
    expect(result).not.toContain("saved to:");
    expect(result).toContain("characters omitted");
  });

  it("does not write file when read_file is not in allowedToolNames", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "deepcode-test-"));
    const output = "A".repeat(200);
    await truncateToolOutput(output, "shell", tmpDir, 50, new Set(["shell"]));

    const { readdir } = await import("node:fs/promises");
    const tmpPath = join(tmpDir, ".deepcode", "tmp");
    await expect(readdir(tmpPath)).rejects.toThrow();
  });

  it("saved file contains the complete original output", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "deepcode-test-"));
    const output = "X".repeat(200);
    const result = await truncateToolOutput(output, "mytool", tmpDir, 50);

    const match = result.match(/saved to: (.+\.output)/);
    expect(match).not.toBeNull();
    const savedContent = await readFile(match![1]!, "utf8");
    expect(savedContent).toBe(output);
  });

  it("includes head and tail preview in truncated output", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "deepcode-test-"));
    const output = "HEAD" + "M".repeat(100) + "TAIL";
    const result = await truncateToolOutput(output, "shell", tmpDir, 20);

    expect(result).toContain("HEAD");
    expect(result).toContain("TAIL");
  });

  it("falls back to preview-only when file write fails", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "deepcode-test-"));
    // Place a regular file where mkdir would try to create .deepcode/tmp — causes ENOTDIR
    const { writeFile: wf } = await import("node:fs/promises");
    await wf(join(tmpDir, ".deepcode"), "blocker");

    const output = "Z".repeat(200);
    const result = await truncateToolOutput(output, "shell", tmpDir, 50);

    expect(result).toContain("characters omitted");
    expect(result).not.toContain("saved to:");
  });

  it("sanitizes tool name in output file path", async () => {
    tmpDir = await mkdtemp(join(tmpdir(), "deepcode-test-"));
    const output = "B".repeat(200);
    const result = await truncateToolOutput(output, "../evil/../../tool", tmpDir, 50);

    const match = result.match(/saved to: (.+\.output)/);
    expect(match).not.toBeNull();
    expect(match![1]!).not.toContain("..");
  });
});
