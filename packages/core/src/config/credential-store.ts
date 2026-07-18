import { createHash, randomUUID } from "node:crypto";
import { chmod, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PRODUCT_IDENTITY,
  ProviderIdSchema,
  getProjectDataDir,
  getUserConfigDir,
  writeFileAtomic,
  type ProviderId,
} from "@terminuz/shared";
import { z } from "zod";
import { ConfigError } from "../errors.js";

const StoredCredentialsSchema = z
  .object({
    version: z.literal(1),
    projects: z
      .record(
        z.string(),
        z
          .object({
            providers: z.record(ProviderIdSchema, z.string().min(1)).default({}),
            githubToken: z.string().min(1).optional(),
          })
          .strict(),
      )
      .default({}),
  })
  .strict();

type StoredCredentials = z.infer<typeof StoredCredentialsSchema>;

export interface ProjectCredentials {
  providers: Partial<Record<ProviderId, string>>;
  githubToken?: string;
}

export interface CredentialStoreOptions {
  filePath?: string;
}

export class CredentialStore {
  readonly filePath: string;

  constructor(options: CredentialStoreOptions = {}) {
    this.filePath =
      options.filePath ??
      path.join(getUserConfigDir(PRODUCT_IDENTITY.userDataDirName), "credentials.json");
  }

  async load(scope: string): Promise<ProjectCredentials> {
    const store = await this.readStore();
    const credentials = store.projects[scope];
    return credentials
      ? { providers: { ...credentials.providers }, githubToken: credentials.githubToken }
      : { providers: {} };
  }

  async replace(scope: string, credentials: ProjectCredentials): Promise<void> {
    const store = await this.readStore();
    const normalized = normalizeCredentials(credentials);
    if (Object.keys(normalized.providers).length === 0 && !normalized.githubToken) {
      delete store.projects[scope];
    } else {
      store.projects[scope] = normalized;
    }
    await this.writeStore(store);
  }

  private async readStore(): Promise<StoredCredentials> {
    try {
      const parsed = StoredCredentialsSchema.safeParse(
        JSON.parse(await readFile(this.filePath, "utf8")),
      );
      if (!parsed.success) {
        throw new ConfigError(
          `Invalid credential store at ${this.filePath}: ${parsed.error.message}`,
          parsed.error,
        );
      }
      return parsed.data;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { version: 1, projects: {} };
      }
      if (error instanceof ConfigError) throw error;
      throw new ConfigError(`Unable to read credential store at ${this.filePath}`, error);
    }
  }

  private async writeStore(store: StoredCredentials): Promise<void> {
    const directory = path.dirname(this.filePath);
    await mkdir(directory, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") {
      await chmod(directory, 0o700);
    }
    await writeFileAtomic(this.filePath, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
  }
}

export async function resolveCredentialScope(cwd: string, configPath?: string): Promise<string> {
  if (configPath) {
    return createHash("sha256")
      .update(`config:${path.resolve(configPath)}`)
      .digest("hex");
  }

  const projectDirectory = getProjectDataDir(cwd);
  const scopePath = path.join(projectDirectory, "credential-scope");
  await mkdir(projectDirectory, { recursive: true, mode: 0o700 });
  if (process.platform !== "win32") {
    await chmod(projectDirectory, 0o700);
  }
  try {
    await writeFile(scopePath, `${randomUUID()}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const scope = (await readFile(scopePath, "utf8")).trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(scope)) {
    throw new ConfigError(`Invalid credential scope at ${scopePath}`);
  }
  if (process.platform !== "win32") {
    await chmod(scopePath, 0o600);
  }
  return scope;
}

function normalizeCredentials(credentials: ProjectCredentials): ProjectCredentials {
  const providers: Partial<Record<ProviderId, string>> = {};
  for (const [provider, apiKey] of Object.entries(credentials.providers)) {
    const parsedProvider = ProviderIdSchema.safeParse(provider);
    const normalizedKey = apiKey?.trim();
    if (parsedProvider.success && normalizedKey) {
      providers[parsedProvider.data] = normalizedKey;
    }
  }
  const githubToken = credentials.githubToken?.trim() || undefined;
  return { providers, githubToken };
}
