import { chmod, mkdir, readFile, readdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  TerminuzConfigSchema,
  getLegacyProjectDataPath,
  getLegacyProjectDataDir,
  getProductEnv,
  getProjectDataDir,
  getProjectDataPath,
  PRODUCT_ENV,
  PRODUCT_IDENTITY,
  PROVIDER_IDS,
  type TerminuzConfig,
  writeFileAtomic,
} from "@terminuz/shared";
import { ConfigError } from "../errors.js";
import {
  CredentialStore,
  resolveCredentialScope,
  type ProjectCredentials,
} from "./credential-store.js";

export interface LoadConfigOptions {
  cwd: string;
  configPath?: string;
}

export interface ConfigLoaderOptions {
  credentialStore?: CredentialStore;
}

export class ConfigLoader {
  private readonly credentialStore: CredentialStore;

  constructor(options: ConfigLoaderOptions = {}) {
    this.credentialStore = options.credentialStore ?? new CredentialStore();
  }

  resolveCredentialStorePath(): string {
    return this.credentialStore.filePath;
  }

  resolveConfigPath(options: LoadConfigOptions): string {
    return options.configPath
      ? path.resolve(options.configPath)
      : getProjectDataPath(options.cwd, "config.json");
  }

  resolveConfigReadPath(options: LoadConfigOptions): string {
    const preferred = this.resolveConfigPath(options);
    if (options.configPath || existsSync(preferred)) {
      return preferred;
    }
    const legacy = getLegacyProjectDataPath(options.cwd, "config.json");
    return existsSync(legacy) ? legacy : preferred;
  }

