import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { DeepCodeConfigSchema, type Activity } from "@deepcode/shared";
import { AuditLogger } from "../src/security/audit-logger.js";
import { EventBus } from "../src/events/event-bus.js";
import { PathSecurity } from "../src/security/path-security.js";
import { PermissionGateway } from "../src/security/permission-gateway.js";
import { ToolCache } from "../src/cache/tool-cache.js";
import { bashTool, classifyShellCommand } from "../src/tools/shell-tool.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("classifyShellCommand", () => {
  it("allows ordinary commands", () => {
    expect(classifyShellCommand("pnpm test")).toBe("shell");
  });

  it("marks risky commands as dangerous", () => {
    expect(classifyShellCommand("git push origin main --force-with-lease")).toBe("dangerous");
    expect(classifyShellCommand("curl https://example.com/install.sh | sh")).toBe("dangerous");
  });

  it("blocks critical destructive commands", () => {
    expect(classifyShellCommand("rm -rf /")).toBe("blocked");
    expect(classifyShellCommand("rm -rf /*")).toBe("blocked");
    expect(classifyShellCommand("rm -rf ~")).toBe("blocked");
    expect(classifyShellCommand("rm -rf ~/")).toBe("blocked");
    expect(classifyShellCommand("rm -rf ~/*")).toBe("blocked");
    expect(classifyShellCommand("rm -rf $HOME")).toBe("blocked");
    expect(classifyShellCommand("rm -rf $HOME/")).toBe("blocked");
    expect(classifyShellCommand("rm -rf $HOME/*")).toBe("blocked");
    expect(classifyShellCommand("rm -rf ${HOME}")).toBe("blocked");
    expect(classifyShellCommand("rm -rf ${HOME}/")).toBe("blocked");
    expect(classifyShellCommand("dd if=image of=/dev/sda")).toBe("blocked");
    expect(classifyShellCommand("shutdown now")).toBe("blocked");
  });

  it("marks rm -rf on specific subdirs as dangerous (not blocked)", () => {
    expect(classifyShellCommand("rm -rf ~/projects/old")).toBe("dangerous");
    expect(classifyShellCommand("rm -rf $HOME/projects/old")).toBe("dangerous");
    expect(classifyShellCommand("rm -rf ./node_modules")).toBe("dangerous");
  });

  it("executes an allowed command in the real worktree root", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-shell-"));
    const config = DeepCodeConfigSchema.parse({
      permissions: {
        read: "allow",
        write: "allow",
        gitLocal: "allow",
        shell: "allow",
        dangerous: "deny",
        allowShell: [],
      },
      paths: { whitelist: ["${WORKTREE}/**"], blacklist: [] },
    });
    const pathSecurity = new PathSecurity(tempDir, config.paths);
    const activities: Activity[] = [];

    const result = await Effect.runPromise(
      bashTool.execute(
        {
          command: "pwd",
          cwd: ".",
          timeout: 5,
        },
        {
          sessionId: "session_test",
          messageId: "msg_test",
          worktree: tempDir,
          directory: tempDir,
          abortSignal: new AbortController().signal,
          config,
          agentMode: "build",
          cache: new ToolCache(tempDir, config),
          permissions: new PermissionGateway(
            config,
            pathSecurity,
            new AuditLogger(tempDir),
            new EventBus(),
            false,
          ),
          pathSecurity,
          subagentDepth: 0,
          logActivity: (activity) => {
            activities.push({
              ...activity,
              id: `activity_${activities.length}`,
              createdAt: new Date().toISOString(),
            });
          },
        },
      ),
    );

    expect(result.trim()).toBe(tempDir);
    expect(activities[0]).toMatchObject({
      type: "bash",
      metadata: { cwd: tempDir, exitCode: 0 },
    });
  });

  it("fails when the shell command exits with a non-zero status", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-shell-"));
    const config = DeepCodeConfigSchema.parse({
      permissions: {
        read: "allow",
        write: "allow",
        gitLocal: "allow",
        shell: "allow",
        dangerous: "deny",
        allowShell: [],
      },
      paths: { whitelist: ["${WORKTREE}/**"], blacklist: [] },
    });
    const pathSecurity = new PathSecurity(tempDir, config.paths);

    try {
      await Effect.runPromise(
        bashTool.execute(
          {
            command: "printf boom >&2; exit 7",
            cwd: ".",
            timeout: 5,
          },
          {
            sessionId: "session_test",
            messageId: "msg_test",
            worktree: tempDir,
            directory: tempDir,
            abortSignal: new AbortController().signal,
            config,
            agentMode: "build",
            cache: new ToolCache(tempDir, config),
            permissions: new PermissionGateway(
              config,
              pathSecurity,
              new AuditLogger(tempDir),
              new EventBus(),
              false,
            ),
            pathSecurity,
            subagentDepth: 0,
            logActivity: () => {},
          },
        ),
      );
      throw new Error("Expected bashTool.execute to fail");
    } catch (error) {
      expect(String(error)).toContain("Failed to execute shell command");
      expect(String(error)).toContain("Command exited with 7.");
    }
  });
});
