import os from "node:os";
import path from "node:path";
import {
  createId,
  nowIso,
  type AgentMode,
  type TerminuzConfig,
  type PermissionMode,
} from "@terminuz/shared";
import { PermissionDeniedError } from "../errors.js";
import type { ApprovalDecision, ApprovalRequest, EventBus } from "../events/event-bus.js";
import type { AuditLogger } from "./audit-logger.js";
import type { PathSecurity } from "./path-security.js";

export type OperationKind = "read" | "write" | "git_local" | "shell" | "mcp" | "dangerous";

export interface PermissionCheck {
  operation: string;
  kind: OperationKind;
  path?: string;
  details?: Record<string, unknown>;
  agentMode?: AgentMode;
  signal?: AbortSignal;
}

interface PendingEntry {
  info: ApprovalRequest;
  deferred: { reject: (reason?: Error) => void };
  timeoutId: ReturnType<typeof setTimeout>;
}

interface PermissionGatewayState {
  sessionAllowSet: Set<string>;
  alwaysAllowSet: Set<string>;
  pendingApprovals: Map<string, PendingEntry>;
}

export interface PermissionOrigin {
  sessionId: string;
  taskId?: string;
  subagent: boolean;
  subagentType?: string;
}

export class PermissionGateway {
  /** Set of operation+path keys that were approved for the current session */
  private readonly sessionAllowSet: Set<string>;
  /** Set of operation+path keys that were approved permanently (always) */
  private readonly alwaysAllowSet: Set<string>;
  /** Map of pending approval requests by request ID */
  private readonly pendingApprovals: Map<string, PendingEntry>;

  constructor(
    private readonly config: TerminuzConfig,
    private readonly pathSecurity: PathSecurity,
    private readonly audit: AuditLogger,
    private readonly eventBus: EventBus,
    private readonly interactive = false,
    state?: PermissionGatewayState,
    private readonly origin?: PermissionOrigin,
  ) {
    this.sessionAllowSet = state?.sessionAllowSet ?? new Set<string>();
    this.alwaysAllowSet = state?.alwaysAllowSet ?? new Set<string>();
    this.pendingApprovals = state?.pendingApprovals ?? new Map<string, PendingEntry>();
  }

  forPathSecurity(pathSecurity: PathSecurity): PermissionGateway {
    return new PermissionGateway(
      this.config,
      pathSecurity,
      this.audit,
      this.eventBus,
      this.interactive,
      {
        sessionAllowSet: this.sessionAllowSet,
        alwaysAllowSet: this.alwaysAllowSet,
        pendingApprovals: this.pendingApprovals,
      },
      this.origin,
    );
  }

  forContext(pathSecurity: PathSecurity, origin: PermissionOrigin): PermissionGateway {
    return new PermissionGateway(
      this.config,
      pathSecurity,
      this.audit,
      this.eventBus,
      this.interactive,
      {
        sessionAllowSet: this.sessionAllowSet,
        alwaysAllowSet: this.alwaysAllowSet,
        pendingApprovals: this.pendingApprovals,
      },
      origin,
    );
  }

  /** Clear all session-scoped permissions (e.g., when session ends) */
  clearSessionAllowSet(): void {
    this.sessionAllowSet.clear();
    // Reject all pending approvals when session is cleared
    this.rejectAllPending("Session cleared");
  }

  /** Reject all pending approval requests (e.g., on session switch or abort) */
  rejectAllPending(reason: string = "Session ended"): void {
    for (const [id, entry] of this.pendingApprovals.entries()) {
      clearTimeout(entry.timeoutId);
      try {
        entry.deferred.reject(new Error(reason));
      } catch {
        // Already resolved/rejected
      }
      this.eventBus.emit("approval:decision", {
        requestId: id,
        decision: { allowed: false, scope: undefined, reason },
      });
    }
    this.pendingApprovals.clear();
  }

  async ensure(check: PermissionCheck): Promise<void> {
    const decision = await this.check(check);
    if (!decision.allowed) {
      throw new PermissionDeniedError(decision.reason ?? `Operation denied: ${check.operation}`);
    }
  }

