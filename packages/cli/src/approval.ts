import type { EventBus } from "@deepcode/core";

export interface AutoApprovalOptions {
  allowDangerous?: boolean;
  reason: string;
}

export function attachAutoApprover(
  events: EventBus,
  options: AutoApprovalOptions,
): void {
  events.on("approval:request", (request) => {
    const isDangerous = request.level === "dangerous" || request.level === "mcp";
    if (isDangerous && !options.allowDangerous) {
      events.emit("approval:decision", {
        requestId: request.id,
        decision: {
          allowed: false,
          reason:
            "Dangerous or external-tool operation requires explicit approval. Re-run with --allow-dangerous if you trust this task.",
        },
      });
      return;
    }

    events.emit("approval:decision", {
      requestId: request.id,
      decision: { allowed: true, reason: options.reason },
    });
  });
}