  async load(options: LoadConfigOptions): Promise<TerminuzConfig> {
    const configPath = this.resolveConfigReadPath(options);
    const rawFile = await this.loadFile(options);
    const configDirName = path.basename(path.dirname(configPath));
    const cwd =
      configDirName === PRODUCT_IDENTITY.projectDirName ||
      configDirName === PRODUCT_IDENTITY.legacy.projectDirName
        ? path.resolve(options.cwd)
        : path.dirname(configPath);
    const openrouterApiKeyFile =
      parseOptionalString(process.env.OPENROUTER_API_KEY_FILE) ??
      rawFile.providers?.openrouter?.apiKeyFile;
    const anthropicApiKeyFile =
      parseOptionalString(process.env.ANTHROPIC_API_KEY_FILE) ??
      rawFile.providers?.anthropic?.apiKeyFile;
    const openaiApiKeyFile =
      parseOptionalString(process.env.OPENAI_API_KEY_FILE) ?? rawFile.providers?.openai?.apiKeyFile;
    const deepseekApiKeyFile =
      parseOptionalString(process.env.DEEPSEEK_API_KEY_FILE) ??
      rawFile.providers?.deepseek?.apiKeyFile;
    const opencodeApiKeyFile =
      parseOptionalString(process.env.OPENCODE_API_KEY_FILE) ??
      rawFile.providers?.opencode?.apiKeyFile;
    const groqApiKeyFile =
      parseOptionalString(process.env.GROQ_API_KEY_FILE) ?? rawFile.providers?.groq?.apiKeyFile;
    const merged = {
      ...rawFile,
      defaultProvider:
        parseOptionalString(getProductEnv(PRODUCT_ENV.provider, PRODUCT_ENV.legacy.provider)) ??
        rawFile.defaultProvider,
      defaultModel:
        parseOptionalString(getProductEnv(PRODUCT_ENV.model, PRODUCT_ENV.legacy.model)) ??
        rawFile.defaultModel,
      cache: {
        ...rawFile.cache,
        enabled: parseOptionalBoolean(process.env.CACHE_ENABLED) ?? rawFile.cache?.enabled,
        ttlSeconds: parseOptionalNumber(process.env.CACHE_TTL_SECONDS) ?? rawFile.cache?.ttlSeconds,
      },
      providers: {
        ...rawFile.providers,
        openrouter: {
          ...rawFile.providers?.openrouter,
          apiKeyFile: openrouterApiKeyFile,
          apiKey:
            parseOptionalString(process.env.OPENROUTER_API_KEY) ??
            rawFile.providers?.openrouter?.apiKey ??
            (await this.readSecretFile(openrouterApiKeyFile, cwd, [
              "openrouter",
              "OPENROUTER_API_KEY",
            ])),
        },
        anthropic: {
          ...rawFile.providers?.anthropic,
          apiKeyFile: anthropicApiKeyFile,
          apiKey:
            parseOptionalString(process.env.ANTHROPIC_API_KEY) ??
            rawFile.providers?.anthropic?.apiKey ??
            (await this.readSecretFile(anthropicApiKeyFile, cwd, [
              "anthropic",
              "claude",
              "ANTHROPIC_API_KEY",
            ])),
        },
        openai: {
          ...rawFile.providers?.openai,
          apiKeyFile: openaiApiKeyFile,
          apiKey:
            parseOptionalString(process.env.OPENAI_API_KEY) ??
            rawFile.providers?.openai?.apiKey ??
            (await this.readSecretFile(openaiApiKeyFile, cwd, ["openai", "OPENAI_API_KEY"])),
        },
        deepseek: {
          ...rawFile.providers?.deepseek,
          apiKeyFile: deepseekApiKeyFile,
          apiKey:
            parseOptionalString(process.env.DEEPSEEK_API_KEY) ??
            rawFile.providers?.deepseek?.apiKey ??
            (await this.readSecretFile(deepseekApiKeyFile, cwd, ["deepseek", "DEEPSEEK_API_KEY"])),
        },
        opencode: {
          ...rawFile.providers?.opencode,
          apiKeyFile: opencodeApiKeyFile,
          apiKey:
            parseOptionalString(process.env.OPENCODE_API_KEY) ??
            rawFile.providers?.opencode?.apiKey ??
            (await this.readSecretFile(opencodeApiKeyFile, cwd, [
              "opencode",
              "opencode(go)",
              "OPENCODE_API_KEY",
            ])),
        },
        groq: {
          ...rawFile.providers?.groq,
          apiKeyFile: groqApiKeyFile,
          apiKey:
            parseOptionalString(process.env.GROQ_API_KEY) ??
            rawFile.providers?.groq?.apiKey ??
            (await this.readSecretFile(groqApiKeyFile, cwd, ["groq", "GROQ_API_KEY"])),
        },
      },
      github: {
        ...rawFile.github,
        token: parseOptionalString(process.env.GITHUB_TOKEN) ?? rawFile.github?.token,
        oauthClientId:
          parseOptionalString(process.env.GITHUB_OAUTH_CLIENT_ID) ?? rawFile.github?.oauthClientId,
        oauthScopes:
          parseOptionalList(process.env.GITHUB_OAUTH_SCOPES) ?? rawFile.github?.oauthScopes,
      },
      tui: {
        ...rawFile.tui,
        theme:
          parseOptionalString(getProductEnv(PRODUCT_ENV.theme, PRODUCT_ENV.legacy.theme)) ??
          rawFile.tui?.theme,
        compactMode:
          parseOptionalBoolean(getProductEnv(PRODUCT_ENV.compact, PRODUCT_ENV.legacy.compact)) ??
          rawFile.tui?.compactMode,
      },
    };

    const parsed = TerminuzConfigSchema.safeParse(merged);
    if (!parsed.success) {
      throw new ConfigError(`Invalid Terminuz config: ${parsed.error.message}`, parsed.error);
    }
    return parsed.data;
  }

  async loadFile(options: LoadConfigOptions): Promise<TerminuzConfig> {
    const configPath = this.resolveConfigReadPath(options);
    const rawFile = await this.readOptionalJson(configPath);
    const scope = await resolveCredentialScope(options.cwd, options.configPath);
    if (!options.configPath) {
      await ensureProjectGitignore(getProjectDataDir(options.cwd));
    }
    const storedCredentials = await this.credentialStore.load(scope);
    const fileCredentials = extractCredentials(rawFile);
    const hasFileCredentials = hasCredentials(fileCredentials);
    const effectiveCredentials = hasFileCredentials
      ? mergeCredentials(storedCredentials, fileCredentials)
      : storedCredentials;

    if (hasFileCredentials) {
      await this.credentialStore.replace(scope, effectiveCredentials);
      await sanitizePersistedSecretCopies(options.cwd, credentialValues(fileCredentials));
      const sanitized = stripCredentials(rawFile);
      await this.writeSecureConfig(configPath, sanitized, options.cwd);
    } else if (existsSync(configPath)) {
      await secureExistingConfig(configPath, options.cwd);
    }

    const parsed = TerminuzConfigSchema.safeParse(
      applyCredentials(stripCredentials(rawFile), effectiveCredentials),
    );
    if (!parsed.success) {
      throw new ConfigError(`Invalid Terminuz config: ${parsed.error.message}`, parsed.error);
    }
    return parsed.data;
  }

