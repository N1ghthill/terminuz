import { describe, it, expect } from "vitest";
import {
  compactToolDescription,
  simplifyToolSchema,
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
