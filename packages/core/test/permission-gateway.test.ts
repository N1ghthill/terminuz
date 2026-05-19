import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { DeepCodeConfigSchema, type DeepCodeConfig } from "@deepcode/shared";
import { EventBus } from "../src/events/event-bus.js";
import { AuditLogger } from "../src/security/audit-logger.js";
import { PathSecurity } from "../src/security/path-security.js";
import { PermissionGateway } from "../src/security/permission-gateway.js";

let worktree: string | undefined;
let externalDir: string | undefined;

afterEach(async () => {
  if (worktree) {
    await rm(worktree, { recursive: true, force: true });
    worktree = undefined;
  }
  if (externalDir) {
    await rm(externalDir, { recursive: true, force: true });
    externalDir = undefined;
  }
});

describe("PermissionGateway", () => {
  it("requests interactive approval for paths outside the whitelist", async () => {
    worktree = await mkdtemp(path.join(tmpdir(), "deepcode-perm-"));
    externalDir = await mkdtemp(path.join(tmpdir(), "deepcode-external-"));

    const config = createConfig();
    const events = new EventBus();
    let requestSeen = false;
    events.on("approval:request", (request) => {
      requestSeen = true;
      expect(request.path).toBe(externalDir);
      expect(request.details?.pathPolicy).toBe("outside_whitelist");
      globalThis.queueMicrotask(() => {
        events.emit("approval:decision", {
          requestId: request.id,
          decision: { allowed: true, reason: "Approved in test" },
        });
      });
    });

    const gateway = new PermissionGateway(
      config,
      new PathSecurity(worktree, config.paths),
      new AuditLogger(worktree),
      events,
      true,
    );

    await expect(
      gateway.check({ operation: "read_file", kind: "read", path: externalDir }),
    ).resolves.toEqual({ allowed: true, reason: "Approved in test" });
    expect(requestSeen).toBe(true);
  });

  it("denies directory listing outside the whitelist in non-interactive mode", async () => {
    worktree = await mkdtemp(path.join(tmpdir(), "deepcode-perm-"));
    externalDir = await mkdtemp(path.join(tmpdir(), "deepcode-external-"));

    const config = createConfig();
    const gateway = new PermissionGateway(
      config,
      new PathSecurity(worktree, config.paths),
      new AuditLogger(worktree),
      new EventBus(),
      false,
    );

    await expect(
      gateway.check({ operation: "list_dir", kind: "read", path: externalDir }),
    ).resolves.toEqual({
      allowed: false,
      reason: `Path is outside the configured whitelist (\`paths.whitelist\`) and requires approval. Add a matching entry to \`.deepcode/config.json\`, for example: \`{"paths":{"whitelist":["${externalDir!.replaceAll(path.sep, "/")}/**"]}}\`. Use the interactive TUI/chat flow or extend the whitelist.`,
    });
  });

  it("returns an exact whitelist example for outside-whitelist reads", async () => {
    worktree = await mkdtemp(path.join(tmpdir(), "deepcode-perm-"));
    externalDir = await mkdtemp(path.join(tmpdir(), "deepcode-external-"));

    const config = createConfig({
      permissions: {
        read: "allow",
      },
    });
    const gateway = new PermissionGateway(
      config,
      new PathSecurity(worktree, config.paths),
      new AuditLogger(worktree),
      new EventBus(),
      false,
    );

    await expect(
      gateway.check({ operation: "read_file", kind: "read", path: externalDir }),
    ).resolves.toEqual({
      allowed: false,
      reason: `Path is outside the configured whitelist (\`paths.whitelist\`) and requires approval. Add a matching entry to \`.deepcode/config.json\`, for example: \`{"paths":{"whitelist":["${externalDir!.replaceAll(path.sep, "/")}/**"]}}\`. Use the interactive TUI/chat flow or extend the whitelist.`,
    });
  });

  it("still hard-blocks blacklisted paths", async () => {
    worktree = await mkdtemp(path.join(tmpdir(), "deepcode-perm-"));
    const config = createConfig();
    const gateway = new PermissionGateway(
      config,
      new PathSecurity(worktree, config.paths),
      new AuditLogger(worktree),
      new EventBus(),
      true,
    );

    await expect(
      gateway.check({ operation: "read_file", kind: "read", path: path.join(worktree, ".env") }),
    ).resolves.toEqual({ allowed: false, reason: "Path blocked by blacklist (paths.blacklist)." });
  });

  it("normalizes shell allowlist entries before matching commands", async () => {
    worktree = await mkdtemp(path.join(tmpdir(), "deepcode-perm-"));
    const config = createConfig({
      permissions: {
        shell: "ask",
        allowShell: ["pnpm test"],
      },
    });
    const gateway = new PermissionGateway(
      config,
      new PathSecurity(worktree, config.paths),
      new AuditLogger(worktree),
      new EventBus(),
      false,
    );

    await expect(
      gateway.check({ operation: "pnpm    test", kind: "shell", path: worktree }),
    ).resolves.toEqual({ allowed: true });
  });

  it("can re-scope path checks to a selected project", async () => {
    worktree = await mkdtemp(path.join(tmpdir(), "deepcode-home-"));
    const selected = path.join(worktree, "repos", "app");
    externalDir = await mkdtemp(path.join(tmpdir(), "deepcode-external-"));

    const config = createConfig();
    const rootSecurity = new PathSecurity(worktree, config.paths);
    const gateway = new PermissionGateway(
      config,
      rootSecurity,
      new AuditLogger(worktree),
      new EventBus(),
      false,
    ).forPathSecurity(rootSecurity.forWorktree(selected));

    await expect(
      gateway.check({ operation: "list_dir", kind: "read", path: selected }),
    ).resolves.toEqual({ allowed: true });
    await expect(
      gateway.check({ operation: "list_dir", kind: "read", path: worktree }),
    ).resolves.toMatchObject({ allowed: false });
  });

  it("returns actionable guidance for non-interactive shell approvals", async () => {
    worktree = await mkdtemp(path.join(tmpdir(), "deepcode-perm-"));
    const config = createConfig({
      permissions: {
        shell: "ask",
        allowShell: [],
      },
    });
    const gateway = new PermissionGateway(
      config,
      new PathSecurity(worktree, config.paths),
      new AuditLogger(worktree),
      new EventBus(),
      false,
    );

    await expect(
      gateway.check({ operation: "pnpm lint", kind: "shell", path: worktree }),
    ).resolves.toEqual({
      allowed: false,
      reason:
        "Shell command requires approval in non-interactive mode. Re-run with `--yes`, use the interactive TUI/chat flow, or add the exact command to `permissions.allowShell` in `.deepcode/config.json`, for example: `{\"permissions\":{\"allowShell\":[\"pnpm lint\"]}}`.",
    });
  });
});

function createConfig(overrides: Record<string, unknown> = {}): DeepCodeConfig {
  return DeepCodeConfigSchema.parse({
    defaultProvider: "openrouter",
    defaultModel: "test-model",
    providerRetries: 0,
    permissions: {
      read: "allow",
      write: "allow",
      gitLocal: "allow",
      shell: "ask",
      dangerous: "deny",
      allowShell: [],
    },
    paths: {
      whitelist: ["${WORKTREE}/**"],
      blacklist: ["**/.env"],
    },
    ...overrides,
  });
}