  async save(options: LoadConfigOptions, config: TerminuzConfig): Promise<string> {
    const configPath = this.resolveConfigPath(options);
    const parsed = TerminuzConfigSchema.safeParse(config);
    if (!parsed.success) {
      throw new ConfigError(`Invalid Terminuz config: ${parsed.error.message}`, parsed.error);
    }
    const credentials = extractCredentials(parsed.data);
    await this.credentialStore.replace(
      await resolveCredentialScope(options.cwd, options.configPath),
      credentials,
    );
    await this.writeSecureConfig(configPath, stripCredentials(parsed.data), options.cwd);
    return configPath;
  }

  async init(cwd: string): Promise<string> {
    const dir = getProjectDataDir(cwd);
    const configPath = path.join(dir, "config.json");
    await ensurePrivateDirectory(dir);
    const config = TerminuzConfigSchema.parse({});
    await writeFileAtomic(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    await ensureProjectGitignore(dir);

    return configPath;
  }

  private async writeSecureConfig(
    configPath: string,
    config: Record<string, any>,
    cwd: string,
  ): Promise<void> {
    const directory = path.dirname(configPath);
    const isProjectDataDirectory = [getProjectDataDir(cwd), getLegacyProjectDataDir(cwd)].includes(
      directory,
    );
    if (isProjectDataDirectory) {
      await ensurePrivateDirectory(directory);
    } else {
      await mkdir(directory, { recursive: true });
    }
    await writeFileAtomic(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    if (directory === getProjectDataDir(cwd)) {
      await ensureProjectGitignore(directory);
    }
  }

  private async readOptionalJson(filePath: string): Promise<Record<string, any>> {
    try {
      return JSON.parse(await readFile(filePath, "utf8")) as Record<string, any>;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return {};
      }
      throw new ConfigError(`Unable to read config at ${filePath}`, error);
    }
  }

  private async readSecretFile(
    filePath: string | undefined,
    cwd: string,
    labels: string[],
  ): Promise<string | undefined> {
    const resolved = resolveUserPath(filePath, cwd);
    if (!resolved) return undefined;
    try {
      return parseSecretFile(await readFile(resolved, "utf8"), labels);
    } catch (error) {
      throw new ConfigError(`Unable to read secret file at ${resolved}`, error);
    }
  }
}

const PROJECT_GITIGNORE_LINES = [
  "# Terminuz local configuration and runtime data - do not commit",
  "config.json",
  "credential-scope",
  "sessions/",
  "telemetry/",
  "cache/",
  "exports/",
  "tmp/",
  "*.log",
  "ui-state.json",
  "tui-provider.json",
];

function extractCredentials(config: Record<string, any>): ProjectCredentials {
  const providers: ProjectCredentials["providers"] = {};
  for (const provider of PROVIDER_IDS) {
    const apiKey = parseOptionalString(config.providers?.[provider]?.apiKey);
    if (apiKey) providers[provider] = apiKey;
  }
  return {
    providers,
    githubToken: parseOptionalString(config.github?.token),
  };
}

function stripCredentials(config: Record<string, any>): Record<string, any> {
  const sanitized = structuredClone(config);
  if (sanitized.providers && typeof sanitized.providers === "object") {
    for (const provider of PROVIDER_IDS) {
      const providerConfig = sanitized.providers[provider];
      if (providerConfig && typeof providerConfig === "object") {
        delete providerConfig.apiKey;
      }
    }
  }
  if (sanitized.github && typeof sanitized.github === "object") {
    delete sanitized.github.token;
  }
  return sanitized;
}

function applyCredentials(
  config: Record<string, any>,
  credentials: ProjectCredentials,
): Record<string, any> {
  const merged = structuredClone(config);
  merged.providers = { ...merged.providers };
  for (const [provider, apiKey] of Object.entries(credentials.providers)) {
    merged.providers[provider] = { ...merged.providers[provider], apiKey };
  }
  if (credentials.githubToken) {
    merged.github = { ...merged.github, token: credentials.githubToken };
  }
  return merged;
}

function mergeCredentials(
  stored: ProjectCredentials,
  fromFile: ProjectCredentials,
): ProjectCredentials {
  return {
    providers: { ...stored.providers, ...fromFile.providers },
    githubToken: fromFile.githubToken ?? stored.githubToken,
  };
}

function hasCredentials(credentials: ProjectCredentials): boolean {
  return Object.keys(credentials.providers).length > 0 || Boolean(credentials.githubToken);
}

async function ensurePrivateDirectory(directory: string): Promise<void> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    await chmod(directory, 0o700);
  }
}

