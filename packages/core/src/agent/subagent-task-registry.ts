export type SubagentTaskStatus = "queued" | "running" | "completed" | "failed" | "cancelled";
export type SubagentTaskMode = "task" | "background";

export interface SubagentTaskRecord {
  taskId: string;
  prompt: string;
  status: SubagentTaskStatus;
  sessionId?: string;
  parentSessionId?: string;
  subagentType?: string;
  mode?: SubagentTaskMode;
  summary?: string;
  currentTool?: string;
  currentOutput?: string;
  error?: string;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
}

export type SubagentTaskRegistryListener = (records: readonly SubagentTaskRecord[]) => void;
export type RestoredSubagentTaskRecord = SubagentTaskRecord;

interface InternalTaskRecord extends SubagentTaskRecord {
  controller: AbortController;
  detachParentAbort?: () => void;
}

function cloneRecord(record: InternalTaskRecord): SubagentTaskRecord {
  const { controller: _controller, detachParentAbort: _detach, ...snapshot } = record;
  return { ...snapshot };
}

export class SubagentTaskRegistry {
  private readonly records = new Map<string, InternalTaskRecord>();
  private readonly listeners = new Set<SubagentTaskRegistryListener>();
  private batchDepth = 0;
  private notificationPending = false;

  batch<T>(operation: () => T): T {
    this.batchDepth += 1;
    try {
      return operation();
    } finally {
      this.batchDepth -= 1;
      if (this.batchDepth === 0 && this.notificationPending) {
        this.notificationPending = false;
        this.notify();
      }
    }
  }

  register(
    task: {
      taskId: string;
      prompt: string;
      parentSessionId?: string;
      subagentType?: string;
      mode?: SubagentTaskMode;
    },
    parentSignal?: AbortSignal,
  ): AbortSignal {
    const existing = this.records.get(task.taskId);
    if (existing && (existing.status === "queued" || existing.status === "running")) {
      return existing.controller.signal;
    }
    existing?.detachParentAbort?.();

    const controller = new AbortController();
    let detachParentAbort: (() => void) | undefined;
    if (parentSignal) {
      const abortFromParent = () => controller.abort(parentSignal.reason);
      if (parentSignal.aborted) {
        abortFromParent();
      } else {
        parentSignal.addEventListener("abort", abortFromParent, { once: true });
        detachParentAbort = () => parentSignal.removeEventListener("abort", abortFromParent);
      }
    }

    this.records.set(task.taskId, {
      ...task,
      status: "queued",
      createdAt: Date.now(),
      controller,
      detachParentAbort,
    });
    this.notify();
    return controller.signal;
  }

  start(taskId: string, sessionId: string): void {
    this.patch(taskId, {
      sessionId,
      status: "running",
      startedAt: Date.now(),
    });
  }

  appendOutput(taskId: string, text: string): void {
    const record = this.records.get(taskId);
    if (!record || record.status !== "running") return;
    record.currentOutput = `${record.currentOutput ?? ""}${text}`.slice(-2_000);
  }

  setTool(taskId: string, toolName: string, active: boolean): void {
    const record = this.records.get(taskId);
    if (!record || record.status !== "running") return;
    const nextTool = active ? toolName : undefined;
    if (record.currentTool === nextTool) return;
    record.currentTool = nextTool;
  }

  complete(taskId: string, summary?: string): void {
    this.settle(taskId, "completed", undefined, summary);
  }

  fail(taskId: string, error: string): void {
    this.settle(taskId, "failed", error);
  }

  markCancelled(taskId: string, error = "Execution cancelled."): void {
    this.settle(taskId, "cancelled", error);
  }

  cancel(taskId: string, reason = "Subagent cancelled"): boolean {
    const record = this.records.get(taskId);
    if (!record || (record.status !== "queued" && record.status !== "running")) {
      return false;
    }
    record.controller.abort(new Error(reason));
    this.markCancelled(taskId, reason);
    return true;
  }

  cancelByParentSession(parentSessionId: string, reason = "Parent session cancelled"): number {
    let cancelled = 0;
    for (const record of this.records.values()) {
      if (
        record.parentSessionId === parentSessionId &&
        record.mode !== "background" &&
        (record.status === "queued" || record.status === "running") &&
        this.cancel(record.taskId, reason)
      ) {
        cancelled += 1;
      }
    }
    return cancelled;
  }

  get(taskId: string): SubagentTaskRecord | undefined {
    const record = this.records.get(taskId);
    return record ? cloneRecord(record) : undefined;
  }

  getAll(): readonly SubagentTaskRecord[] {
    return [...this.records.values()].sort((a, b) => a.createdAt - b.createdAt).map(cloneRecord);
  }

  subscribe(listener: SubagentTaskRegistryListener): () => void {
    this.listeners.add(listener);
    listener(this.getAll());
    return () => this.listeners.delete(listener);
  }

  restore(records: readonly RestoredSubagentTaskRecord[]): void {
    this.batch(() => {
      for (const record of records) {
        const wasActive = record.status === "queued" || record.status === "running";
        this.records.set(record.taskId, {
          ...record,
          status: wasActive ? "cancelled" : record.status,
          currentTool: wasActive ? undefined : record.currentTool,
          error: wasActive
            ? "Background task was interrupted because the previous DeepCode process ended."
            : record.error,
          completedAt: wasActive ? Date.now() : record.completedAt,
          controller: new AbortController(),
        });
      }
    });
  }

  private patch(taskId: string, patch: Partial<SubagentTaskRecord>): void {
    const record = this.records.get(taskId);
    if (!record) return;
    Object.assign(record, patch);
    this.notify();
  }

  private settle(
    taskId: string,
    status: Extract<SubagentTaskStatus, "completed" | "failed" | "cancelled">,
    error?: string,
    summary?: string,
  ): void {
    const record = this.records.get(taskId);
    if (!record || (record.status !== "queued" && record.status !== "running")) return;
    record.detachParentAbort?.();
    record.detachParentAbort = undefined;
    record.status = status;
    record.currentTool = undefined;
    if (summary) record.summary = summary.slice(0, 2_000);
    record.error = error;
    record.completedAt = Date.now();
    this.notify();
  }

  private notify(): void {
    if (this.batchDepth > 0) {
      this.notificationPending = true;
      return;
    }
    if (this.listeners.size === 0) return;
    const snapshot = this.getAll();
    for (const listener of this.listeners) listener(snapshot);
  }
}
