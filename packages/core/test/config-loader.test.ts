import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError } from "../src/errors.js";
import { ConfigLoader } from "../src/config/config-loader.js";

let tempDir: string | undefined;

afterEach(async () => {
  delete process.env.DEEPCODE_PROVIDER;
  delete process.env.DEEPCODE_MODEL;
  delete process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY_FILE;
  delete process.env.GROQ_API_KEY;
  delete process.env.GROQ_API_KEY_FILE;
  delete process.env.GITHUB_TOKEN;
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = undefined;
  }
});

describe("ConfigLoader", () => {
  it("loads file config separately from environment overrides", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    const configPath = path.join(tempDir, ".deepcode", "config.json");
    await new ConfigLoader().init(tempDir);
    await writeFile(
      configPath,
      `${JSON.stringify({ defaultProvider: "openrouter", defaultModel: "file-model", providers: { openrouter: { apiKey: "file-key" } } })}\n`,
      "utf8",
    );

    process.env.DEEPCODE_MODEL = "env-model";
    process.env.OPENROUTER_API_KEY = "env-key";

    const loader = new ConfigLoader();
    await expect(loader.loadFile({ cwd: tempDir })).resolves.toMatchObject({
      defaultModel: "file-model",
      providers: { openrouter: { apiKey: "file-key" } },
    });
    await expect(loader.load({ cwd: tempDir })).resolves.toMatchObject({
      defaultModel: "env-model",
      providers: { openrouter: { apiKey: "env-key" } },
    });
  });

  it("saves validated config without environment overrides", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    const loader = new ConfigLoader();
    const config = await loader.loadFile({ cwd: tempDir });
    process.env.OPENROUTER_API_KEY = "env-key";

    await loader.save(
      { cwd: tempDir },
      {
        ...config,
        defaultModel: "saved-model",
        providers: { ...config.providers, openrouter: { apiKey: "saved-key" } },
      },
    );

    const raw = await readFile(path.join(tempDir, ".deepcode", "config.json"), "utf8");
    expect(raw).toContain("saved-key");
    expect(raw).not.toContain("env-key");
  });

  it("ignores empty environment overrides", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    await new ConfigLoader().init(tempDir);
    process.env.DEEPCODE_MODEL = "";
    process.env.OPENROUTER_API_KEY = "";
    process.env.GROQ_API_KEY = "";
    process.env.GITHUB_TOKEN = "";

    await expect(new ConfigLoader().load({ cwd: tempDir })).resolves.toMatchObject({
      providers: { openrouter: {} },
      github: {},
    });
  });

  it("loads Groq API keys from the environment and configured files", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    await new ConfigLoader().init(tempDir);
    const secretPath = path.join(tempDir, "groq.key");
    await writeFile(secretPath, "groq-file-secret\n", "utf8");
    await writeFile(
      path.join(tempDir, ".deepcode", "config.json"),
      `${JSON.stringify({ providers: { groq: { apiKeyFile: "groq.key" } } })}\n`,
      "utf8",
    );

    await expect(new ConfigLoader().load({ cwd: tempDir })).resolves.toMatchObject({
      providers: { groq: { apiKey: "groq-file-secret", apiKeyFile: "groq.key" } },
    });

    process.env.GROQ_API_KEY = "groq-env-secret";
    await expect(new ConfigLoader().load({ cwd: tempDir })).resolves.toMatchObject({
      providers: { groq: { apiKey: "groq-env-secret", apiKeyFile: "groq.key" } },
    });
  });

  it("initializes the default build turn policy in heuristic mode", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    await new ConfigLoader().init(tempDir);

    await expect(new ConfigLoader().loadFile({ cwd: tempDir })).resolves.toMatchObject({
      buildTurnPolicy: {
        mode: "heuristic",
      },
    });
  });

  it("loads provider API keys from configured files without writing the secret into config", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    await new ConfigLoader().init(tempDir);
    const secretPath = path.join(tempDir, "openrouter.key");
    await writeFile(secretPath, "file-secret\n", "utf8");
    await writeFile(
      path.join(tempDir, ".deepcode", "config.json"),
      `${JSON.stringify({ providers: { openrouter: { apiKeyFile: "openrouter.key" } } })}\n`,
      "utf8",
    );

    const loaded = await new ConfigLoader().load({ cwd: tempDir });

    expect(loaded.providers.openrouter.apiKey).toBe("file-secret");
    expect(loaded.providers.openrouter.apiKeyFile).toBe("openrouter.key");
    const raw = await readFile(path.join(tempDir, ".deepcode", "config.json"), "utf8");
    expect(raw).not.toContain("file-secret");
  });

  it("loads a custom build turn policy from config", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    await new ConfigLoader().init(tempDir);
    await writeFile(
      path.join(tempDir, ".deepcode", "config.json"),
      `${JSON.stringify({
        buildTurnPolicy: {
          mode: "always-tools",
          conversationalPhrases: ["saudacoes"],
          workspaceTerms: ["monorepo"],
          taskVerbs: ["inspecione"],
          fileExtensions: [".feature.ts"],
        },
      })}\n`,
      "utf8",
    );

    await expect(new ConfigLoader().loadFile({ cwd: tempDir })).resolves.toMatchObject({
      buildTurnPolicy: {
        mode: "always-tools",
        conversationalPhrases: ["saudacoes"],
        workspaceTerms: ["monorepo"],
        taskVerbs: ["inspecione"],
        fileExtensions: [".feature.ts"],
      },
    });
  });

  it("loads a custom web policy from config", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    await new ConfigLoader().init(tempDir);
    await writeFile(
      path.join(tempDir, ".deepcode", "config.json"),
      `${JSON.stringify({
        web: {
          allowlist: ["docs\\.example\\.com"],
          blacklist: ["private\\.example\\.com"],
        },
      })}\n`,
      "utf8",
    );

    await expect(new ConfigLoader().loadFile({ cwd: tempDir })).resolves.toMatchObject({
      web: {
        allowlist: ["docs\\.example\\.com"],
        blacklist: ["private\\.example\\.com"],
      },
    });
  });

  it("selects a provider key from a labeled multi-key secret file", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    await new ConfigLoader().init(tempDir);
    const secretPath = path.join(tempDir, "keys.txt");
    await writeFile(
      secretPath,
      ["OpenAI:", "openai-secret", "", "OpenRouter:", "openrouter-secret"].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(tempDir, ".deepcode", "config.json"),
      `${JSON.stringify({
        providers: {
          openrouter: { apiKeyFile: "keys.txt" },
          openai: { apiKeyFile: "keys.txt" },
        },
      })}\n`,
      "utf8",
    );

    const loaded = await new ConfigLoader().load({ cwd: tempDir });

    expect(loaded.providers.openrouter.apiKey).toBe("openrouter-secret");
    expect(loaded.providers.openai.apiKey).toBe("openai-secret");
  });

  it("rejects unknown config keys", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    await new ConfigLoader().init(tempDir);
    await writeFile(
      path.join(tempDir, ".deepcode", "config.json"),
      `${JSON.stringify({ typo: true })}\n`,
      "utf8",
    );
    await expect(new ConfigLoader().loadFile({ cwd: tempDir })).rejects.toBeInstanceOf(ConfigError);
  });
});
