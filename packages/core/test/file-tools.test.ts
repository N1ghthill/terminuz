import { mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { Effect } from "effect";
import { afterEach, describe, expect, it } from "vitest";
import { DeepCodeConfigSchema } from "@deepcode/shared";
import { AuditLogger } from "../src/security/audit-logger.js";
import { EventBus } from "../src/events/event-bus.js";
import { PathSecurity } from "../src/security/path-security.js";
import { PermissionGateway } from "../src/security/permission-gateway.js";
import { ToolCache } from "../src/cache/tool-cache.js";
import { listDirTool } from "../src/tools/file-tools.js";

let tempDir: string | undefined;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("listDirTool", () => {
  it("lists directories even when they contain broken symlinks", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-files-"));
    await writeFile(path.join(tempDir, "notes.txt"), "hello\n", "utf8");
    await symlink(path.join(tempDir, "missing-target"), path.join(tempDir, ".steampath"));

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

    const output = await Effect.runPromise(
      listDirTool.execute(
        { path: "." },
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

    expect(output).toContain("notes.txt");
    expect(output).toContain(".steampath");
    expect(output).toContain("link");
  });
});
