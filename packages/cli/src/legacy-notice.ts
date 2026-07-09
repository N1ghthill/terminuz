import path from "node:path";
import { PRODUCT_ENV, PRODUCT_IDENTITY } from "@terminuz/shared";

interface LegacyNoticeOptions {
  cwd: string;
  configPath?: string;
  env?: NodeJS.ProcessEnv;
  pathExists?: (filePath: string) => boolean;
}

export function getLegacyIdentityNotices(options: LegacyNoticeOptions): string[] {
  const env = options.env ?? process.env;
  const notices: string[] = [];

  for (const [key, legacyName] of Object.entries(PRODUCT_ENV.legacy)) {
    const preferredName = PRODUCT_ENV[key as keyof Omit<typeof PRODUCT_ENV, "legacy">];
    if (env[legacyName] !== undefined && env[preferredName] === undefined) {
      notices.push(`${legacyName} is deprecated; use ${preferredName}.`);
    }
  }

  if (!options.configPath && options.pathExists) {
    const preferred = path.join(
      path.resolve(options.cwd),
      PRODUCT_IDENTITY.projectDirName,
      "config.json",
    );
    const legacy = path.join(
      path.resolve(options.cwd),
      PRODUCT_IDENTITY.legacy.projectDirName,
      "config.json",
    );
    if (!options.pathExists(preferred) && options.pathExists(legacy)) {
      notices.push(
        `Using legacy ${PRODUCT_IDENTITY.legacy.projectDirName}/config.json; new writes use ${PRODUCT_IDENTITY.projectDirName}/.`,
      );
    }
  }

  return notices;
}
