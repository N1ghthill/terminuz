import { mkdir, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import {
  createId,
  nowIso,
  quarantineCorruptFile,
  SessionSchema,
  type Message,
  type ProviderId,
  type Session,
  writeFileAtomic,
} from "@deepcode/shared";
import type { EventBus } from "../events/event-bus.js";

export class SessionManager {
  private readonly sessions = new Map<string, Session>();

  constructor(
    private readonly worktree: string,
    private readonly events?: EventBus,
    /** Optional external storage dir. When set, sessions are saved here instead of
     * inside the project's .deepcode/sessions/ folder, preventing accidental git commits
     * of conversation history. Falls back to reading the legacy worktree path on first load. */
    private readonly storageDir?: string,
  ) {}

  create(input: { provider: ProviderId; model?: string }): Session {
    const now = nowIso();
    const session: Session = {
      id: createId("session"),
      worktree: this.worktree,
      provider: input.provider,
      model: input.model,
      status: "idle",
      messages: [],
      activities: [],
      createdAt: now,
      updatedAt: now,
      metadata: {},
    };
    this.sessions.set(session.id, session);
    return session;
  }

  get(id: string): Session {
    const session = this.sessions.get(id);
    if (!session) {
      throw new Error(`Session not found: ${id}`);
    }
    return session;
  }

  save(session: Session): void {
    session.updatedAt = nowIso();
    this.sessions.set(session.id, session);
  }

  list(): Session[] {
    return [...this.sessions.values()].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  replaceMessages(sessionId: string, messages: Message[]): void {
    const session = this.get(sessionId);
    session.messages = messages;
    this.save(session);
  }

  addMessage(sessionId: string, message: Omit<Message, "id" | "createdAt">): Message {
    const session = this.get(sessionId);
    const full: Message = { ...message, id: createId("msg"), createdAt: nowIso() };
    session.messages.push(full);
    session.updatedAt = nowIso();
    this.save(session);
    return full;
  }

  async persist(sessionId: string): Promise<string> {
    const session = this.get(sessionId);
    const dir = this.storageDir
      ? path.join(this.storageDir, "sessions")
      : path.join(this.worktree, ".deepcode", "sessions");
    await mkdir(dir, { recursive: true });
    const filePath = path.join(dir, `${session.id}.json`);
    await writeFileAtomic(filePath, `${JSON.stringify(session, null, 2)}\n`);
    return filePath;
  }

  async loadAll(): Promise<Session[]> {
    const primaryDir = this.storageDir
      ? path.join(this.storageDir, "sessions")
      : path.join(this.worktree, ".deepcode", "sessions");

    const loaded = await this.loadFromDir(primaryDir);
    for (const session of loaded) this.sessions.set(session.id, session);

    // Backward compat: when using external storage, also load sessions from the
    // legacy worktree path so existing users don't lose their history.
    if (this.storageDir) {
      const legacyDir = path.join(this.worktree, ".deepcode", "sessions");
      if (legacyDir !== primaryDir) {
        const legacy = await this.loadFromDir(legacyDir);
        for (const session of legacy) {
          if (!this.sessions.has(session.id)) {
            this.sessions.set(session.id, session);
            loaded.push(session);
          }
        }
      }
    }

    return loaded;
  }

  private async loadFromDir(dir: string): Promise<Session[]> {
    try {
      const entries = await readdir(dir);
      const loaded: Session[] = [];
      for (const entry of entries.filter((value) => value.endsWith(".json"))) {
        const filePath = path.join(dir, entry);
        try {
          const parsed = JSON.parse(await readFile(filePath, "utf8"));
          const result = SessionSchema.safeParse(parsed);
          if (result.success) {
            loaded.push(result.data);
            continue;
          }
          const quarantined = await quarantineFileIfPossible(filePath);
          this.events?.emit("app:warn", {
            message: `Skipping corrupted session file ${entry}: ${result.error.message}${quarantined ? ` (moved to ${quarantined})` : ""}`,
          });
        } catch (error) {
          const quarantined = await quarantineFileIfPossible(filePath);
          this.events?.emit("app:warn", {
            message: `Skipping unreadable session file ${entry}: ${error instanceof Error ? error.message : String(error)}${quarantined ? ` (moved to ${quarantined})` : ""}`,
          });
        }
      }
      return loaded;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
  }
}

async function quarantineFileIfPossible(filePath: string): Promise<string | null> {
  try {
    return await quarantineCorruptFile(filePath);
  } catch {
    return null;
  }
}
