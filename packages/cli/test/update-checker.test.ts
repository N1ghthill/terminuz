import { afterEach, describe, expect, it, vi } from "vitest";
import { checkForUpdate, isNewer } from "../src/update-checker.js";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("isNewer", () => {
  it("compares semantic versions", () => {
    expect(isNewer("1.1.26", "1.1.27")).toBe(true);
    expect(isNewer("1.1.26", "1.2.0")).toBe(true);
    expect(isNewer("1.1.26", "2.0.0")).toBe(true);
    expect(isNewer("1.1.26", "1.1.26")).toBe(false);
    expect(isNewer("1.1.26", "1.1.25")).toBe(false);
  });

  it("accepts a v prefix and ignores prerelease/build suffixes", () => {
    expect(isNewer("v1.1.26", "1.1.27-beta.1")).toBe(true);
    expect(isNewer("1.1.26+build.1", "v1.1.26")).toBe(false);
  });

  it("treats invalid versions as not newer", () => {
    expect(isNewer("1.1", "1.1.27")).toBe(false);
    expect(isNewer("1.1.26", "latest")).toBe(false);
  });
});

describe("checkForUpdate", () => {
  it("does not call the registry in test mode", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await expect(checkForUpdate("1.1.26", { force: true })).resolves.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
