const SENSITIVE_ENV_NAME =
  /(api[_-]?key|token|authorization|secret|password|passwd|credential|private[_-]?key)/i;

export function createSafeChildEnvironment(
  env: NodeJS.ProcessEnv = process.env,
  additions: NodeJS.ProcessEnv = {},
): NodeJS.ProcessEnv {
  const safeEnvironment: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    if (!SENSITIVE_ENV_NAME.test(key)) {
      safeEnvironment[key] = value;
    }
  }
  return { ...safeEnvironment, ...additions };
}
