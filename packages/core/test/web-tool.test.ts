import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DeepCodeConfigSchema } from "@deepcode/shared";
import { ToolCache } from "../src/cache/tool-cache.js";
import { EventBus } from "../src/events/event-bus.js";
import { AuditLogger } from "../src/security/audit-logger.js";
import { PathSecurity } from "../src/security/path-security.js";
import { PermissionGateway } from "../src/security/permission-gateway.js";
import { fetchWebTool } from "../src/tools/web-tool.js";

let tempDir: string | undefined;

afterEach(async () => {
  vi.unstubAllGlobals();
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("fetch_web tool", () => {
  it("has correct name and description", () => {
    expect(fetchWebTool.name).toBe("fetch_web");
    expect(fetchWebTool.description).toContain("Fetch content from a URL");
  });

  it("validates URL parameter", () => {
    const result = fetchWebTool.parameters.safeParse({ url: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("accepts valid URL", () => {
    const result = fetchWebTool.parameters.safeParse({ url: "https://example.com" });
    expect(result.success).toBe(true);
  });

  it("accepts optional maxLength", () => {
    const result = fetchWebTool.parameters.safeParse({
      url: "https://example.com",
      maxLength: 5000,
    });
    expect(result.success).toBe(true);
  });

  it("rejects maxLength above 50000", () => {
    const result = fetchWebTool.parameters.safeParse({
      url: "https://example.com",
      maxLength: 100000,
    });
    expect(result.success).toBe(false);
  });

  it("fails on blocked URLs instead of returning an error string", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-web-"));
    const context = createContext(tempDir, {
      web: {
        allowlist: [],
        blacklist: ["blocked\\.example"],
      },
    });

    await expect(
      Effect.runPromise(
        fetchWebTool.execute(
          { url: "https://blocked.example/docs" },
          context,
        ),
      ),
    ).rejects.toThrow("URL https://blocked.example/docs is blocked by web.blacklist");
  });

  it("fails on HTTP error responses instead of returning an error string", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-web-"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("missing", { status: 404, statusText: "Not Found" })),
    );

    await expect(
      Effect.runPromise(
        fetchWebTool.execute(
          { url: "https://example.com/missing" },
          createContext(tempDir),
        ),
      ),
    ).rejects.toThrow("HTTP 404 Not Found from https://example.com/missing");
  });

  it("fails when the URL is outside web.allowlist", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-web-"));

    await expect(
      Effect.runPromise(
        fetchWebTool.execute(
          { url: "https://example.com/docs" },
          createContext(tempDir, {
            web: {
              allowlist: ["docs.example.com"],
              blacklist: [],
            },
          }),
        ),
      ),
    ).rejects.toThrow("URL https://example.com/docs is not permitted by web.allowlist");
  });

  it("matches hostname patterns exactly instead of by substring", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-web-"));

    await expect(
      Effect.runPromise(
        fetchWebTool.execute(
          { url: "https://evil.example/?next=https://docs.example.com" },
          createContext(tempDir, {
            web: {
              allowlist: ["docs.example.com"],
              blacklist: [],
            },
          }),
        ),
      ),
    ).rejects.toThrow("URL https://evil.example/?next=https://docs.example.com is not permitted by web.allowlist");
  });

  it("supports wildcard hostname patterns", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-web-"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200, headers: { "content-type": "text/plain" } })),
    );

    await expect(
      Effect.runPromise(
        fetchWebTool.execute(
          { url: "https://docs.example.com/guides/start" },
          createContext(tempDir, {
            web: {
              allowlist: ["*.example.com"],
              blacklist: [],
            },
          }),
        ),
      ),
    ).resolves.toContain("Fetched https://docs.example.com/guides/start");
  });

  it("supports legacy escaped-dot patterns without regex substring matching", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-web-"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200, headers: { "content-type": "text/plain" } })),
    );

    await expect(
      Effect.runPromise(
        fetchWebTool.execute(
          { url: "https://docs.example.com" },
          createContext(tempDir, {
            web: {
              allowlist: ["docs\\.example\\.com"],
              blacklist: [],
            },
          }),
        ),
      ),
    ).resolves.toContain("Fetched https://docs.example.com");
  });

  it("supports explicit regex patterns when prefixed with regex:", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-web-"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("ok", { status: 200, headers: { "content-type": "text/plain" } })),
    );

    await expect(
      Effect.runPromise(
        fetchWebTool.execute(
          { url: "https://docs.example.com/reference" },
          createContext(tempDir, {
            web: {
              allowlist: ["regex:^https://docs\\.example\\.com/(reference|guides)"],
              blacklist: [],
            },
          }),
        ),
      ),
    ).resolves.toContain("Fetched https://docs.example.com/reference");
  });
});

function createContext(
  worktree: string,
  overrides: Record<string, unknown> = {},
) {
  const config = DeepCodeConfigSchema.parse({
    permissions: {
      read: "allow",
      write: "allow",
      gitLocal: "allow",
      shell: "allow",
      dangerous: "allow",
      allowShell: [],
    },
    paths: { whitelist: ["${WORKTREE}/**"], blacklist: [] },
    web: { allowlist: [], blacklist: [] },
    ...overrides,
  });
  const pathSecurity = new PathSecurity(worktree, config.paths);

  return {
    sessionId: "session_test",
    messageId: "msg_test",
    worktree,
    directory: worktree,
    abortSignal: new AbortController().signal,
    config,
    agentMode: "build" as const,
    cache: new ToolCache(worktree, config),
    permissions: new PermissionGateway(
      config,
      pathSecurity,
      new AuditLogger(worktree),
      new EventBus(),
      false,
    ),
    pathSecurity,
    logActivity: () => {},
  };
}
