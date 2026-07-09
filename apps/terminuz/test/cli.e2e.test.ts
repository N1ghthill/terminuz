import { execFile, spawn } from "node:child_process";
import { access, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = path.join(appRoot, "dist", "index.js");
let tempDir: string | undefined;
const localBindingSupported = await canBindLocalBinding();
const gitHttpBackendSupported = localBindingSupported && (await canUseGitHttpBackend());
const describeWithLocalBinding = localBindingSupported ? describe : describe.skip;
const itWithLocalBinding = localBindingSupported ? it : it.skip;
const describeWithGitHttpBackend = gitHttpBackendSupported ? describe : describe.skip;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("terminuz CLI e2e", () => {
  it("prints the published package version", async () => {
    const packageJson = JSON.parse(await readFile(path.join(appRoot, "package.json"), "utf8")) as {
      version: string;
    };

    const result = await runCli(["--version"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe(packageJson.version);
  });

  it("initializes config in a clean worktree", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-cli-"));
    const result = await runCli(["--cwd", tempDir, "init"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain(".terminuz/config.json");
    const config = JSON.parse(
      await readFile(path.join(tempDir, ".terminuz", "config.json"), "utf8"),
    ) as unknown;
    expect(config).toBeTruthy();
  });

  it("prints doctor failures without credentials", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-cli-"));
    const result = await runCli(["--cwd", tempDir, "doctor"], {
      GITHUB_TOKEN: "",
    });
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain("ok smoke:tools:");
    expect(result.stdout).toContain("provider");
    expect(result.stdout).toContain("model");
    expect(result.stdout).toContain("warn github: token missing");
    expect(result.stdout).toContain("Next steps:");
  });

  it("exposes subagents and cache commands", async () => {
    const subagents = await runCli(["subagents", "--help"]);
    expect(subagents.exitCode).toBe(0);
    expect(subagents.stdout).toContain("run real child agent sessions");

    const cache = await runCli(["cache", "--help"]);
    expect(cache.exitCode).toBe(0);
    expect(cache.stdout).toContain("manage persistent tool cache");
    expect(cache.stdout).toContain("tmp");

    const config = await runCli(["config", "--help"]);
    expect(config.exitCode).toBe(0);
    expect(config.stdout).toContain("view and edit .terminuz/config.json");

    const chat = await runCli(["chat", "--help"]);
    expect(chat.exitCode).toBe(0);
    expect(chat.stdout).toContain("--provider <provider>");
    expect(chat.stdout).toContain("--model <model>");
    expect(chat.stdout).toContain("--resume <id>");

    const sessions = await runCli(["sessions", "--help"]);
    expect(sessions.exitCode).toBe(0);
    expect(sessions.stdout).toContain("manage persisted sessions");
    expect(sessions.stdout).toContain("clear");

    const update = await runCli(["update", "--help"]);
    expect(update.exitCode).toBe(0);
    expect(update.stdout).toContain("check for published updates");

    const github = await runCli(["github", "login", "--help"]);
    expect(github.exitCode).toBe(0);
    expect(github.stdout).toContain("OAuth device flow");

    const whoami = await runCli(["github", "whoami", "--help"]);
    expect(whoami.exitCode).toBe(0);
    expect(whoami.stdout).toContain("real GitHub API");
  }, 10_000);

  it("clears temporary tool output files", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-cli-"));
    const tmpOutputDir = path.join(tempDir, ".terminuz", "tmp");
    await mkdir(tmpOutputDir, { recursive: true });
    await writeFile(path.join(tmpOutputDir, "read_file_abc.output"), "temporary output", "utf8");
    await writeFile(path.join(tmpOutputDir, "keep.txt"), "not managed by this command", "utf8");

    const result = await runCli(["--cwd", tempDir, "cache", "tmp", "clear"]);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("cleared (1 file)");
    await expect(access(path.join(tmpOutputDir, "read_file_abc.output"))).rejects.toThrow();
    await expect(access(path.join(tmpOutputDir, "keep.txt"))).resolves.toBeUndefined();
  });

  it("edits config values and masks secrets", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-cli-"));

    const setModel = await runCli([
      "--cwd",
      tempDir,
      "config",
      "set",
      "defaultModel",
      "openai/test-model",
    ]);
    expect(setModel.exitCode).toBe(0);
    const getModel = await runCli(["--cwd", tempDir, "config", "get", "defaultModel"]);
    expect(getModel.exitCode).toBe(0);
    expect(getModel.stdout.trim()).toBe("openai/test-model");

    const setKey = await runCli([
      "--cwd",
      tempDir,
      "config",
      "set",
      "providers.openrouter.apiKey",
      "secret-value",
    ]);
    expect(setKey.exitCode).toBe(0);
    const getKey = await runCli(["--cwd", tempDir, "config", "get", "providers.openrouter.apiKey"]);
    expect(getKey.exitCode).toBe(0);
    expect(getKey.stdout).toContain("[set]");
    expect(getKey.stdout).not.toContain("secret-value");
  });

  it("shows effective config from environment without writing secrets", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-cli-"));
    const show = await runCli(["--cwd", tempDir, "config", "show", "--effective"], {
      TERMINUZ_MODEL: "env/model",
      OPENROUTER_API_KEY: "env-secret",
    });
    expect(show.exitCode).toBe(0);
    expect(show.stdout).toContain("env/model");
    expect(show.stdout).toContain("[set]");
    expect(show.stdout).not.toContain("env-secret");
  });

  it("works from a TypeScript project fixture inside a git repository", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-cli-"));
    await createTypeScriptFixture(tempDir);

    const configPath = await runCli(["--cwd", tempDir, "config", "path"]);
    expect(configPath.exitCode).toBe(0);
    expect(configPath.stdout.trim()).toBe(path.join(tempDir, ".terminuz", "config.json"));

    const setShellAllowlist = await runCli([
      "--cwd",
      tempDir,
      "config",
      "set",
      "permissions.allowShell",
      '["pnpm test","pnpm build","git status"]',
    ]);
    expect(setShellAllowlist.exitCode).toBe(0);

    const showConfig = await runCli(["--cwd", tempDir, "config", "show"]);
    expect(showConfig.exitCode).toBe(0);
    expect(showConfig.stdout).toContain("pnpm test");

    const doctor = await runCli(["--cwd", tempDir, "doctor"]);
    expect(doctor.exitCode).toBe(1);
    expect(doctor.stdout).toContain("ok git:");
    expect(doctor.stdout).toContain("ok smoke:tools:");
    expect(doctor.stdout).toContain("provider");
    expect(doctor.stderr).toBe("");
  });

  it("works from a Python project fixture inside a git repository", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-cli-"));
    await createPythonFixture(tempDir);

    const configPath = await runCli(["--cwd", tempDir, "config", "path"]);
    expect(configPath.exitCode).toBe(0);
    expect(configPath.stdout.trim()).toBe(path.join(tempDir, ".terminuz", "config.json"));

    const init = await runCli(["--cwd", tempDir, "init"]);
    expect(init.exitCode).toBe(0);

    const showConfig = await runCli(["--cwd", tempDir, "config", "show"]);
    expect(showConfig.exitCode).toBe(0);
    expect(showConfig.stdout).toContain("openrouter");

    const setProvider = await runCli([
      "--cwd",
      tempDir,
      "config",
      "set",
      "defaultProvider",
      "anthropic",
    ]);
    expect(setProvider.exitCode).toBe(0);

    const getProvider = await runCli(["--cwd", tempDir, "config", "get", "defaultProvider"]);
    expect(getProvider.exitCode).toBe(0);
    expect(getProvider.stdout.trim()).toBe("anthropic");

    const doctor = await runCli(["--cwd", tempDir, "doctor"]);
    expect(doctor.exitCode).toBe(1);
    expect(doctor.stdout).toContain("ok git:");
    expect(doctor.stdout).toContain("ok smoke:tools:");
    expect(doctor.stdout).toContain("provider");
    expect(doctor.stderr).toBe("");
  }, 10_000);

  itWithLocalBinding(
    "runs GitHub CLI commands against a configured local enterprise API",
    async () => {
      tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-cli-"));
      await createTypeScriptFixture(tempDir);
      const server = await startGitHubTestServer();

      try {
        const setToken = await runCli([
          "--cwd",
          tempDir,
          "config",
          "set",
          "github.token",
          "e2e-token",
        ]);
        expect(setToken.exitCode).toBe(0);
        const setEnterpriseUrl = await runCli([
          "--cwd",
          tempDir,
          "config",
          "set",
          "github.enterpriseUrl",
          server.url,
        ]);
        expect(setEnterpriseUrl.exitCode).toBe(0);

        const whoami = await runCli(["--cwd", tempDir, "github", "whoami"]);
        expect(whoami.exitCode).toBe(0);
        expect(whoami.stdout).toContain("octocat (1)");
        expect(whoami.stdout).toContain(`${server.url}/octocat`);
        expect(whoami.stdout).not.toContain("e2e-token");

        const doctor = await runCli(["--cwd", tempDir, "doctor"]);
        expect(doctor.exitCode).toBe(1);
        expect(doctor.stdout).toContain("ok smoke:tools:");
        expect(doctor.stdout).toContain("ok github: authenticated as octocat");
        expect(doctor.stdout).toContain("provider");
        expect(doctor.stdout).not.toContain("e2e-token");

        const issues = await runCli(["--cwd", tempDir, "github", "issues", "--state", "all"]);
        expect(issues.exitCode).toBe(0);
        expect(issues.stdout).toContain("#7 open E2E issue");
        expect(issues.stdout).toContain(`${server.url}/issues/7`);
        expect(issues.stdout).not.toContain("Existing PR");

        const pr = await runCli([
          "--cwd",
          tempDir,
          "github",
          "pr",
          "--title",
          "E2E PR",
          "--body",
          "Created by CLI e2e",
          "--head",
          "feature/e2e",
          "--base",
          "main",
        ]);
        expect(pr.exitCode).toBe(0);
        expect(pr.stdout).toContain("#9 E2E PR");
        expect(pr.stdout).toContain(`${server.url}/pull/9`);

        expect(server.requests.map((request) => `${request.method} ${request.url}`)).toEqual([
          "GET /api/v3/user",
          "GET /api/v3/user",
          "GET /api/v3/repos/acme/fixture/issues?state=all",
          "POST /api/v3/repos/acme/fixture/pulls",
        ]);
        expect(server.requests[3]?.body).toEqual({
          title: "E2E PR",
          body: "Created by CLI e2e",
          head: "feature/e2e",
          base: "main",
        });
        expect(
          server.requests.every((request) => request.authorization === "Bearer e2e-token"),
        ).toBe(true);
      } finally {
        await server.close();
      }
    },
    15_000,
  );
});