  async check(check: PermissionCheck): Promise<ApprovalDecision> {
    const pathAccess = check.path ? this.pathSecurity.classify(check.path) : "allowed";
    if (pathAccess === "blacklisted") {
      await this.audit.log({
        operation: check.operation,
        path: check.path,
        result: "denied",
        reason: "path_blacklist",
      });
      return { allowed: false, reason: "Path blocked by blacklist (paths.blacklist)." };
    }

    const mode = this.resolveMode(check);
    if (mode === "deny") {
      await this.audit.log({
        operation: check.operation,
        path: check.path,
        result: "denied",
        reason: "config",
      });
      this.eventBus.emit("activity", {
        id: createId("activity"),
        type: "permission_denied",
        message: `Permission denied by configuration: ${check.operation} (${check.kind})`,
        metadata: { operation: check.operation, kind: check.kind, reason: "config_deny" },
        createdAt: nowIso(),
      });
      return { allowed: false, reason: configDeniedReason(check) };
    }

    // Check permanent (always) allowances before prompting
    const sessionKey = check.path ? `${check.operation}:${check.path}` : `${check.operation}`;
    if (this.alwaysAllowSet.has(sessionKey)) {
      await this.audit.log({
        operation: check.operation,
        path: check.path,
        result: "allowed",
        reason: "always_allow",
      });
      return { allowed: true };
    }

    // Check session-scoped allowances before prompting
    if (this.sessionAllowSet.has(sessionKey)) {
      await this.audit.log({
        operation: check.operation,
        path: check.path,
        result: "allowed",
        reason: "session_allow",
      });
      return { allowed: true };
    }

    if (mode === "allow" && pathAccess === "allowed") {
      await this.audit.log({
        operation: check.operation,
        path: check.path,
        result: "allowed",
      });
      return { allowed: true };
    }

    if (mode === "allow" && pathAccess === "outside_whitelist") {
      if (!this.interactive) {
        await this.audit.log({
          operation: check.operation,
          path: check.path,
          result: "denied",
          reason: "path_outside_whitelist",
        });
        this.eventBus.emit("activity", {
          id: createId("activity"),
          type: "permission_denied",
          message: `Permission denied (path outside whitelist, non-interactive): ${check.operation} (${check.kind})`,
          metadata: {
            operation: check.operation,
            kind: check.kind,
            reason: "path_outside_whitelist",
          },
          createdAt: nowIso(),
        });
        return {
          allowed: false,
          reason: outsideWhitelistReason(check),
        };
      }
    }

    if (!this.interactive) {
      await this.audit.log({
        operation: check.operation,
        path: check.path,
        result: "denied",
        reason: pathAccess === "outside_whitelist" ? "path_outside_whitelist" : "non_interactive",
      });
      this.eventBus.emit("activity", {
        id: createId("activity"),
        type: "permission_denied",
        message: `Permission denied (non-interactive): ${check.operation} (${check.kind})`,
        metadata: {
          operation: check.operation,
          kind: check.kind,
          reason: pathAccess === "outside_whitelist" ? "path_outside_whitelist" : "non_interactive",
        },
        createdAt: nowIso(),
      });
      return {
        allowed: false,
        reason:
          pathAccess === "outside_whitelist"
            ? outsideWhitelistReason(check)
            : nonInteractiveApprovalReason(check),
      };
    }

    const request: ApprovalRequest = {
      id: createId("approval"),
      operation: check.operation,
      level: check.kind,
      path: check.path,
      details: {
        ...check.details,
        ...(pathAccess === "outside_whitelist"
          ? {
              pathPolicy: "outside_whitelist",
              pathMessage: "Path is outside the configured whitelist for this workspace",
            }
          : {}),
      },
      preview: buildApprovalPreview(check),
      createdAt: nowIso(),
      origin: this.origin,
    };

    // Timeout for approval requests (5 minutes)
    const APPROVAL_TIMEOUT_MS = 5 * 60 * 1000;

    // Register the decision listener BEFORE emitting the request so that
    // synchronous handlers (e.g. the --yes auto-approver in run.ts) that
    // immediately re-emit "approval:decision" are guaranteed to be heard.
    const decision = await new Promise<ApprovalDecision>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        cleanup();
        this.pendingApprovals.delete(request.id);
        resolve({ allowed: false, reason: "Approval request timed out (5 minutes)" });
      }, APPROVAL_TIMEOUT_MS);

      // Wire abort signal to reject the promise
      const onAbort = () => {
        clearTimeout(timeoutId);
        cleanup();
        this.pendingApprovals.delete(request.id);
        const abortError = new Error("Approval check aborted");
        abortError.name = "AbortError";
        reject(abortError);
      };
      check.signal?.addEventListener("abort", onAbort, { once: true });

      const cleanup = this.eventBus.on("approval:decision", (payload) => {
        if (payload.requestId === request.id) {
          clearTimeout(timeoutId);
          check.signal?.removeEventListener("abort", onAbort);
          cleanup();
          this.pendingApprovals.delete(request.id);
          resolve(payload.decision);
        }
      });

      // Track pending entry for cleanup
      this.pendingApprovals.set(request.id, {
        info: request,
        deferred: { reject } as any,
        timeoutId,
      });

      this.eventBus.emit("approval:request", request);
    });

    // If session-scoped approval, remember for subsequent checks
    if (decision.allowed && decision.scope === "session") {
      this.sessionAllowSet.add(sessionKey);
    }

    // If permanent approval, remember in alwaysAllowSet
    if (decision.allowed && decision.scope === "always") {
      this.alwaysAllowSet.add(sessionKey);
    }

    await this.audit.log({
      operation: check.operation,
      path: check.path,
      result: decision.allowed ? "approved" : "denied",
      reason: decision.reason,
      details: { requestId: request.id },
    });
    return decision;
  }

  private resolveMode(check: PermissionCheck): PermissionMode {
    const agentMode = check.agentMode ?? this.config.agentMode;
    const agentPermissions = this.config.agentPermissions?.[agentMode];

    // Check if agent has specific permission override
    if (agentPermissions) {
      // Check askBeforeExecute - if true, always ask for shell commands
      if (
        agentPermissions.askBeforeExecute &&
        (check.kind === "shell" || check.kind === "dangerous")
      ) {
        return "ask";
      }

      // Check specific permission overrides
      if (check.kind === "shell" && agentPermissions.shell) {
        return agentPermissions.shell;
      }
      if (check.kind === "dangerous" && agentPermissions.dangerous) {
        return agentPermissions.dangerous;
      }
      if (check.kind === "write" && agentPermissions.write) {
        return agentPermissions.write;
      }
      if (check.kind === "read" && agentPermissions.read) {
        return agentPermissions.read;
      }
      if (check.kind === "git_local" && agentPermissions.gitLocal) {
        return agentPermissions.gitLocal;
      }
    }

    // Fall back to global permissions
    if (check.kind === "mcp") {
      const specificMode = this.resolveMcpToolMode(check);
      if (specificMode) return specificMode;
      return this.config.permissions.mcp;
    }
    if (
      check.kind === "shell" &&
      isShellWhitelisted(this.config.permissions.allowShell, check.operation)
    ) {
      return "allow";
    }
    if (check.kind === "read") return this.config.permissions.read;
    if (check.kind === "write") return this.config.permissions.write;
    if (check.kind === "git_local") return this.config.permissions.gitLocal;
    if (check.kind === "shell") return this.config.permissions.shell;
    return this.config.permissions.dangerous;
  }

  private resolveMcpToolMode(check: PermissionCheck): PermissionMode | undefined {
    const server = check.details?.server;
    const tool = check.details?.tool;
    const qualifiedName =
      typeof server === "string" && typeof tool === "string" ? `${server}__${tool}` : undefined;
    if (qualifiedName && this.config.mcpPermissions[qualifiedName]) {
      return this.config.mcpPermissions[qualifiedName];
    }
    if (this.config.mcpPermissions[check.operation]) {
      return this.config.mcpPermissions[check.operation];
    }
    return undefined;
  }
}

