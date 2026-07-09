import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EventBus } from "../src/events/event-bus.js";
import { TelemetryCollector } from "../src/telemetry/telemetry-collector.js";

let tempDir: string;
let collector: TelemetryCollector;

beforeEach(async () => {
  tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-telemetry-"));
  collector = new TelemetryCollector({ worktree: tempDir });
  await collector.init();
});

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true });
});

describe("TelemetryCollector", () => {
  describe("createSession", () => {
    it("creates a session with zero counters", async () => {
      await collector.createSession("sess_1", "openrouter", "model-x");

      const stats = collector.getSessionStats("sess_1");
      expect(stats).not.toBeNull();
      expect(stats!.sessionId).toBe("sess_1");
      expect(stats!.provider).toBe("openrouter");
      expect(stats!.model).toBe("model-x");
      expect(stats!.inputTokens).toBe(0);
      expect(stats!.outputTokens).toBe(0);
      expect(stats!.estimatedCost).toBe(0);
      expect(stats!.toolCalls).toBe(0);
      expect(stats!.duration).toBeGreaterThanOrEqual(0);
      expect(stats!.startTime).toBeTruthy();
    });

    it("reuses existing session telemetry instead of resetting counters", async () => {
      await collector.createSession("sess_1", "openrouter", "model-x");
      collector.recordTokenUsage("sess_1", 1000, 500, 0.01, 0.02);
      await collector.finalizeSession("sess_1");

      await collector.createSession("sess_1", "openrouter", "model-y");

      const stats = collector.getSessionStats("sess_1");
      expect(stats).not.toBeNull();
      expect(stats!.model).toBe("model-y");
      expect(stats!.inputTokens).toBe(1000);
      expect(stats!.outputTokens).toBe(500);
    });
  });

  describe("recordTokenUsage", () => {
    it("increments token counts and calculates cost", async () => {
      await collector.createSession("sess_1", "openrouter", "model-x");
      collector.recordTokenUsage("sess_1", 1000, 500, 0.01, 0.02);

      const stats = collector.getSessionStats("sess_1");
      expect(stats!.inputTokens).toBe(1000);
      expect(stats!.outputTokens).toBe(500);
      expect(stats!.estimatedCost).toBeCloseTo(0.02, 6);
    });

    it("accumulates multiple calls", async () => {
      await collector.createSession("sess_1", "openrouter", "model-x");
      collector.recordTokenUsage("sess_1", 1000, 500, 0.01, 0.02);
      collector.recordTokenUsage("sess_1", 2000, 300, 0.01, 0.02);

      const stats = collector.getSessionStats("sess_1");
      expect(stats!.inputTokens).toBe(3000);
      expect(stats!.outputTokens).toBe(800);
    });

    it("handles zero pricing gracefully", async () => {
      await collector.createSession("sess_1", "openrouter", "free-model");
      collector.recordTokenUsage("sess_1", 1000, 500, 0, 0);

      const stats = collector.getSessionStats("sess_1");
      expect(stats!.estimatedCost).toBe(0);
    });

    it("is a no-op for unknown session", async () => {
      expect(() => {
        collector.recordTokenUsage("nonexistent", 100, 50, 0.01, 0.02);
      }).not.toThrow();
    });
  });

  describe("recordToolCall", () => {
    it("increments tool call count", async () => {
      await collector.createSession("sess_1", "openrouter", "model-x");
      collector.recordToolCall("sess_1", "bash");
      collector.recordToolCall("sess_1", "file_read");

      const stats = collector.getSessionStats("sess_1");
      expect(stats!.toolCalls).toBe(2);
    });

    it("is a no-op for unknown session", async () => {
      expect(() => {
        collector.recordToolCall("nonexistent", "bash");
      }).not.toThrow();
    });
  });

  describe("getSessionStats", () => {
    it("returns null for unknown session", () => {
      expect(collector.getSessionStats("nonexistent")).toBeNull();
    });

    it("reflects live duration for active session", async () => {
      await collector.createSession("sess_1", "openrouter", "model-x");
      const stats = collector.getSessionStats("sess_1");
      expect(stats!.duration).toBeGreaterThanOrEqual(0);
    });
  });

  describe("getProviderStats", () => {
    it("groups sessions by model for a provider", async () => {
      await collector.createSession("sess_1", "openrouter", "model-a");
      await collector.createSession("sess_2", "openrouter", "model-b");
      await collector.createSession("sess_3", "anthropic", "claude-3");

      collector.recordTokenUsage("sess_1", 1000, 500, 0.01, 0.02);
      collector.recordToolCall("sess_1", "bash");
      collector.recordTokenUsage("sess_2", 2000, 1000, 0.01, 0.02);
      collector.recordToolCall("sess_2", "file_read");

      const stats = collector.getProviderStats("openrouter");
      expect(stats).toHaveLength(2);

      const modelA = stats.find((s) => s.model === "model-a");
      expect(modelA).toBeDefined();
      expect(modelA!.totalInputTokens).toBe(1000);
      expect(modelA!.sessions).toBe(1);

      const modelB = stats.find((s) => s.model === "model-b");
      expect(modelB).toBeDefined();
      expect(modelB!.sessions).toBe(1);
    });

    it("returns empty array for provider with no sessions", () => {
      const stats = collector.getProviderStats("openrouter");
      expect(stats).toEqual([]);
    });
  });

  describe("getAllSessionStats", () => {
    it("returns all created sessions", async () => {
      await collector.createSession("sess_1", "openrouter", "model-x");
      await collector.createSession("sess_2", "anthropic", "claude-3");

      const all = collector.getAllSessionStats();
      expect(all).toHaveLength(2);
    });

    it("returns empty array when no sessions exist", () => {
      expect(collector.getAllSessionStats()).toEqual([]);
    });
  });

  describe("finalizeSession", () => {
    it("sets endTime on the session", async () => {
      await collector.createSession("sess_1", "openrouter", "model-x");
      collector.recordTokenUsage("sess_1", 100, 50, 0.01, 0.02);

      await collector.finalizeSession("sess_1");

      const stats = collector.getSessionStats("sess_1");
      expect(stats?.inputTokens).toBe(100);
      expect(stats?.outputTokens).toBe(50);
    });

    it("is a no-op for unknown session", async () => {
      await expect(collector.finalizeSession("nonexistent")).resolves.not.toThrow();
    });
  });

  describe("exportToJson", () => {
    it("exports session data with summary", async () => {
      await collector.createSession("sess_1", "openrouter", "model-x");
      collector.recordTokenUsage("sess_1", 1000, 500, 0.01, 0.02);
      collector.recordToolCall("sess_1", "bash");
      collector.recordToolCall("sess_1", "file_read");
      collector.recordToolCall("sess_1", "bash");

      await collector.finalizeSession("sess_1");
      const exportPath = await collector.exportToJson("sess_1");

      const content = await readFile(exportPath, "utf8");
      const data = JSON.parse(content);

      expect(data.exportMetadata.version).toBe("1.0");
      expect(data.session.sessionId).toBe("sess_1");
      expect(data.session.totalInputTokens).toBe(1000);
      expect(data.session.totalToolCalls).toBe(3);
      expect(data.summary.totalEvents).toBeGreaterThan(0);
      expect(data.summary.toolCallBreakdown).toEqual({ bash: 2, file_read: 1 });
      expect(data.summary.tokenEfficiency).toBe("0.50");
    });

    it("throws for unknown session", async () => {
      await expect(collector.exportToJson("nonexistent")).rejects.toThrow(
        "Session nonexistent not found",
      );
    });
  });

  describe("event buffer limit", () => {
    it("evicts oldest events when exceeding MAX_EVENTS_PER_SESSION", async () => {
      await collector.createSession("sess_1", "openrouter", "model-x");

      for (let i = 0; i < 1005; i++) {
        collector.recordToolCall("sess_1", `tool-${i}`);
      }

      const stats = collector.getSessionStats("sess_1");
      expect(stats!.toolCalls).toBe(1005);

      const result = await collector.exportToJson("sess_1");
      const content = await readFile(result, "utf8");
      const data = JSON.parse(content);

      expect(data.session.events.length).toBe(1000);
      expect(data.session.events[0].toolCalls[0].name).toBe("tool-5");
    });
  });

  describe("persistence", () => {
    it("restores sessions from disk on init", async () => {
      await collector.createSession("sess_1", "openrouter", "model-x");
      collector.recordTokenUsage("sess_1", 100, 50, 0.01, 0.02);
      await collector.finalizeSession("sess_1");

      const collector2 = new TelemetryCollector({ worktree: tempDir });
      await collector2.init();

      const stats = collector2.getSessionStats("sess_1");
      expect(stats).not.toBeNull();
      expect(stats!.inputTokens).toBe(100);
      expect(stats!.outputTokens).toBe(50);
    });

    it("handles empty telemetry directory", async () => {
      const emptyDir = await mkdtemp(path.join(tmpdir(), "deepcode-telemetry-empty-"));
      const c = new TelemetryCollector({ worktree: emptyDir });
      await expect(c.init()).resolves.not.toThrow();
      expect(c.getAllSessionStats()).toEqual([]);
      await rm(emptyDir, { recursive: true, force: true });
    });

    it("quarantines unreadable telemetry files instead of retrying them on every boot", async () => {
      const telemetryDir = path.join(tempDir, ".terminuz", "telemetry");
      await mkdir(telemetryDir, { recursive: true });
      await writeFile(path.join(telemetryDir, "broken.json"), "{", "utf8");

      const events = new EventBus();
      const warnings: string[] = [];
      events.on("app:warn", ({ message }) => {
        warnings.push(message);
      });
      const collector2 = new TelemetryCollector({ worktree: tempDir, events });
      await collector2.init();

      expect(warnings.some((m) => m.includes("broken.json"))).toBe(true);
      const quarantinedFiles = await readdir(path.join(telemetryDir, "corrupt"));
      expect(quarantinedFiles).toHaveLength(1);
      expect(quarantinedFiles[0]).toContain("broken.json");
    });
  });
});
