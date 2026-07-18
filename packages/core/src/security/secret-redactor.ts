import type { TerminuzConfig } from "@terminuz/shared";

export interface RedactOptions {
  path?: string[];
  secretValues?: string[];
  secretPlaceholder?: string;
  emptySecretPlaceholder?: string;
}

const SECRET_KEY_PATTERN =
  /(api[_-]?key|token|authorization|secret|password|passwd|credential|private[_-]?key)/i;
const MIN_SECRET_VALUE_LENGTH = 4;

export function redactSecrets(value: unknown, options: RedactOptions = {}): unknown {
  const path = options.path ?? [];
  const secretPlaceholder = options.secretPlaceholder ?? "[redacted]";
  const emptySecretPlaceholder = options.emptySecretPlaceholder ?? "[empty]";
  const secretValues = options.secretValues ?? collectSecretValues();

  if (typeof value === "string") {
    if (isSecretPath(path)) {
      return value.length > 0 ? secretPlaceholder : emptySecretPlaceholder;
    }
    return redactText(value, secretValues, secretPlaceholder);
  }

  if (Array.isArray(value)) {
    return value.map((item, index) =>
      redactSecrets(item, {
        ...options,
        path: [...path, String(index)],
        secretValues,
      }),
    );
  }

  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        redactSecrets(item, {
          ...options,
          path: [...path, key],
          secretValues,
        }),
      ]),
    );
  }

  return value;
}

export function redactText(
  input: string,
  secretValues = collectSecretValues(),
  placeholder = "[redacted]",
): string {
  let output = input;
  for (const secret of secretValues) {
    output = output.split(secret).join(placeholder);
  }
  output = output.replace(
    /\b(authorization\s*[:=]\s*(?:bearer\s+)?)([^\s'",;]+)/gi,
    `$1${placeholder}`,
  );
  output = output.replace(
    /\b([a-z0-9_]*(?:api[_-]?key|token|secret|password|passwd|credential)[a-z0-9_]*\s*[:=]\s*)([^\s'",;]+)/gi,
    `$1${placeholder}`,
  );
  output = output.replace(
    /\b(?:sk-[A-Za-z0-9_-]{16,}|gh[opsu]_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,})\b/g,
    placeholder,
  );
  return output;
}

export function collectSecretValues(config?: TerminuzConfig): string[] {
  const values = new Set<string>();

  if (config) {
    for (const provider of Object.values(config.providers)) {
      addSecretValue(values, provider.apiKey);
    }
    addSecretValue(values, config.github.token);
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      addSecretValue(values, value);
    }
  }

  return [...values].sort((left, right) => right.length - left.length);
}

export function isSecretPath(path: string[]): boolean {
  const key = path[path.length - 1] ?? "";
  if (/(api[_-]?key|token|secret|credential).*file/i.test(key)) return false;
  return SECRET_KEY_PATTERN.test(key);
}

function addSecretValue(values: Set<string>, value: string | undefined): void {
  if (!value) return;
  if (value.length < MIN_SECRET_VALUE_LENGTH) return;
  values.add(value);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