function buildApprovalPreview(check: PermissionCheck): ApprovalRequest["preview"] {
  if (check.kind === "shell" || check.kind === "dangerous") {
    const parts = check.operation.trim().split(/\s+/);
    return {
      type: "shell_command",
      command: parts[0] ?? check.operation,
      args: parts.slice(1, 12),
    };
  }

  if (check.kind === "git_local") {
    return {
      type: "git_operation",
      command: check.operation,
      affectedFiles: typeof check.path === "string" ? [check.path] : [],
    };
  }

  if (check.kind === "mcp") {
    const server = typeof check.details?.server === "string" ? check.details.server : undefined;
    const tool = typeof check.details?.tool === "string" ? check.details.tool : undefined;
    return {
      type: "mcp_tool",
      command: server && tool ? `${server}__${tool}` : check.operation,
    };
  }

  if (check.kind === "write") {
    return {
      type: check.operation === "edit_file" ? "file_edit" : "file_write",
      affectedFiles: typeof check.path === "string" ? [check.path] : [],
    };
  }

  return undefined;
}

function normalizeShellPermissionOperation(operation: string): string {
  return operation.trim().replace(/\s+/g, " ");
}

function isShellWhitelisted(allowList: string[], operation: string): boolean {
  const normalizedOperation = normalizeShellPermissionOperation(operation);
  return allowList.some(
    (allowedOperation) =>
      normalizeShellPermissionOperation(allowedOperation) === normalizedOperation,
  );
}

function configDeniedReason(check: PermissionCheck): string {
  switch (check.kind) {
    case "read":
      return 'Denied by configuration (permissions.read=deny). Set `permissions.read` to `"allow"` in `.terminuz/config.json`, for example: `{"permissions":{"read":"allow"}}`.';
    case "write":
      return 'Denied by configuration (permissions.write=deny). Set `permissions.write` to `"allow"` in `.terminuz/config.json`, for example: `{"permissions":{"write":"allow"}}`.';
    case "git_local":
      return 'Denied by configuration (permissions.gitLocal=deny). Set `permissions.gitLocal` to `"allow"` in `.terminuz/config.json`, for example: `{"permissions":{"gitLocal":"allow"}}`.';
    case "shell":
      return `Denied by configuration (permissions.shell=deny). Set \`permissions.shell\` to \`"allow"\` in \`.terminuz/config.json\`, or add the exact command to \`permissions.allowShell\`, for example: \`{"permissions":{"allowShell":["${normalizeShellPermissionOperation(check.operation)}"]}}\`.`;
    case "mcp":
      return mcpDeniedReason(check);
    case "dangerous":
      return 'Denied by configuration (permissions.dangerous=deny). Re-run with `--yes` or set `permissions.dangerous` to `"ask"` in `.terminuz/config.json`, for example: `{"permissions":{"dangerous":"ask"}}`.';
  }
}