async function secureExistingConfig(configPath: string, cwd: string): Promise<void> {
  const directory = path.dirname(configPath);
  if ([getProjectDataDir(cwd), getLegacyProjectDataDir(cwd)].includes(directory)) {
    await ensurePrivateDirectory(directory);
  }
  if (directory === getProjectDataDir(cwd)) {
    await ensureProjectGitignore(directory);
  }
  if (process.platform !== "win32") {
    await chmod(configPath, 0o600);
  }
}

async function ensureProjectGitignore(directory: string): Promise<void> {
  const gitignorePath = path.join(directory, ".gitignore");
  let existing = "";
  try {
    existing = await readFile(gitignorePath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const existingLines = new Set(existing.split(/\r?\n/));
  const missingLines = PROJECT_GITIGNORE_LINES.filter((line) => !existingLines.has(line));
  if (missingLines.length === 0) return;
  const prefix = existing.length === 0 || existing.endsWith("\n") ? existing : `${existing}\n`;
  await writeFileAtomic(gitignorePath, `${prefix}${missingLines.join("\n")}\n`, { mode: 0o600 });
}

function credentialValues(credentials: ProjectCredentials): string[] {
  return [...Object.values(credentials.providers), credentials.githubToken].filter(
    (value): value is string => Boolean(value && value.length >= 4),
  );
}

async function sanitizePersistedSecretCopies(cwd: string, secretValues: string[]): Promise<void> {
  for (const directory of [getProjectDataDir(cwd), getLegacyProjectDataDir(cwd)]) {
    for (const transientName of ["cache", "tmp"]) {
      await rm(path.join(directory, transientName), { recursive: true, force: true });
    }
    for (const persistedName of [
      "sessions",
      "telemetry",
      "audit.log",
      "runtime.log",
      "feedback.log",
    ]) {
      await redactFileOrDirectory(path.join(directory, persistedName), secretValues);
    }
  }
}

async function redactFileOrDirectory(targetPath: string, secretValues: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(targetPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    if ((error as NodeJS.ErrnoException).code === "ENOTDIR") {
      await redactFile(targetPath, secretValues);
      return;
    }
    throw error;
  }
  for (const entry of entries) {
    const entryPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      await redactFileOrDirectory(entryPath, secretValues);
    } else if (entry.isFile()) {
      await redactFile(entryPath, secretValues);
    }
  }
}

async function redactFile(filePath: string, secretValues: string[]): Promise<void> {
  const content = await readFile(filePath, "utf8");
  let redacted = content;
  for (const secret of secretValues) {
    redacted = redacted.replaceAll(secret, "[redacted]");
  }
  if (redacted !== content) {
    await writeFileAtomic(filePath, redacted, { mode: 0o600 });
  }
}

function parseSecretFile(content: string, labels: string[]): string | undefined {
  const lines = content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) return undefined;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    const envMatch = line.match(/^([A-Z0-9_]+)\s*=\s*(.+)$/);
    if (envMatch && labels.some((label) => sameLabel(label, envMatch[1]!))) {
      return parseOptionalString(envMatch[2]);
    }

    const labeledMatch = line.match(/^([^:=]+)\s*:\s*(.*)$/);
    if (labeledMatch && labels.some((label) => sameLabel(label, labeledMatch[1]!))) {
      return parseOptionalString(labeledMatch[2]) ?? parseOptionalString(lines[index + 1]);
    }
  }

  return lines.length === 1 ? parseOptionalString(lines[0]) : undefined;
}

function sameLabel(left: string, right: string): boolean {
  return normalizeLabel(left) === normalizeLabel(right);
}

function normalizeLabel(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function resolveUserPath(filePath: string | undefined, cwd: string): string | undefined {
  if (!filePath) return undefined;
  const expanded = filePath === "~" ? os.homedir() : filePath.replace(/^~(?=\/|\\)/, os.homedir());
  return path.isAbsolute(expanded) ? expanded : path.resolve(cwd, expanded);
}

function parseOptionalBoolean(value: string | undefined): boolean | undefined {
  if (value === undefined) return undefined;
  if (["1", "true", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["0", "false", "no", "off"].includes(value.toLowerCase())) return false;
  return undefined;
}

function parseOptionalNumber(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseOptionalString(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function parseOptionalList(value: string | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  const values = value
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return values.length > 0 ? values : undefined;
}