function runCli(
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  const cwdFlagIndex = args.indexOf("--cwd");
  const isolatedSessionDir =
    cwdFlagIndex >= 0 && args[cwdFlagIndex + 1]
      ? path.join(args[cwdFlagIndex + 1]!, ".terminuz")
      : path.join(tmpdir(), "terminuz-cli-e2e-sessions");
  const cleanEnv = {
    TERMINUZ_PROVIDER: "",
    TERMINUZ_MODEL: "",
    TERMINUZ_SESSION_DIR: isolatedSessionDir,
    DEEPCODE_PROVIDER: "",
    DEEPCODE_MODEL: "",
    DEEPCODE_SESSION_DIR: "",
    OPENROUTER_API_KEY: "",
    ANTHROPIC_API_KEY: "",
    OPENAI_API_KEY: "",
    DEEPSEEK_API_KEY: "",
    OPENCODE_API_KEY: "",
    GITHUB_TOKEN: "",
    GITHUB_OAUTH_CLIENT_ID: "",
    GITHUB_OAUTH_SCOPES: "",
  };
  return new Promise((resolve, reject) => {
    execFile(
      process.execPath,
      [bin, ...args],
      { cwd: appRoot, env: { ...process.env, ...cleanEnv, ...env }, timeout: 30_000 },
      (error, stdout, stderr) => {
        const maybeExit = error as (NodeJS.ErrnoException & { code?: number | null }) | null;
        if (error && typeof maybeExit?.code !== "number") {
          reject(error);
          return;
        }
        resolve({
          stdout,
          stderr,
          exitCode: typeof maybeExit?.code === "number" ? maybeExit.code : 0,
        });
      },
    );
  });
}

