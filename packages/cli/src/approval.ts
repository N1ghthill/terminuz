import type { EventBus } from "@deepcode/core";

export interface AutoApprovalOptions {
  allowDangerous?: boolean;
  allowOutsideWorktree?: boolean;
  reason: string;
}

export function attachAutoApprover(
  events: EventBus,
  options: AutoApprovalOptions,
): void {
  events.on("approval:request", (request) => {
    const isOutsideWhitelist = request.details?.pathPolicy === "outside_whitelist";
    if (isOutsideWhitelist && !options.allowOutsideWorktree) {
      events.emit("approval:decision", {
        requestId: request.id,
        decision: {
          allowed: false,
          reason:
            "Path outside the configured whitelist requires explicit approval. Re-run with --allow-outside-worktree if you trust this path.",
        },
      });
      return;
    }

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
