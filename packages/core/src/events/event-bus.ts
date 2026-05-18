import { EventEmitter } from "node:events";
import type { Activity } from "@deepcode/shared";

export interface ApprovalRequest {
  id: string;
  operation: string;
  level: string;
  path?: string;
  details?: Record<string, unknown>;
  createdAt: string;
  diff?: {
    before: string;
    after: string;
    filePath: string;
    lineStart?: number;
    lineEnd?: number;
  };
  preview?: {
    type: 'file_write' | 'file_edit' | 'shell_command' | 'git_operation';
    content?: string;
    command?: string;
    args?: string[];
    affectedFiles?: string[];
  };
}

export interface ApprovalDecision {
  allowed: boolean;
  reason?: string;
  scope?: "once" | "session" | "always";
}

export interface AppEvents {
  "activity": Activity;
  "approval:request": ApprovalRequest;
  "approval:decision": { requestId: string; decision: ApprovalDecision };
  "app:error": { error: Error; context?: Record<string, unknown> };
  "app:warn": { message: string; context?: Record<string, unknown> };
  "budget:warning": { kind: "inputTokens" | "outputTokens" | "cost"; used: number; limit: number; fraction: number };
  "budget:exceeded": { kind: "inputTokens" | "outputTokens" | "cost"; used: number; limit: number };
  "subagent:start": { taskId: string; prompt: string };
  "subagent:tool": { taskId: string; toolName: string; active: boolean };
  "subagent:complete": { taskId: string; error?: string };
}

export class EventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Node's EventEmitter treats "error" as a special event and throws when
    // it is emitted without listeners. DeepCode surfaces operational errors
    // through this channel frequently, so keep a default no-op subscriber.
    // We use "app:error" to avoid colliding with Node's built-in "error" semantics.
    this.emitter.on("app:error", () => {});
    this.emitter.on("app:warn", () => {});
    this.emitter.on("budget:warning", () => {});
    this.emitter.on("budget:exceeded", () => {});
  }

  emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): void {
    this.emitter.emit(event, payload);
  }

  on<K extends keyof AppEvents>(event: K, listener: (payload: AppEvents[K]) => void): () => void {
    this.emitter.on(event, listener);
    return () => this.emitter.off(event, listener);
  }

  once<K extends keyof AppEvents>(event: K, listener: (payload: AppEvents[K]) => void): void {
    this.emitter.once(event, listener);
  }

  removeAll<K extends keyof AppEvents>(event?: K): void {
    if (event) {
      this.emitter.removeAllListeners(event);
    } else {
      this.emitter.removeAllListeners();
    }
  }
}