function nonInteractiveApprovalReason(check: PermissionCheck): string {
  switch (check.kind) {
    case "read":
      return 'Read operation requires approval in non-interactive mode. Use the interactive TUI/chat flow or set `permissions.read` to `"allow"` in `.terminuz/config.json`, for example: `{"permissions":{"read":"allow"}}`.';
    case "write":
      return 'Write operation requires approval in non-interactive mode. Re-run with `--yes`, use the interactive TUI/chat flow, or set `permissions.write` to `"allow"` in `.terminuz/config.json`, for example: `{"permissions":{"write":"allow"}}`.';
    case "git_local":
      return 'Git operation requires approval in non-interactive mode. Re-run with `--yes`, use the interactive TUI/chat flow, or set `permissions.gitLocal` to `"allow"` in `.terminuz/config.json`, for example: `{"permissions":{"gitLocal":"allow"}}`.';
    case "shell":
      return `Shell command requires approval in non-interactive mode. Re-run with \`--yes\`, use the interactive TUI/chat flow, or add the exact command to \`permissions.allowShell\` in \`.terminuz/config.json\`, for example: \`{"permissions":{"allowShell":["${normalizeShellPermissionOperation(check.operation)}"]}}\`.`;
    case "mcp":
      return `MCP tool requires approval in non-interactive mode. Re-run with \`--yes --allow-dangerous\`, use the interactive TUI/chat flow, or allow this specific MCP tool in \`.terminuz/config.json\`, for example: \`{"mcpPermissions":{"${mcpPermissionKey(check)}":"allow"}}\`.`;
    case "dangerous":
      return "Dangerous operation requires approval in non-interactive mode. Re-run with `--yes` or use the interactive TUI/chat flow.";
  }
}

function outsideWhitelistReason(check: PermissionCheck): string {
  const example = whitelistExampleForPath(check.path);
  const base = `Path is outside the configured whitelist (\`paths.whitelist\`) and requires approval. Add a matching entry to \`.terminuz/config.json\`, for example: \`{"paths":{"whitelist":["${example}"]}}\`.`;
  if (check.kind === "read") {
    return `${base} Use the interactive TUI/chat flow or extend the whitelist.`;
  }
  if (
    check.kind === "shell" ||
    check.kind === "mcp" ||
    check.kind === "dangerous" ||
    check.kind === "write" ||
    check.kind === "git_local"
  ) {
    return `${base} Re-run with \`--yes\`, use the interactive TUI/chat flow, or extend the whitelist.`;
  }
  return `${base} Use the interactive TUI/chat flow or extend the whitelist.`;
}

function mcpPermissionKey(check: PermissionCheck): string {
  const server = check.details?.server;
  const tool = check.details?.tool;
  if (typeof server === "string" && typeof tool === "string") {
    return `${server}__${tool}`;
  }
  return check.operation;
}

function mcpDeniedReason(check: PermissionCheck): string {
  const key = mcpPermissionKey(check);
  return `Denied by configuration (permissions.mcp=deny or mcpPermissions.${key}=deny). Set \`permissions.mcp\` to \`"ask"\` or allow this specific MCP tool, for example: \`{"mcpPermissions":{"${key}":"allow"}}\`.`;
}

function whitelistExampleForPath(targetPath: string | undefined): string {
  if (!targetPath) {
    return "${WORKTREE}/**";
  }

  const home = process.env.HOME ?? os.homedir();
  const normalizedTarget = path.resolve(targetPath);
  const normalizedHome = path.resolve(home);

  if (normalizedTarget === normalizedHome) {
    return "${HOME}/**";
  }

  if (normalizedTarget.startsWith(`${normalizedHome}${path.sep}`)) {
    const relative = path.relative(normalizedHome, normalizedTarget).replaceAll(path.sep, "/");
    return relative ? `\${HOME}/${relative}/**` : "${HOME}/**";
  }

  const normalizedForConfig = normalizedTarget.replaceAll(path.sep, "/");
  if (normalizedForConfig === "/") {
    return "/**";
  }
  return normalizedForConfig.endsWith("/**") ? normalizedForConfig : `${normalizedForConfig}/**`;
}