async function createTypeScriptFixture(root: string): Promise<void> {
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "package.json"),
    `${JSON.stringify(
      {
        type: "module",
        scripts: {
          build: "tsc --noEmit",
          test: "tsc --noEmit",
        },
        devDependencies: {
          typescript: "^5.7.2",
        },
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(root, "tsconfig.json"),
    `${JSON.stringify(
      {
        compilerOptions: {
          strict: true,
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
        },
        include: ["src"],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );
  await writeFile(
    path.join(root, "src", "index.ts"),
    "export function add(left: number, right: number): number {\n  return left + right;\n}\n",
    "utf8",
  );
  await runCommand("git", ["init"], root);
  await runCommand("git", ["remote", "add", "origin", "https://github.com/acme/fixture.git"], root);
}

async function createPythonFixture(root: string): Promise<void> {
  await mkdir(path.join(root, "src"), { recursive: true });
  await writeFile(
    path.join(root, "pyproject.toml"),
    `[build-system]
requires = ["setuptools>=61.0"]
build-backend = "setuptools.backends._legacy:_Backend"

[project]
name = "fixture"
version = "0.1.0"
requires-python = ">=3.10"

[tool.pytest.ini_options]
testpaths = ["tests"]
`,
    "utf8",
  );
  await writeFile(path.join(root, "src", "__init__.py"), "", "utf8");
  await writeFile(
    path.join(root, "src", "calculator.py"),
    `def add(left: float, right: float) -> float:
    return left + right


def subtract(left: float, right: float) -> float:
    return left - right
`,
    "utf8",
  );
  await mkdir(path.join(root, "tests"), { recursive: true });
  await writeFile(path.join(root, "tests", "__init__.py"), "", "utf8");
  await writeFile(
    path.join(root, "tests", "test_calculator.py"),
    `from src.calculator import add, subtract


def test_add():
    assert add(2, 3) == 5


def test_subtract():
    assert subtract(5, 3) == 2
`,
    "utf8",
  );
  await runCommand("git", ["init"], root);
  await runCommand(
    "git",
    ["remote", "add", "origin", "https://github.com/acme/python-fixture.git"],
    root,
  );
}

async function createMcpEchoServer(root: string): Promise<string> {
  const serverPath = path.join(root, "mcp-echo-server.mjs");
  await writeFile(
    serverPath,
    `
let buffer = "";

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffer += chunk;
  while (true) {
    const index = buffer.indexOf("\\n");
    if (index === -1) break;
    const line = buffer.slice(0, index).trim();
    buffer = buffer.slice(index + 1);
    if (line) handleMessage(JSON.parse(line));
  }
});

function respond(id, result) {
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id, result }) + "\\n");
}

function handleMessage(message) {
  if (message.id === undefined) return;
  if (message.method === "initialize") {
    respond(message.id, {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: { name: "mock", version: "1.0.0" },
    });
    return;
  }
  if (message.method === "tools/list") {
    respond(message.id, {
      tools: [
        {
          name: "echo",
          description: "Echo a message",
          inputSchema: {
            type: "object",
            properties: { message: { type: "string" } },
            required: ["message"],
          },
        },
      ],
    });
    return;
  }
  if (message.method === "tools/call" && message.params?.name === "echo") {
    respond(message.id, {
      content: [{ type: "text", text: "mcp echo: " + String(message.params.arguments?.message ?? "") }],
    });
    return;
  }
  process.stdout.write(JSON.stringify({
    jsonrpc: "2.0",
    id: message.id,
    error: { code: -32601, message: "Method not found" },
  }) + "\\n");
}
`.trimStart(),
    "utf8",
  );
  return serverPath;
}

function runCommand(command: string, args: string[], cwd: string): Promise<void> {
  return new Promise((resolve, reject) => {
    execFile(command, args, { cwd, timeout: 30_000 }, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

interface GitHubTestServer {
  url: string;
  requests: Array<{ method: string; url: string; authorization: string; body: unknown }>;
  close: () => Promise<void>;
}

async function startGitHubTestServer(): Promise<GitHubTestServer> {
  const requests: GitHubTestServer["requests"] = [];
  const server = createServer(async (request, response) => {
    requests.push({
      method: request.method ?? "GET",
      url: request.url ?? "",
      authorization: request.headers.authorization ?? "",
      body: await readJsonBody(request),
    });
    handleGitHubApi(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Unable to bind local GitHub test server");
  }
  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

function handleGitHubApi(request: IncomingMessage, response: ServerResponse): void {
  const baseUrl = `http://${request.headers.host}`;
  switch (`${request.method ?? "GET"} ${request.url ?? ""}`) {
    case "GET /api/v3/user":
      sendJson(response, { login: "octocat", id: 1, html_url: `${baseUrl}/octocat` });
      return;
    case "GET /api/v3/repos/acme/fixture/issues?state=all":
      sendJson(response, [
        {
          number: 7,
          title: "E2E issue",
          body: "Exercise GitHub CLI",
          state: "open",
          html_url: `${baseUrl}/issues/7`,
        },
        {
          number: 8,
          title: "Existing PR",
          body: null,
          state: "open",
          html_url: `${baseUrl}/pull/8`,
          pull_request: {},
        },
      ]);
      return;
    case "GET /api/v3/repos/acme/fixture/issues/7":
      sendJson(response, {
        number: 7,
        title: "E2E issue",
        body: "Exercise GitHub CLI",
        state: "open",
        html_url: `${baseUrl}/issues/7`,
      });
      return;
    case "POST /api/v3/repos/acme/fixture/pulls":
      sendJson(response, {
        number: 9,
        title: "E2E PR",
        state: "open",
        html_url: `${baseUrl}/pull/9`,
      });
      return;
    case "POST /api/v3/repos/acme/fixture/issues/7/comments":
      sendJson(response, { id: 42, body: "PR created." });
      return;
    default:
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ message: "not found" }));
  }
}

function sendJson(response: ServerResponse, body: unknown): void {
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  if (chunks.length === 0) return undefined;
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

// ── LLM mock server (OpenAI-compatible SSE) ───────────────────────────────────

interface LLMTestServer {
  url: string;
  calls: Array<{ model: string; messages: unknown[]; hasTools: boolean }>;
  queueText: (text: string) => void;
  queueToolCall: (name: string, args: Record<string, unknown>) => void;
  queueEmpty: () => void;
  queueError: (status: number, message: string) => void;
  close: () => Promise<void>;
}

async function startLLMTestServer(): Promise<LLMTestServer> {
  const calls: LLMTestServer["calls"] = [];
  const responseQueue: Array<(response: ServerResponse) => void> = [];

  const server = createServer(async (request, response) => {
    if (request.url === "/v1/models" && request.method === "GET") {
      sendJson(response, { object: "list", data: [{ id: "test-model", object: "model" }] });
      return;
    }
    if (request.url === "/v1/chat/completions" && request.method === "POST") {
      const body = (await readJsonBody(request)) as Record<string, unknown>;
      calls.push({
        model: String(body.model ?? ""),
        messages: (body.messages as unknown[]) ?? [],
        hasTools: Array.isArray(body.tools) && body.tools.length > 0,
      });
      const responder = responseQueue.shift();
      if (responder) {
        responder(response);
      } else {
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message: "No response queued" } }));
      }
      return;
    }
    response.writeHead(404);
    response.end();
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("LLM server bind failed");

  function sseEvent(data: unknown): string {
    return `data: ${JSON.stringify(data)}\n\n`;
  }

  function sendSse(response: ServerResponse, events: unknown[]): void {
    response.writeHead(200, {
      "content-type": "text/event-stream",
      "transfer-encoding": "chunked",
    });
    for (const event of events) {
      response.write(sseEvent(event));
    }
    response.write("data: [DONE]\n\n");
    response.end();
  }

  const baseChunk = {
    id: "chatcmpl-test",
    object: "chat.completion.chunk",
    created: 1_700_000_000,
    model: "test-model",
  };

  return {
    url: `http://127.0.0.1:${address.port}/v1`,
    calls,

    queueText(text: string) {
      responseQueue.push((response) => {
        sendSse(response, [
          {
            ...baseChunk,
            choices: [
              { index: 0, delta: { role: "assistant", content: text }, finish_reason: null },
            ],
          },
          {
            ...baseChunk,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            usage: { prompt_tokens: 20, completion_tokens: 10 },
          },
        ]);
      });
    },

    queueToolCall(name: string, args: Record<string, unknown>) {
      responseQueue.push((response) => {
        sendSse(response, [
          {
            ...baseChunk,
            choices: [
              {
                index: 0,
                delta: {
                  role: "assistant",
                  content: null,
                  tool_calls: [
                    {
                      index: 0,
                      id: "call_e2e",
                      type: "function",
                      function: { name, arguments: "" },
                    },
                  ],
                },
                finish_reason: null,
              },
            ],
          },
          {
            ...baseChunk,
            choices: [
              {
                index: 0,
                delta: {
                  tool_calls: [{ index: 0, function: { arguments: JSON.stringify(args) } }],
                },
                finish_reason: null,
              },
            ],
          },
          {
            ...baseChunk,
            choices: [{ index: 0, delta: {}, finish_reason: "tool_calls" }],
            usage: { prompt_tokens: 30, completion_tokens: 15 },
          },
        ]);
      });
    },

    queueEmpty() {
      responseQueue.push((response) => {
        sendSse(response, [
          {
            ...baseChunk,
            choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
            usage: { prompt_tokens: 10, completion_tokens: 0 },
          },
        ]);
      });
    },

    queueError(status: number, message: string) {
      responseQueue.push((response) => {
        response.writeHead(status, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: { message } }));
      });
    },

    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

async function configureLLM(
  tempDir: string,
  serverUrl: string,
  extraConfig: Record<string, unknown> = {},
): Promise<void> {
  await writeFixtureConfig(tempDir, {
    defaultProvider: "openrouter",
    defaultModel: "test-model",
    providers: {
      openrouter: {
        apiKey: "fake-e2e-key",
        baseUrl: serverUrl,
      },
    },
    ...extraConfig,
  });
}

async function configureLLMWithoutDefaultModel(tempDir: string, serverUrl: string): Promise<void> {
  await writeFixtureConfig(tempDir, {
    defaultProvider: "openrouter",
    defaultModels: {},
    modeDefaults: {},
    providers: {
      openrouter: {
        apiKey: "fake-e2e-key",
        baseUrl: serverUrl,
      },
    },
  });
}

async function writeFixtureConfig(tempDir: string, config: Record<string, unknown>): Promise<void> {
  const dir = path.join(tempDir, ".terminuz");
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "config.json"), `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

// ── subagents run E2E tests ───────────────────────────────────────────────────

describeWithLocalBinding("deepcode subagents run with mock LLM", () => {
  it("runs a subagent task and returns output", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-subagents-"));
    await createTypeScriptFixture(tempDir);
    const llm = await startLLMTestServer();

    try {
      await configureLLM(tempDir, llm.url);
      llm.queueText("The answer is forty-two.");

      const result = await runCli([
        "--cwd",
        tempDir,
        "subagents",
        "run",
        "--task",
        "what is the answer to life",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("forty-two");
      expect(llm.calls).toHaveLength(1);
    } finally {
      await llm.close();
    }
  }, 20_000);

  it("runs multiple subagent tasks in parallel and returns all outputs", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-subagents-parallel-"));
    await createTypeScriptFixture(tempDir);
    const llm = await startLLMTestServer();

    try {
      await configureLLM(tempDir, llm.url);
      llm.queueText("Result for task one.");
      llm.queueText("Result for task two.");

      const result = await runCli([
        "--cwd",
        tempDir,
        "subagents",
        "run",
        "--task",
        "task one",
        "--task",
        "task two",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Result for task one.");
      expect(result.stdout).toContain("Result for task two.");
      expect(llm.calls).toHaveLength(2);
    } finally {
      await llm.close();
    }
  }, 25_000);
});

// ── deepcode run E2E tests ────────────────────────────────────────────────────

describeWithLocalBinding("deepcode run with mock LLM", () => {
  it("answers a greeting locally without calling the LLM", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-run-"));
    await createTypeScriptFixture(tempDir);
    const llm = await startLLMTestServer();

    try {
      await configureLLM(tempDir, llm.url);

      const result = await runCli(["--cwd", tempDir, "run", "oi", "--yes"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Como posso ajudar");
      expect(llm.calls).toHaveLength(0);
    } finally {
      await llm.close();
    }
  }, 20_000);

  it("streams a direct text response and exits 0", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-run-"));
    await createTypeScriptFixture(tempDir);
    const llm = await startLLMTestServer();

    try {
      await configureLLM(tempDir, llm.url);
      llm.queueText("The answer is forty-two.");

      const result = await runCli(["--cwd", tempDir, "run", "create a file", "--yes"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("forty-two");
      expect(llm.calls).toHaveLength(1);
      expect(llm.calls[0]?.hasTools).toBe(true);
    } finally {
      await llm.close();
    }
  }, 20_000);

  it("executes a read_file tool call and includes result in follow-up", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-run-"));
    await createTypeScriptFixture(tempDir);
    const llm = await startLLMTestServer();

    try {
      await configureLLM(tempDir, llm.url);
      // Build mode always gives tools — no planning call. Two LLM turns:
      // Turn 1: LLM asks to read the file
      llm.queueToolCall("read_file", { path: "src/index.ts" });
      // Turn 2: LLM synthesizes after seeing file content
      llm.queueText("The file exports an add function.");

      const result = await runCli(["--cwd", tempDir, "run", "read src/index.ts", "--yes"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("add function");
      // Two LLM calls: tool-call iteration + synthesis after tool result
      expect(llm.calls).toHaveLength(2);
      // Second call must include the tool result in messages
      const secondMessages = llm.calls[1]?.messages as Array<{ role: string }>;
      expect(secondMessages.some((m) => m.role === "tool")).toBe(true);
    } finally {
      await llm.close();
    }
  }, 20_000);

  it("runs with tools enabled when --mode plan is passed", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-run-"));
    await createTypeScriptFixture(tempDir);
    const llm = await startLLMTestServer();

    try {
      await configureLLM(tempDir, llm.url);
      // Plan mode: no planning phase, goes straight to traditional execution with tools
      llm.queueToolCall("read_file", { path: "src/index.ts" });
      llm.queueText("The workspace contains TypeScript source files.");

      const result = await runCli([
        "--cwd",
        tempDir,
        "run",
        "--mode",
        "plan",
        "analyze repo files",
        "--yes",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("TypeScript");
      // Two calls: tool-call turn + synthesis after tool result
      expect(llm.calls).toHaveLength(2);
      // Second call must include the tool result in messages
      const secondMessages = llm.calls[1]?.messages as Array<{ role: string }>;
      expect(secondMessages.some((m) => m.role === "tool")).toBe(true);
    } finally {
      await llm.close();
    }
  }, 20_000);

  it("executes a write_file tool call and persists the file", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-run-"));
    await createTypeScriptFixture(tempDir);
    const llm = await startLLMTestServer();

    try {
      await configureLLM(tempDir, llm.url);
      // "create src/generated.ts" matches isSimpleDirectCommand → no planning call, goes straight to execution.
      llm.queueToolCall("write_file", {
        path: "src/generated.ts",
        content: "export const ANSWER = 42;\n",
      });
      llm.queueText("Done. Created src/generated.ts.");

      const result = await runCli(["--cwd", tempDir, "run", "create src/generated.ts", "--yes"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Done");
      const written = await readFile(path.join(tempDir, "src", "generated.ts"), "utf8");
      expect(written).toContain("ANSWER = 42");
    } finally {
      await llm.close();
    }
  }, 20_000);

  it("discovers and executes an allowed MCP tool", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-run-"));
    await createTypeScriptFixture(tempDir);
    const llm = await startLLMTestServer();

    try {
      const mcpServerPath = await createMcpEchoServer(tempDir);
      await configureLLM(tempDir, llm.url, {
        mcpServers: [{ name: "mock", command: process.execPath, args: [mcpServerPath] }],
        mcpPermissions: {
          mock__echo: "allow",
        },
      });
      llm.queueToolCall("tool_search", { query: "echo" });
      llm.queueToolCall("mock__echo", { message: "hello" });
      llm.queueText("MCP says hello.");

      const result = await runCli(["--cwd", tempDir, "run", "use mcp echo", "--yes"]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("MCP says hello");
      expect(llm.calls).toHaveLength(3);
      const secondTools = llm.calls[1]?.messages as Array<{ role: string; content: string }>;
      expect(
        secondTools.some(
          (message) => message.role === "tool" && message.content.includes("mock__echo"),
        ),
      ).toBe(true);
      const thirdTools = llm.calls[2]?.messages as Array<{ role: string; content: string }>;
      expect(
        thirdTools.some(
          (message) => message.role === "tool" && message.content.includes("mcp echo: hello"),
        ),
      ).toBe(true);
    } finally {
      await llm.close();
    }
  }, 20_000);

  it("exits non-zero and prints error when provider returns 500", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-run-"));
    await createTypeScriptFixture(tempDir);
    const llm = await startLLMTestServer();

    try {
      await configureLLM(tempDir, llm.url);
      llm.queueError(500, "Internal server error from mock");
      const sessionEnv = { TERMINUZ_SESSION_DIR: path.join(tempDir, ".terminuz") };

      const result = await runCli(["--cwd", tempDir, "run", "anything", "--yes"], sessionEnv);

      expect(result.exitCode).not.toBe(0);
      const sessionsDir = path.join(tempDir, ".terminuz", "sessions");
      const files = (await readdir(sessionsDir)).filter((f) => f.endsWith(".json"));
      expect(files).toHaveLength(1);
      const raw = JSON.parse(await readFile(path.join(sessionsDir, files[0]!), "utf8")) as {
        status: string;
        messages: Array<{ role: string; content: string }>;
      };
      expect(raw.status).toBe("error");
      expect(raw.messages).toEqual([
        expect.objectContaining({ role: "user", content: "anything" }),
      ]);
    } finally {
      await llm.close();
    }
  }, 20_000);

  it("runs with explicit --model even when no default model is configured", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-run-"));
    await createTypeScriptFixture(tempDir);
    const llm = await startLLMTestServer();

    try {
      await configureLLMWithoutDefaultModel(tempDir, llm.url);
      llm.queueText("Using explicit model override.");

      const result = await runCli([
        "--cwd",
        tempDir,
        "run",
        "what model are you using?",
        "--model",
        "test-model",
        "--yes",
      ]);

      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("Using explicit model override.");
      expect(llm.calls).toHaveLength(1);
      expect(llm.calls[0]?.model).toBe("test-model");
    } finally {
      await llm.close();
    }
  }, 20_000);
});

// ── session persistence E2E tests ────────────────────────────────────────────

describeWithLocalBinding("terminuz session persistence", () => {
  it("persists a session file after terminuz run and clears it with sessions clear --all", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-session-"));
    await createTypeScriptFixture(tempDir);
    const llm = await startLLMTestServer();

    try {
      await configureLLM(tempDir, llm.url);
      // "create a file" matches isSimpleDirectCommand → exactly 1 LLM call needed.
      llm.queueText("File created successfully.");

      const sessionEnv = { TERMINUZ_SESSION_DIR: path.join(tempDir, ".terminuz") };
      const run = await runCli(["--cwd", tempDir, "run", "create a file", "--yes"], sessionEnv);
      expect(run.exitCode).toBe(0);

      // Session file must exist in .terminuz/sessions/ and contain the user message.
      const sessionsDir = path.join(tempDir, ".terminuz", "sessions");
      await access(sessionsDir);
      const files = (await readdir(sessionsDir)).filter((f) => f.endsWith(".json"));
      expect(files.length).toBeGreaterThan(0);

      const raw = JSON.parse(await readFile(path.join(sessionsDir, files[0]!), "utf8")) as {
        worktree: string;
        messages: Array<{ role: string; content: string }>;
      };
      expect(raw.worktree).toBe(tempDir);
      expect(raw.messages.some((m) => m.role === "user")).toBe(true);

      // sessions clear --all removes the file.
      const clear = await runCli(["--cwd", tempDir, "sessions", "clear", "--all"], sessionEnv);
      expect(clear.exitCode).toBe(0);
      expect(clear.stdout).toContain("Deleted 1 session");

      const filesAfter = (await readdir(sessionsDir)).filter((f) => f.endsWith(".json"));
      expect(filesAfter).toHaveLength(0);
    } finally {
      await llm.close();
    }
  }, 20_000);

  it("sessions clear --older-than keeps sessions that are not old enough", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-session-keep-"));
    await createTypeScriptFixture(tempDir);
    const llm = await startLLMTestServer();

    try {
      await configureLLM(tempDir, llm.url);
      llm.queueText("Done.");

      const sessionEnv = { TERMINUZ_SESSION_DIR: path.join(tempDir, ".terminuz") };
      const run = await runCli(["--cwd", tempDir, "run", "create a file", "--yes"], sessionEnv);
      expect(run.exitCode).toBe(0);

      const sessionsDir = path.join(tempDir, ".terminuz", "sessions");
      const filesBefore = (await readdir(sessionsDir)).filter((f) => f.endsWith(".json"));
      expect(filesBefore.length).toBeGreaterThan(0);

      // 999-day threshold — the fresh session must survive.
      const clear = await runCli(
        ["--cwd", tempDir, "sessions", "clear", "--older-than", "999"],
        sessionEnv,
      );
      expect(clear.exitCode).toBe(0);
      expect(clear.stdout).toContain("Deleted 0 sessions");

      const filesAfter = (await readdir(sessionsDir)).filter((f) => f.endsWith(".json"));
      expect(filesAfter).toHaveLength(filesBefore.length);
    } finally {
      await llm.close();
    }
  }, 20_000);

  it("sessions clear reports nothing when the sessions directory does not exist", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-session-empty-"));

    const clear = await runCli(["--cwd", tempDir, "sessions", "clear", "--all"]);
    expect(clear.exitCode).toBe(0);
    expect(clear.stdout).toContain("No sessions directory found");
  }, 10_000);
});

// ── deepcode review E2E ──────────────────────────────────────────────────────

describeWithLocalBinding("deepcode review with mock LLM", () => {
  it("reviews local git diff and streams the response", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-review-"));
    await createTypeScriptFixture(tempDir);
    const llm = await startLLMTestServer();

    try {
      await configureLLM(tempDir, llm.url);

      // Commit the initial fixture so HEAD exists.
      await runCommand("git", ["add", "."], tempDir);
      await runCommand(
        "git",
        ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"],
        tempDir,
      );

      // Modify a file to produce a reviewable diff.
      await writeFile(
        path.join(tempDir, "src", "index.ts"),
        "export function add(left: number, right: number): number {\n  return left + right + 1; // off-by-one\n}\n",
        "utf8",
      );

      // mode: "plan" skips the planning phase → exactly 1 LLM call.
      llm.queueText(
        "**Summary**: Increments by 1.\n\n**Issues**: Off-by-one error.\n\n**Verdict**: Has issues.",
      );

      const result = await runCli(["--cwd", tempDir, "review", "--yes"]);

      expect(result.exitCode).toBe(0);
      // The LLM response must be streamed to stdout.
      expect(result.stdout).toContain("Has issues");
      expect(llm.calls).toHaveLength(1);

      // The diff must be present in the prompt sent to the LLM.
      const messages = llm.calls[0]!.messages as Array<{ role: string; content: string }>;
      const userMsg = messages.find((m) => m.role === "user");
      // The diff contains the modified line with the comment we wrote.
      expect(userMsg?.content).toContain("off-by-one");
    } finally {
      await llm.close();
    }
  }, 30_000);

  it("exits 0 with no changes message when there is nothing to diff", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-review-clean-"));
    await createTypeScriptFixture(tempDir);

    await runCommand("git", ["add", "."], tempDir);
    await runCommand(
      "git",
      ["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", "init"],
      tempDir,
    );

    const result = await runCli(["--cwd", tempDir, "review"]);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("No changes to review");
  }, 15_000);
});

// ── github solve E2E ─────────────────────────────────────────────────────────

describeWithGitHttpBackend("deepcode github solve", () => {
  it("creates branch, runs agent, commits, pushes, and creates PR for an issue", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-solve-"));

    // Local bare repo organised as <root>/acme/fixture.git so git-http-backend
    // resolves it with PATH_INFO = /acme/fixture.git
    const repoRoot = path.join(tempDir, "git");
    const bareDir = path.join(repoRoot, "acme", "fixture.git");
    await mkdir(bareDir, { recursive: true });
    await runCommand("git", ["init", "--bare", bareDir], bareDir);
    await runCommand("git", ["config", "http.receivepack", "true"], bareDir);

    // Serve the bare repo over HTTP so the remote URL is parseable as GitHub-style
    const gitServer = await startGitHttpServer(repoRoot);

    // Working repo with remote pointing to the local HTTP git server
    const workDir = path.join(tempDir, "work");
    await mkdir(workDir, { recursive: true });
    await runCommand("git", ["init"], workDir);
    await runCommand(
      "git",
      ["remote", "add", "origin", `${gitServer.url}/acme/fixture.git`],
      workDir,
    );

    await runCommand("git", ["config", "user.email", "test@deepcode.local"], workDir);
    await runCommand("git", ["config", "user.name", "DeepCode Test"], workDir);

    // Seed working tree with TS fixture files
    await mkdir(path.join(workDir, "src"), { recursive: true });
    await writeFile(
      path.join(workDir, "src", "index.ts"),
      "export function add(a: number, b: number): number { return a + b; }\n",
      "utf8",
    );

    // Initial commit + push so origin/main exists (solve does git fetch + checkout)
    await runCommand("git", ["add", "."], workDir);
    await runCommand("git", ["commit", "-m", "Initial commit"], workDir);
    await runCommand("git", ["push", "origin", "HEAD:main"], workDir);

    const ghServer = await startGitHubTestServer();
    const llm = await startLLMTestServer();

    try {
      await runCli(["--cwd", workDir, "config", "set", "github.token", "solve-e2e-token"]);
      await runCli(["--cwd", workDir, "config", "set", "github.enterpriseUrl", ghServer.url]);
      await configureLLM(workDir, llm.url);

      // Build mode: no planning call, goes straight to tool-call loop
      // Agent writes a file so git status detects changes
      llm.queueToolCall("write_file", {
        path: "src/fix.ts",
        content: "// Fix for issue #7\nexport const FIX = true;\n",
      });
      // Agent signals completion
      llm.queueText("Done. Fixed the issue in src/fix.ts.");

      const result = await runCli(["--cwd", workDir, "github", "solve", "7", "--yes"]);

      expect(result.exitCode, `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`).toBe(0);
      expect(result.stdout).toContain("Solving issue #7");
      expect(result.stdout).toContain("PR created:");
      expect(result.stdout).not.toContain("solve-e2e-token");

      const requestLines = ghServer.requests.map((r) => `${r.method} ${r.url}`);
      expect(requestLines).toContain("GET /api/v3/repos/acme/fixture/issues/7");
      expect(requestLines).toContain("POST /api/v3/repos/acme/fixture/pulls");
      expect(requestLines).toContain("POST /api/v3/repos/acme/fixture/issues/7/comments");

      const prRequest = ghServer.requests.find(
        (r) => r.method === "POST" && r.url === "/api/v3/repos/acme/fixture/pulls",
      );
      expect(prRequest?.body).toMatchObject({
        title: expect.stringContaining("E2E issue"),
        head: expect.stringContaining("issue-7"),
        base: "main",
      });

      expect(ghServer.requests.every((r) => r.authorization === "Bearer solve-e2e-token")).toBe(
        true,
      );
    } finally {
      await ghServer.close();
      await llm.close();
      await gitServer.close();
    }
  }, 60_000);
});

// ── Local git HTTP server (git-http-backend CGI) ─────────────────────────────

interface GitHttpServer {
  url: string;
  close: () => Promise<void>;
}

const GIT_HTTP_BACKEND = "/usr/lib/git-core/git-http-backend";

async function startGitHttpServer(projectRoot: string): Promise<GitHttpServer> {
  const server = createServer((request, response) => {
    const urlWithQuery = request.url ?? "/";
    const qMark = urlWithQuery.indexOf("?");
    const pathInfo = qMark >= 0 ? urlWithQuery.slice(0, qMark) : urlWithQuery;
    const queryString = qMark >= 0 ? urlWithQuery.slice(qMark + 1) : "";

    const env: NodeJS.ProcessEnv = {
      ...process.env,
      GIT_HTTP_EXPORT_ALL: "1",
      GIT_HTTP_RECEIVE_PACK: "1",
      GIT_PROJECT_ROOT: projectRoot,
      PATH_INFO: pathInfo,
      REQUEST_METHOD: request.method ?? "GET",
      CONTENT_TYPE: request.headers["content-type"] ?? "",
      QUERY_STRING: queryString,
      HTTP_GIT_PROTOCOL: [request.headers["git-protocol"] ?? ""].flat()[0] ?? "",
      CONTENT_LENGTH: [request.headers["content-length"] ?? ""].flat()[0] ?? "",
    };

    const backend = spawn(GIT_HTTP_BACKEND, [], { env, stdio: ["pipe", "pipe", "pipe"] });
    request.pipe(backend.stdin);

    // CGI response: text headers (\r\n\r\n), then binary body
    let headerBuf = "";
    let headersDone = false;

    backend.stdout.on("data", (chunk: Buffer) => {
      if (headersDone) {
        response.write(chunk);
        return;
      }
      headerBuf += chunk.toString("binary");
      const sep = headerBuf.indexOf("\r\n\r\n");
      if (sep === -1) return;

      headersDone = true;
      let status = 200;
      const headers: [string, string][] = [];

      for (const line of headerBuf.slice(0, sep).split("\r\n")) {
        if (line.startsWith("Status: ")) {
          status = parseInt(line.slice(8));
        } else {
          const colon = line.indexOf(": ");
          if (colon > 0) headers.push([line.slice(0, colon), line.slice(colon + 2)]);
        }
      }

      response.writeHead(status, headers);
      const body = headerBuf.slice(sep + 4);
      if (body) response.write(Buffer.from(body, "binary"));
    });

    backend.stdout.on("end", () => response.end());
    backend.stderr.on("data", (d: Buffer) => process.stderr.write(d));
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Git HTTP server bind failed");

  return {
    url: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

async function canUseGitHttpBackend(): Promise<boolean> {
  try {
    await access(GIT_HTTP_BACKEND);
    return true;
  } catch {
    return false;
  }
}

async function canBindLocalBinding(): Promise<boolean> {
  const server = createServer((_request, response) => response.end("ok"));

  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", () => resolve());
    });
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    return true;
  } catch {
    try {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
    } catch {
      // Ignore close errors during capability probe.
    }
    return false;
  }
}
