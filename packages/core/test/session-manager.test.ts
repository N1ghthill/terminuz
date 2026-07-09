import { access, mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { SessionManager } from "../src/sessions/session-manager.js";

let tempDir: string | undefined;

afterEach(async () => {
  vi.restoreAllMocks();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("SessionManager", () => {
  it("skips and quarantines corrupted session files while loading valid sessions", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-sessions-"));
    const sessionsDir = path.join(tempDir, ".terminuz", "sessions");
    await mkdir(sessionsDir, { recursive: true });

    const manager = new SessionManager(tempDir);
    const session = manager.create({ provider: "openrouter", model: "model-x" });
    await manager.persist(session.id);
    await writeFile(path.join(sessionsDir, "broken.json"), '{"id":', "utf8");

    const events = new EventBus();
    const warnings: string[] = [];
    events.on("app:warn", ({ message }) => {
      warnings.push(message);
    });
    const restored = new SessionManager(tempDir, events);
    const loaded = await restored.loadAll();

    expect(loaded).toHaveLength(1);
    expect(loaded[0]?.id).toBe(session.id);
    expect(warnings.some((m) => m.includes("broken.json"))).toBe(true);

    const quarantinedFiles = await readdir(path.join(sessionsDir, "corrupt"));
    expect(quarantinedFiles).toHaveLength(1);
    expect(quarantinedFiles[0]).toContain("broken.json");
  });

  it("reads legacy external sessions but persists new sessions only to Terminuz storage", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "terminuz-session-migration-"));
    const worktree = path.join(tempDir, "worktree");
    const legacyStorage = path.join(tempDir, "legacy-data");
    const terminuzStorage = path.join(tempDir, "terminuz-data");

    const legacyManager = new SessionManager(worktree, undefined, legacyStorage);
    const legacySession = legacyManager.create({ provider: "openrouter", model: "legacy" });
    await legacyManager.persist(legacySession.id);

    const manager = new SessionManager(worktree, undefined, terminuzStorage, [legacyStorage]);
    const loaded = await manager.loadAll();
    expect(loaded.map((session) => session.id)).toContain(legacySession.id);

    const newSession = manager.create({ provider: "openrouter", model: "terminuz" });
    await manager.persist(newSession.id);
    await expect(
      access(path.join(terminuzStorage, "sessions", `${newSession.id}.json`)),
    ).resolves.toBeUndefined();
    await expect(
      access(path.join(legacyStorage, "sessions", `${newSession.id}.json`)),
    ).rejects.toThrow();
  });
});
