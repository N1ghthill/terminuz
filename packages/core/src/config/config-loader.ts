import { mkdir, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DeepCodeConfigSchema, type DeepCodeConfig, writeFileAtomic } from "@deepcode/shared";
import { ConfigError } from "../errors.js";

export interface LoadConfigOptions {
  cwd: string;
  configPath?: string;
}

export class ConfigLoader {
  resolveConfigPath(options: LoadConfigOptions): string {
    return options.configPath
      ? path.resolve(options.configPath)
      : path.join(options.cwd, ".deepcode", "config.json");
  }

  async load(options: LoadConfigOptions): Promise<DeepCodeConfig> {
    const configPath = this.resolveConfigPath(options);
    const rawFile = await this.readOptionalJson(configPath);
    const cwd = path.dirname(configPath) === path.join(path.resolve(options.cwd), ".deepcode")
      ? path.resolve(options.cwd)
      : path.dirname(configPath);
    const openrouterApiKeyFile =
      parseOptionalString(process.env.OPENROUTER_API_KEY_FILE) ??
      rawFile.providers?.openrouter?.apiKeyFile;
    const anthropicApiKeyFile =
      parseOptionalString(process.env.ANTHROPIC_API_KEY_FILE) ??
      rawFile.providers?.anthropic?.apiKeyFile;
    const openaiApiKeyFile =
      parseOptionalString(process.env.OPENAI_API_KEY_FILE) ??
      rawFile.providers?.openai?.apiKeyFile;
    const deepseekApiKeyFile =
      parseOptionalString(process.env.DEEPSEEK_API_KEY_FILE) ??
      rawFile.providers?.deepseek?.apiKeyFile;
    const opencodeApiKeyFile =
      parseOptionalString(process.env.OPENCODE_API_KEY_FILE) ??
      rawFile.providers?.opencode?.apiKeyFile;
    const groqApiKeyFile =
      parseOptionalString(process.env.GROQ_API_KEY_FILE) ??
      rawFile.providers?.groq?.apiKeyFile;
    const merged = {
      ...rawFile,
      defaultProvider:
        parseOptionalString(process.env.DEEPCODE_PROVIDER) ?? rawFile.defaultProvider,
      defaultModel: parseOptionalString(process.env.DEEPCODE_MODEL) ?? rawFile.defaultModel,
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
            await this.readSecretFile(openrouterApiKeyFile, cwd, ["openrouter", "OPENROUTER_API_KEY"]),
        },
        anthropic: {
          ...rawFile.providers?.anthropic,
          apiKeyFile: anthropicApiKeyFile,
          apiKey:
            parseOptionalString(process.env.ANTHROPIC_API_KEY) ??
            rawFile.providers?.anthropic?.apiKey ??
            await this.readSecretFile(anthropicApiKeyFile, cwd, ["anthropic", "claude", "ANTHROPIC_API_KEY"]),
        },
        openai: {
          ...rawFile.providers?.openai,
          apiKeyFile: openaiApiKeyFile,
          apiKey:
            parseOptionalString(process.env.OPENAI_API_KEY) ??
            rawFile.providers?.openai?.apiKey ??
            await this.readSecretFile(openaiApiKeyFile, cwd, ["openai", "OPENAI_API_KEY"]),
        },
        deepseek: {
          ...rawFile.providers?.deepseek,
          apiKeyFile: deepseekApiKeyFile,
          apiKey:
            parseOptionalString(process.env.DEEPSEEK_API_KEY) ??
            rawFile.providers?.deepseek?.apiKey ??
            await this.readSecretFile(deepseekApiKeyFile, cwd, ["deepseek", "DEEPSEEK_API_KEY"]),
        },
        opencode: {
          ...rawFile.providers?.opencode,
          apiKeyFile: opencodeApiKeyFile,
          apiKey:
            parseOptionalString(process.env.OPENCODE_API_KEY) ??
            rawFile.providers?.opencode?.apiKey ??
            await this.readSecretFile(opencodeApiKeyFile, cwd, ["opencode", "opencode(go)", "OPENCODE_API_KEY"]),
        },
        groq: {
          ...rawFile.providers?.groq,
          apiKeyFile: groqApiKeyFile,
          apiKey:
            parseOptionalString(process.env.GROQ_API_KEY) ??
            rawFile.providers?.groq?.apiKey ??
            await this.readSecretFile(groqApiKeyFile, cwd, ["groq", "GROQ_API_KEY"]),
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
        theme: parseOptionalString(process.env.DEEPCODE_THEME) ?? rawFile.tui?.theme,
        compactMode: parseOptionalBoolean(process.env.DEEPCODE_COMPACT) ?? rawFile.tui?.compactMode,
      },
    };

    const parsed = DeepCodeConfigSchema.safeParse(merged);
    if (!parsed.success) {
      throw new ConfigError(`Invalid DeepCode config: ${parsed.error.message}`, parsed.error);
    }
    return parsed.data;
  }

  async loadFile(options: LoadConfigOptions): Promise<DeepCodeConfig> {
    const configPath = this.resolveConfigPath(options);
    const rawFile = await this.readOptionalJson(configPath);
    const parsed = DeepCodeConfigSchema.safeParse(rawFile);
    if (!parsed.success) {
      throw new ConfigError(`Invalid DeepCode config: ${parsed.error.message}`, parsed.error);
    }
    return parsed.data;
  }

  async save(options: LoadConfigOptions, config: DeepCodeConfig): Promise<string> {
    const configPath = this.resolveConfigPath(options);
    const parsed = DeepCodeConfigSchema.safeParse(config);
    if (!parsed.success) {
      throw new ConfigError(`Invalid DeepCode config: ${parsed.error.message}`, parsed.error);
    }
    await mkdir(path.dirname(configPath), { recursive: true });
    await writeFileAtomic(configPath, `${JSON.stringify(parsed.data, null, 2)}\n`);
    return configPath;
  }

  async init(cwd: string): Promise<string> {
    const dir = path.join(cwd, ".deepcode");
    const configPath = path.join(dir, "config.json");
    await mkdir(dir, { recursive: true });
    const config = DeepCodeConfigSchema.parse({});
    await writeFileAtomic(configPath, `${JSON.stringify(config, null, 2)}\n`);
    return configPath;
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
