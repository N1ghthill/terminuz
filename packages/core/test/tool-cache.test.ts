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
    const cache = new ToolCache(tempDir, DeepCodeConfigSchema.parse({ cache: { enabled: true, ttlSeconds: 60 } }));
    await cache.set("test", ["a"], { value: 1 });
    await expect(cache.get<{ value: number }>("test", ["a"])).resolves.toEqual({
      hit: true,
      value: { value: 1 },
    });
  });

  it("respects disabled cache", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-cache-"));
    const cache = new ToolCache(tempDir, DeepCodeConfigSchema.parse({ cache: { enabled: false, ttlSeconds: 60 } }));
    await cache.set("test", ["a"], "value");
    await expect(cache.get<string>("test", ["a"])).resolves.toEqual({ hit: false });
  });
});
