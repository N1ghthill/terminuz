import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DeepCodeConfigSchema } from "../src/index.js";

const testDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(testDir, "../../..");

describe("documented config examples", () => {
  it("keeps the README config example compatible with the schema", async () => {
    const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");
    const example = extractJsonBlockAfter(readme, "Terminuz writes project configuration");

    expect(DeepCodeConfigSchema.safeParse(JSON.parse(example)).success).toBe(true);
  });

  it("keeps the full configuration reference example compatible with the schema", async () => {
    const docs = await readFile(path.join(repoRoot, "docs", "16-configuration.md"), "utf8");
    const example = extractJsonBlockAfter(docs, "## Arquivo Completo de Exemplo");

    expect(DeepCodeConfigSchema.safeParse(JSON.parse(example)).success).toBe(true);
  });
});

function extractJsonBlockAfter(markdown: string, marker: string): string {
  const start = markdown.indexOf(marker);
  if (start < 0) {
    throw new Error(`Markdown marker not found: ${marker}`);
  }

  const match = /```json\s*([\s\S]*?)```/.exec(markdown.slice(start));
  if (!match) {
    throw new Error(`JSON code block not found after marker: ${marker}`);
  }

  return match[1]!;
}
