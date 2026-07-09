import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type { ProviderId, SessionTelemetry, TelemetryEvent } from "@terminuz/shared";
import {
  getProjectDataPath,
  nowIso,
  quarantineCorruptFile,
  SessionTelemetrySchema,
  writeFileAtomic,
} from "@terminuz/shared";
import type { EventBus } from "../events/event-bus.js";

export interface TelemetryCollectorOptions {
  worktree: string;
  events?: EventBus;
}

export interface ProviderStats {
  provider: ProviderId;
  model: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCost: number;
  totalToolCalls: number;
  sessions: number;
}

export interface SessionStats {
  sessionId: string;
  provider: ProviderId;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCost: number;
  toolCalls: number;
  errorCount: number;
  duration: number;
  startTime: string;
}

const MAX_EVENTS_PER_SESSION = 1000;

export class TelemetryCollector {
  private readonly worktree: string;
  private readonly telemetryDir: string;
  private readonly sessions = new Map<string, SessionTelemetry>();
  private readonly events?: EventBus;

  constructor(options: TelemetryCollectorOptions) {
    this.worktree = options.worktree;
    this.telemetryDir = getProjectDataPath(this.worktree, "telemetry");
    this.events = options.events;
  }

  async init(): Promise<void> {
    await mkdir(this.telemetryDir, { recursive: true, mode: 0o700 });
    await this.loadAll();
  }

  createSession(sessionId: string, provider: ProviderId, model: string): void {
    const existing = this.sessions.get(sessionId);
    if (existing) {
      existing.provider = provider;
      existing.model = model;
      delete existing.endTime;
      return;
    }

    this.sessions.set(sessionId, {
      sessionId,
      provider,
      model,
      totalInputTokens: 0,
      totalOutputTokens: 0,
      totalCost: 0,
      totalToolCalls: 0,
      totalErrors: 0,
      startTime: nowIso(),
      events: [],
    });
  }

  recordTokenUsage(
    sessionId: string,
    inputTokens: number,
    outputTokens: number,
    inputPricePer1k: number,
    outputPricePer1k: number,
  ): void {
    const session = this.getOrCreateSession(sessionId);

    const cost = (inputTokens / 1000) * inputPricePer1k + (outputTokens / 1000) * outputPricePer1k;

    session.totalInputTokens += inputTokens;
    session.totalOutputTokens += outputTokens;
    session.totalCost += cost;

    const event: TelemetryEvent = {
      sessionId,
      timestamp: nowIso(),
      provider: session.provider,
      model: session.model,
      inputTokens,
      outputTokens,
      estimatedCost: cost,
      toolCalls: [],
      duration: 0,
    };

    if (session.events.length >= MAX_EVENTS_PER_SESSION) {
      session.events.shift();
    }
    session.events.push(event);
  }

  recordError(
    sessionId: string,
    type: "agent_error" | "tool_error" | "provider_error" | "validation_error",
    message: string,
    context?: Record<string, unknown>,
  ): void {
    void context;
    const session = this.getOrCreateSession(sessionId);

    session.totalErrors += 1;

    const event: TelemetryEvent = {
      sessionId,
      timestamp: nowIso(),
      provider: session.provider,
      model: session.model,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      toolCalls: [],
      duration: 0,
    };

    if (session.events.length >= MAX_EVENTS_PER_SESSION) {
      session.events.shift();
    }
    session.events.push(event);
  }

  recordToolCall(sessionId: string, toolName: string): void {
    const session = this.getOrCreateSession(sessionId);

    session.totalToolCalls += 1;

    const event: TelemetryEvent = {
      sessionId,
      timestamp: nowIso(),
      provider: session.provider,
      model: session.model,
      inputTokens: 0,
      outputTokens: 0,
      estimatedCost: 0,
      toolCalls: [{ name: toolName, timestamp: nowIso() }],
      duration: 0,
    };

    if (session.events.length >= MAX_EVENTS_PER_SESSION) {
      session.events.shift();
    }
    session.events.push(event);
  }

