import { mkdtemp, readFile, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { AuditLogger } from "../src/security/audit-logger.js";

let tempDir: string | undefined;

afterEach(async () => {
  delete process.env.DEEPCODE_TEST_TOKEN;
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("AuditLogger", () => {
  it("redacts secrets before writing audit entries", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-audit-"));
    process.env.DEEPCODE_TEST_TOKEN = "audit-secret-token";

    await new AuditLogger(tempDir).log({
      operation: "curl -H 'Authorization: Bearer audit-secret-token' https://example.com",
      result: "allowed",
      details: {
        token: "audit-secret-token",
        command: "OPENAI_API_KEY=audit-secret-token node script.js",
      },
    });

    const log = await readFile(path.join(tempDir, ".terminuz", "audit.log"), "utf8");
    expect(log).toContain("[redacted]");
    expect(log).not.toContain("audit-secret-token");
  });
});
