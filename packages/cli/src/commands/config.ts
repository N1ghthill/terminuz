import { ConfigLoader, isSecretPath, redactSecrets } from "@terminuz/core";
import { writeStdoutLine } from "../stream-flush.js";

export interface ConfigCommandOptions {
  cwd: string;
  config?: string;
}

export async function configPathCommand(options: ConfigCommandOptions): Promise<void> {
  await writeStdoutLine(
    new ConfigLoader().resolveConfigPath({ cwd: options.cwd, configPath: options.config }),
  );
}

export async function configCredentialsPathCommand(): Promise<void> {
  await writeStdoutLine(new ConfigLoader().resolveCredentialStorePath());
}

export async function configShowCommand(
  options: ConfigCommandOptions & { effective?: boolean },
): Promise<void> {
  const loader = new ConfigLoader();
  const config = options.effective
    ? await loader.load({ cwd: options.cwd, configPath: options.config })
    : await loader.loadFile({ cwd: options.cwd, configPath: options.config });
  await writeStdoutLine(
    JSON.stringify(
      redactSecrets(config, { secretPlaceholder: "[set]", emptySecretPlaceholder: "[empty]" }),
      null,
      2,
    ),
  );
}

export async function configGetCommand(
  key: string,
  options: ConfigCommandOptions & { effective?: boolean },
): Promise<void> {
  const loader = new ConfigLoader();
  const config = options.effective
    ? await loader.load({ cwd: options.cwd, configPath: options.config })
    : await loader.loadFile({ cwd: options.cwd, configPath: options.config });
  const value = getPath(config, parsePath(key));
  if (value === undefined) {
    throw new Error(`Config key not found: ${key}`);
  }
  const masked = redactSecrets(value, {
    path: parsePath(key),
    secretPlaceholder: "[set]",
    emptySecretPlaceholder: "[empty]",
  });
  if (typeof masked === "object" && masked !== null) {
    await writeStdoutLine(JSON.stringify(masked, null, 2));
    return;
  }
  await writeStdoutLine(String(masked));
}

export async function configSetCommand(
  key: string,
  rawValue: string,
  options: ConfigCommandOptions & { json?: boolean },
): Promise<void> {
  const loader = new ConfigLoader();
  const loadOptions = { cwd: options.cwd, configPath: options.config };
  const config = await loader.loadFile(loadOptions);
  const pathSegments = parsePath(key);
  const currentValue = getPath(config, pathSegments);
  const nextConfig = cloneJson(config);
  setPath(nextConfig, pathSegments, parseValue(rawValue, currentValue, Boolean(options.json)));
  const savedPath = await loader.save(loadOptions, nextConfig);
  const savedConfig = await loader.loadFile(loadOptions);
  const savedValue = getPath(savedConfig, pathSegments);
  if (
    savedValue === undefined ||
    JSON.stringify(savedValue) !== JSON.stringify(getPath(nextConfig, pathSegments))
  ) {
    throw new Error(`Config key is not supported by the schema: ${key}`);
  }
  const target = isSecretPath(pathSegments) ? loader.resolveCredentialStorePath() : savedPath;
  await writeStdoutLine(`Set ${key} in ${target}`);
}

export async function configUnsetCommand(
  key: string,
  options: ConfigCommandOptions,
): Promise<void> {
  const loader = new ConfigLoader();
  const loadOptions = { cwd: options.cwd, configPath: options.config };
  const config = await loader.loadFile(loadOptions);
  const pathSegments = parsePath(key);
  if (getPath(config, pathSegments) === undefined) {
    throw new Error(`Config key not found: ${key}`);
  }
  const nextConfig = cloneJson(config);
  deletePath(nextConfig, pathSegments);
  const savedPath = await loader.save(loadOptions, nextConfig);
  const target = isSecretPath(pathSegments) ? loader.resolveCredentialStorePath() : savedPath;
  await writeStdoutLine(`Unset ${key} in ${target}`);
}

function parsePath(key: string): string[] {
  const parts = key.split(".").filter(Boolean);
  if (
    parts.length === 0 ||
    parts.some((part) => ["__proto__", "constructor", "prototype"].includes(part))
  ) {
    throw new Error(`Invalid config key: ${key}`);
  }
  return parts;
}

function cloneJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function parseValue(rawValue: string, currentValue: unknown, parseJson: boolean): unknown {
  if (parseJson || Array.isArray(currentValue) || isPlainObject(currentValue)) {
    return JSON.parse(rawValue) as unknown;
  }
  if (typeof currentValue === "boolean") {
    if (["true", "1", "yes", "on"].includes(rawValue.toLowerCase())) return true;
    if (["false", "0", "no", "off"].includes(rawValue.toLowerCase())) return false;
    throw new Error(`Expected boolean value, got ${rawValue}`);
  }
  if (typeof currentValue === "number") {
    const value = Number(rawValue);
    if (!Number.isFinite(value)) {
      throw new Error(`Expected numeric value, got ${rawValue}`);
    }
    return value;
  }
  return rawValue;
}

function getPath(root: unknown, pathSegments: string[]): unknown {
  let cursor = root;
  for (const segment of pathSegments) {
    if (!isIndexable(cursor) || !(segment in cursor)) {
      return undefined;
    }
    cursor = cursor[segment];
  }
  return cursor;
}

function setPath(root: unknown, pathSegments: string[], value: unknown): void {
  let cursor = root;
  for (const segment of pathSegments.slice(0, -1)) {
    if (!isIndexable(cursor) || !(segment in cursor)) {
      throw new Error(`Config parent key not found: ${pathSegments.join(".")}`);
    }
    cursor = cursor[segment];
  }
  if (!isIndexable(cursor)) {
    throw new Error(`Config parent key is not editable: ${pathSegments.join(".")}`);
  }
  cursor[pathSegments[pathSegments.length - 1]!] = value;
}

function deletePath(root: unknown, pathSegments: string[]): void {
  let cursor = root;
  for (const segment of pathSegments.slice(0, -1)) {
    if (!isIndexable(cursor) || !(segment in cursor)) {
      throw new Error(`Config parent key not found: ${pathSegments.join(".")}`);
    }
    cursor = cursor[segment];
  }
  if (!isIndexable(cursor)) {
    throw new Error(`Config parent key is not editable: ${pathSegments.join(".")}`);
  }
  delete cursor[pathSegments[pathSegments.length - 1]!];
}

function isIndexable(value: unknown): value is Record<string, unknown> {
  return (typeof value === "object" && value !== null) || typeof value === "function";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