  private getOrCreateSession(sessionId: string): SessionTelemetry {
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        provider: "opencode" as ProviderId,
        model: "unknown",
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0,
        totalToolCalls: 0,
        totalErrors: 0,
        startTime: nowIso(),
        events: [],
      };
      this.sessions.set(sessionId, session);
    }
    return session;
  }

  getSessionStats(sessionId: string): SessionStats | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const duration = session.endTime
      ? new Date(session.endTime).getTime() - new Date(session.startTime).getTime()
      : Date.now() - new Date(session.startTime).getTime();

    return {
      sessionId: session.sessionId,
      provider: session.provider,
      model: session.model,
      inputTokens: session.totalInputTokens,
      outputTokens: session.totalOutputTokens,
      estimatedCost: session.totalCost,
      toolCalls: session.totalToolCalls,
      errorCount: session.totalErrors ?? 0,
      duration,
      startTime: session.startTime,
    };
  }

  getSessionToolBreakdown(sessionId: string): Record<string, number> {
    const session = this.sessions.get(sessionId);
    if (!session) return {};
    return this.getToolCallBreakdown(session);
  }

  getProviderStats(providerId: ProviderId): ProviderStats[] {
    const stats = new Map<string, ProviderStats>();

    for (const session of this.sessions.values()) {
      if (session.provider !== providerId) continue;

      const key = session.model;
      const existing = stats.get(key) ?? {
        provider: session.provider,
        model: session.model,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        totalCost: 0,
        totalToolCalls: 0,
        sessions: 0,
      };

      existing.totalInputTokens += session.totalInputTokens;
      existing.totalOutputTokens += session.totalOutputTokens;
      existing.totalCost += session.totalCost;
      existing.totalToolCalls += session.totalToolCalls;
      existing.sessions += 1;

      stats.set(key, existing);
    }

    return Array.from(stats.values());
  }

  getAllSessionStats(): SessionStats[] {
    return Array.from(this.sessions.values()).map((session) => ({
      sessionId: session.sessionId,
      provider: session.provider,
      model: session.model,
      inputTokens: session.totalInputTokens,
      outputTokens: session.totalOutputTokens,
      estimatedCost: session.totalCost,
      toolCalls: session.totalToolCalls,
      errorCount: session.totalErrors ?? 0,
      duration: session.endTime
        ? new Date(session.endTime).getTime() - new Date(session.startTime).getTime()
        : Date.now() - new Date(session.startTime).getTime(),
      startTime: session.startTime,
    }));
  }

  async finalizeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.endTime = nowIso();
    await this.persist(sessionId);
  }

  async exportToJson(sessionId: string, outputPath?: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const duration = session.endTime
      ? new Date(session.endTime).getTime() - new Date(session.startTime).getTime()
      : Date.now() - new Date(session.startTime).getTime();

    const exportData = {
      exportMetadata: {
        exportedAt: nowIso(),
        version: "1.0",
        source: "terminuz-telemetry",
      },
      session: {
        sessionId: session.sessionId,
        provider: session.provider,
        model: session.model,
        startTime: session.startTime,
        endTime: session.endTime || nowIso(),
        duration,
        totalInputTokens: session.totalInputTokens,
        totalOutputTokens: session.totalOutputTokens,
        totalCost: session.totalCost,
        totalToolCalls: session.totalToolCalls,
        events: session.events,
      },
      summary: {
        totalEvents: session.events.length,
        averageCostPerEvent:
          session.events.length > 0 ? (session.totalCost / session.events.length).toFixed(4) : "0",
        toolCallBreakdown: this.getToolCallBreakdown(session),
        tokenEfficiency:
          session.totalOutputTokens > 0
            ? (session.totalOutputTokens / session.totalInputTokens).toFixed(2)
            : "0",
      },
    };

    const targetPath =
      outputPath ||
      getProjectDataPath(this.worktree, "exports", `telemetry-${sessionId}-${Date.now()}.json`);
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFileAtomic(targetPath, `${JSON.stringify(exportData, null, 2)}\n`);

    return targetPath;
  }

  private getToolCallBreakdown(session: SessionTelemetry): Record<string, number> {
    const breakdown: Record<string, number> = {};
    for (const event of session.events) {
      for (const tc of event.toolCalls) {
        breakdown[tc.name] = (breakdown[tc.name] || 0) + 1;
      }
    }
    return breakdown;
  }

  private async persist(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    try {
      const filePath = path.join(this.telemetryDir, `${sessionId}.json`);
      await writeFileAtomic(filePath, `${JSON.stringify(session, null, 2)}\n`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.events?.emit("app:error", {
        error: new Error(`Failed to persist telemetry for session ${sessionId}: ${message}`),
      });
    }
  }

  private async loadAll(): Promise<void> {
    try {
      const files = await readdir(this.telemetryDir);
      for (const file of files) {
        if (!file.endsWith(".json")) continue;

        try {
          const filePath = path.join(this.telemetryDir, file);
          const content = await readFile(filePath, "utf8");
          const parsed = JSON.parse(content);
          const result = SessionTelemetrySchema.safeParse(parsed);
          if (result.success) {
            this.sessions.set(result.data.sessionId, result.data);
          } else {
            const quarantined = await quarantineFileIfPossible(filePath);
            this.events?.emit("app:warn", {
              message: `Skipping corrupted telemetry file ${file}: ${result.error.message}${quarantined ? ` (moved to ${quarantined})` : ""}`,
            });
          }
        } catch (parseError) {
          const filePath = path.join(this.telemetryDir, file);
          const quarantined = await quarantineFileIfPossible(filePath);
          this.events?.emit("app:warn", {
            message: `Skipping unreadable telemetry file ${file}: ${parseError instanceof Error ? parseError.message : String(parseError)}${quarantined ? ` (moved to ${quarantined})` : ""}`,
          });
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      this.events?.emit("app:error", { error: new Error(`Failed to load telemetry: ${message}`) });
    }
  }
}

async function readdir(dir: string): Promise<string[]> {
  try {
    const { readdir } = await import("node:fs/promises");
    return readdir(dir);
  } catch {
    return [];
  }
}

async function quarantineFileIfPossible(filePath: string): Promise<string | null> {
  try {
    return await quarantineCorruptFile(filePath);
  } catch {
    return null;
  }
}
