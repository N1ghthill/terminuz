import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { DeepCodeConfigSchema } from "@terminuz/shared";
import { ToolCache } from "../src/cache/tool-cache.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("ToolCache", () => {
  it("stores and reads values", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-cache-"));
    const cache = new ToolCache(
      tempDir,
      DeepCodeConfigSchema.parse({ cache: { enabled: true, ttlSeconds: 60 } }),
    );
    await cache.set("test", ["a"], { value: 1 });
    await expect(cache.get<{ value: number }>("test", ["a"])).resolves.toEqual({
      hit: true,
      value: { value: 1 },
    });
  });

  it("respects disabled cache", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-cache-"));
    const cache = new ToolCache(
      tempDir,
      DeepCodeConfigSchema.parse({ cache: { enabled: false, ttlSeconds: 60 } }),
    );
    await cache.set("test", ["a"], "value");
    await expect(cache.get<string>("test", ["a"])).resolves.toEqual({ hit: false });
  });

  it("redacts configured and token-shaped secrets before writing cache entries", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "terminuz-cache-redaction-"));
    const configuredSecret = "configured-provider-secret";
    const tokenShapedSecret = `sk-${"a".repeat(24)}`;
    const cache = new ToolCache(
      tempDir,
      DeepCodeConfigSchema.parse({
        cache: { enabled: true, ttlSeconds: 60 },
        providers: { openai: { apiKey: configuredSecret } },
      }),
    );

    await cache.set("test", ["secret"], `${configuredSecret} ${tokenShapedSecret}`);

    const cached = await cache.get<string>("test", ["secret"]);
    expect(cached.hit).toBe(true);
    expect(cached.value).not.toContain(configuredSecret);
    expect(cached.value).not.toContain(tokenShapedSecret);
    expect(cached.value).toContain("[redacted]");
  });
});
