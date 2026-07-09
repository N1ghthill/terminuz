import path from "node:path";

export const PRODUCT_IDENTITY = {
  name: "Terminuz",
  tagline: "The Open Source AI Coding Agent",
  description: "AI coding agent for the terminal",
  command: "terminuz",
  packageName: "terminuz",
  projectDirName: ".terminuz",
  userDataDirName: "terminuz",
  updateCacheDirName: "terminuz",
  repositoryUrl: "https://github.com/N1ghthill/terminuz",
  legacy: {
    name: "DeepCode",
    commands: ["deepcode", "deepcode-ai"],
    packageName: "deepcode-ai",
    projectDirName: ".deepcode",
    userDataDirName: "deepcode",
    updateCacheDirName: "deepcode-ai",
    repositoryUrl: "https://github.com/N1ghthill/deepcode",
  },
} as const;

export const PRODUCT_ENV = {
  provider: "TERMINUZ_PROVIDER",
  model: "TERMINUZ_MODEL",
  theme: "TERMINUZ_THEME",
  compact: "TERMINUZ_COMPACT",
  sessionDir: "TERMINUZ_SESSION_DIR",
  disableUpdateCheck: "TERMINUZ_DISABLE_UPDATE_CHECK",
  legacy: {
    provider: "DEEPCODE_PROVIDER",
    model: "DEEPCODE_MODEL",
    theme: "DEEPCODE_THEME",
    compact: "DEEPCODE_COMPACT",
    sessionDir: "DEEPCODE_SESSION_DIR",
    disableUpdateCheck: "DEEPCODE_DISABLE_UPDATE_CHECK",
  },
} as const;

export function getProductEnv(
  preferred: string,
  legacy: string,
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  return env[preferred] ?? env[legacy];
}

export function getProjectDataDir(cwd: string): string {
  return path.join(path.resolve(cwd), PRODUCT_IDENTITY.projectDirName);
}

export function getLegacyProjectDataDir(cwd: string): string {
  return path.join(path.resolve(cwd), PRODUCT_IDENTITY.legacy.projectDirName);
}

export function getProjectDataPath(cwd: string, ...segments: string[]): string {
  return path.join(getProjectDataDir(cwd), ...segments);
}

export function getLegacyProjectDataPath(cwd: string, ...segments: string[]): string {
  return path.join(getLegacyProjectDataDir(cwd), ...segments);
}
