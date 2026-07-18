import { mkdir, mkdtemp, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { ConfigError } from "../src/errors.js";
import { ConfigLoader } from "../src/config/config-loader.js";
import { CredentialStore } from "../src/config/credential-store.js";

let tempDir: string | undefined;

function createLoader(): ConfigLoader {
  if (!tempDir) throw new Error("Test temp directory has not been initialized");
  return new ConfigLoader({
    credentialStore: new CredentialStore({
      filePath: path.join(tempDir, "user-config", "credentials.json"),
    }),
  });
}

afterEach(async () => {
  delete process.env.TERMINUZ_PROVIDER;
  delete process.env.TERMINUZ_MODEL;
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
  it("creates private project configuration ignored by Git", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "terminuz-secure-config-"));
    const configPath = await createLoader().init(tempDir);

    const gitignore = await readFile(path.join(tempDir, ".terminuz", ".gitignore"), "utf8");
    expect(gitignore).toContain("config.json");
    if (process.platform !== "win32") {
      expect((await stat(path.dirname(configPath))).mode & 0o777).toBe(0o700);
      expect((await stat(configPath)).mode & 0o777).toBe(0o600);
    }
  });

  it("migrates plaintext credentials out of the project and purges transient copies", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "terminuz-credential-migration-"));
    const configDir = path.join(tempDir, ".terminuz");
    const cacheDir = path.join(configDir, "cache");
    const sessionsDir = path.join(configDir, "sessions");
    await mkdir(cacheDir, { recursive: true });
    await mkdir(sessionsDir, { recursive: true });
    await writeFile(
      path.join(configDir, "config.json"),
      `${JSON.stringify({
        providers: { openrouter: { apiKey: "migrated-provider-secret" } },
        github: { token: "migrated-github-secret" },
      })}\n`,
      "utf8",
    );
    await writeFile(path.join(cacheDir, "copy.json"), "migrated-provider-secret", "utf8");
    const sessionPath = path.join(sessionsDir, "session.json");
    await writeFile(
      sessionPath,
      '{"content":"migrated-provider-secret remains private"}\n',
      "utf8",
    );

    const loaded = await createLoader().loadFile({ cwd: tempDir });

    expect(loaded.providers.openrouter.apiKey).toBe("migrated-provider-secret");
    expect(loaded.github.token).toBe("migrated-github-secret");
    const projectConfig = await readFile(path.join(configDir, "config.json"), "utf8");
    expect(projectConfig).not.toContain("migrated-provider-secret");
    expect(projectConfig).not.toContain("migrated-github-secret");
    await expect(stat(cacheDir)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await readFile(sessionPath, "utf8")).toContain("[redacted] remains private");

    const credentialsPath = path.join(tempDir, "user-config", "credentials.json");
    const stored = await readFile(credentialsPath, "utf8");
    expect(stored).toContain("migrated-provider-secret");
    if (process.platform !== "win32") {
      expect((await stat(credentialsPath)).mode & 0o777).toBe(0o600);
      expect((await stat(path.dirname(credentialsPath))).mode & 0o777).toBe(0o700);
    }
  });

  it("keeps credentials isolated by project in the global store", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "terminuz-scoped-credentials-"));
    const firstProject = path.join(tempDir, "first");
    const secondProject = path.join(tempDir, "second");
    await mkdir(firstProject);
    await mkdir(secondProject);
    const loader = createLoader();

    const firstConfig = await loader.loadFile({ cwd: firstProject });
    await loader.save(
      { cwd: firstProject },
      {
        ...firstConfig,
        providers: {
          ...firstConfig.providers,
          openai: { apiKey: "first-project-secret" },
        },
      },
    );
    const secondConfig = await loader.loadFile({ cwd: secondProject });
    await loader.save(
      { cwd: secondProject },
      {
        ...secondConfig,
        providers: {
          ...secondConfig.providers,
          openai: { apiKey: "second-project-secret" },
        },
      },
    );

    await expect(loader.loadFile({ cwd: firstProject })).resolves.toMatchObject({
      providers: { openai: { apiKey: "first-project-secret" } },
    });
    await expect(loader.loadFile({ cwd: secondProject })).resolves.toMatchObject({
      providers: { openai: { apiKey: "second-project-secret" } },
    });

    const movedProject = path.join(tempDir, "first-moved");
    await rename(firstProject, movedProject);
    await expect(loader.loadFile({ cwd: movedProject })).resolves.toMatchObject({
      providers: { openai: { apiKey: "first-project-secret" } },
    });
  });

  it("loads file config separately from environment overrides", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    const configPath = path.join(tempDir, ".terminuz", "config.json");
    await createLoader().init(tempDir);
    await writeFile(
      configPath,
      `${JSON.stringify({ defaultProvider: "openrouter", defaultModel: "file-model", providers: { openrouter: { apiKey: "file-key" } } })}\n`,
      "utf8",
    );

    process.env.DEEPCODE_MODEL = "env-model";
    process.env.OPENROUTER_API_KEY = "env-key";

    const loader = createLoader();
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
    const loader = createLoader();
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

    const raw = await readFile(path.join(tempDir, ".terminuz", "config.json"), "utf8");
    expect(raw).not.toContain("saved-key");
    expect(raw).not.toContain("env-key");
    await expect(loader.loadFile({ cwd: tempDir })).resolves.toMatchObject({
      providers: { openrouter: { apiKey: "saved-key" } },
    });
  });

  it("ignores empty environment overrides", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    await createLoader().init(tempDir);
    process.env.DEEPCODE_MODEL = "";
    process.env.OPENROUTER_API_KEY = "";
    process.env.GROQ_API_KEY = "";
    process.env.GITHUB_TOKEN = "";

    await expect(createLoader().load({ cwd: tempDir })).resolves.toMatchObject({
      providers: { openrouter: {} },
      github: {},
    });
  });

  it("loads Groq API keys from the environment and configured files", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    await createLoader().init(tempDir);
    const secretPath = path.join(tempDir, "groq.key");
    await writeFile(secretPath, "groq-file-secret\n", "utf8");
    await writeFile(
      path.join(tempDir, ".terminuz", "config.json"),
      `${JSON.stringify({ providers: { groq: { apiKeyFile: "groq.key" } } })}\n`,
      "utf8",
    );

    await expect(createLoader().load({ cwd: tempDir })).resolves.toMatchObject({
      providers: { groq: { apiKey: "groq-file-secret", apiKeyFile: "groq.key" } },
    });

    process.env.GROQ_API_KEY = "groq-env-secret";
    await expect(createLoader().load({ cwd: tempDir })).resolves.toMatchObject({
      providers: { groq: { apiKey: "groq-env-secret", apiKeyFile: "groq.key" } },
    });
  });

  it("initializes the default build turn policy in heuristic mode", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    await createLoader().init(tempDir);

    await expect(createLoader().loadFile({ cwd: tempDir })).resolves.toMatchObject({
      buildTurnPolicy: {
        mode: "heuristic",
      },
    });
  });

  it("loads provider API keys from configured files without writing the secret into config", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    await createLoader().init(tempDir);
    const secretPath = path.join(tempDir, "openrouter.key");
    await writeFile(secretPath, "file-secret\n", "utf8");
    await writeFile(
      path.join(tempDir, ".terminuz", "config.json"),
      `${JSON.stringify({ providers: { openrouter: { apiKeyFile: "openrouter.key" } } })}\n`,
      "utf8",
    );

    const loaded = await createLoader().load({ cwd: tempDir });

    expect(loaded.providers.openrouter.apiKey).toBe("file-secret");
    expect(loaded.providers.openrouter.apiKeyFile).toBe("openrouter.key");
    const raw = await readFile(path.join(tempDir, ".terminuz", "config.json"), "utf8");
    expect(raw).not.toContain("file-secret");
  });

  it("loads a custom build turn policy from config", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    await createLoader().init(tempDir);
    await writeFile(
      path.join(tempDir, ".terminuz", "config.json"),
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

    await expect(createLoader().loadFile({ cwd: tempDir })).resolves.toMatchObject({
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
    await createLoader().init(tempDir);
    await writeFile(
      path.join(tempDir, ".terminuz", "config.json"),
      `${JSON.stringify({
        web: {
          allowlist: ["docs\\.example\\.com"],
          blacklist: ["private\\.example\\.com"],
        },
      })}\n`,
      "utf8",
    );

    await expect(createLoader().loadFile({ cwd: tempDir })).resolves.toMatchObject({
      web: {
        allowlist: ["docs\\.example\\.com"],
        blacklist: ["private\\.example\\.com"],
      },
    });
  });

  it("selects a provider key from a labeled multi-key secret file", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    await createLoader().init(tempDir);
    const secretPath = path.join(tempDir, "keys.txt");
    await writeFile(
      secretPath,
      ["OpenAI:", "openai-secret", "", "OpenRouter:", "openrouter-secret"].join("\n"),
      "utf8",
    );
    await writeFile(
      path.join(tempDir, ".terminuz", "config.json"),
      `${JSON.stringify({
        providers: {
          openrouter: { apiKeyFile: "keys.txt" },
          openai: { apiKeyFile: "keys.txt" },
        },
      })}\n`,
      "utf8",
    );

    const loaded = await createLoader().load({ cwd: tempDir });

    expect(loaded.providers.openrouter.apiKey).toBe("openrouter-secret");
    expect(loaded.providers.openai.apiKey).toBe("openai-secret");
  });

  it("rejects unknown config keys", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "deepcode-config-"));
    await createLoader().init(tempDir);
    await writeFile(
      path.join(tempDir, ".terminuz", "config.json"),
      `${JSON.stringify({ typo: true })}\n`,
      "utf8",
    );
    await expect(createLoader().loadFile({ cwd: tempDir })).rejects.toBeInstanceOf(ConfigError);
  });

  it("reads a legacy .deepcode config when .terminuz is absent", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "terminuz-legacy-config-"));
    const legacyDir = path.join(tempDir, ".deepcode");
    await mkdir(legacyDir, { recursive: true });
    await writeFile(
      path.join(legacyDir, "config.json"),
      `${JSON.stringify({ defaultProvider: "openrouter", defaultModel: "legacy-model" })}\n`,
      "utf8",
    );

    await expect(createLoader().loadFile({ cwd: tempDir })).resolves.toMatchObject({
      defaultProvider: "openrouter",
      defaultModel: "legacy-model",
    });
  });

  it("prefers Terminuz config and environment over legacy values", async () => {
    tempDir = await mkdtemp(path.join(tmpdir(), "terminuz-config-precedence-"));
    const loader = createLoader();
    await loader.init(tempDir);
    const legacyDir = path.join(tempDir, ".deepcode");
    await mkdir(legacyDir, { recursive: true });
    await writeFile(
      path.join(legacyDir, "config.json"),
      `${JSON.stringify({ defaultModel: "legacy-file-model" })}\n`,
      "utf8",
    );
    await writeFile(
      path.join(tempDir, ".terminuz", "config.json"),
      `${JSON.stringify({ defaultModel: "terminuz-file-model" })}\n`,
      "utf8",
    );
    process.env.DEEPCODE_MODEL = "legacy-env-model";
    process.env.TERMINUZ_MODEL = "terminuz-env-model";

    await expect(loader.loadFile({ cwd: tempDir })).resolves.toMatchObject({
      defaultModel: "terminuz-file-model",
    });
    await expect(loader.load({ cwd: tempDir })).resolves.toMatchObject({
      defaultModel: "terminuz-env-model",
    });
  });
});
