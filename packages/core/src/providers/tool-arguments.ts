export function parseToolArgumentsObject(raw: unknown): Record<string, unknown> {
  if (typeof raw !== "string") {
    return {};
  }

  const candidates = buildJsonCandidates(raw);
  for (const candidate of candidates) {
    const parsed = tryParseObject(candidate);
    if (parsed) {
      return parsed;
    }
  }

  return {};
}

function buildJsonCandidates(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  const extracted = extractJsonObject(trimmed);
  const candidates = new Set<string>(
    [
      trimmed,
      stripCodeFence(trimmed),
      extracted,
      normalizeJsonCandidate(trimmed),
      normalizeJsonCandidate(stripCodeFence(trimmed)),
      normalizeJsonCandidate(extracted),
    ].filter(Boolean),
  );

  return [...candidates];
}

function tryParseObject(input: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(input) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Try the next repaired candidate.
  }

  return null;
}

function stripCodeFence(input: string): string {
  return input
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

function extractJsonObject(input: string): string {
  const start = input.indexOf("{");
  const end = input.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return input.slice(start, end + 1);
  }
  return input;
}

function normalizeJsonCandidate(input: string): string {
  const extracted = extractJsonObject(stripCodeFence(input));
  const withoutTrailingCommas = extracted.replace(/,\s*([}\]])/g, "$1");
  const withoutControlChars = stripDisallowedControlChars(withoutTrailingCommas);
  return closeMissingDelimiters(withoutControlChars.trim());
}

function closeMissingDelimiters(input: string): string {
  if (!input) {
    return input;
  }

  let next = input;
  const missingBrackets = countChar(next, "[") - countChar(next, "]");
  if (missingBrackets > 0) {
    next += "]".repeat(missingBrackets);
  }

  const missingBraces = countChar(next, "{") - countChar(next, "}");
  if (missingBraces > 0) {
    next += "}".repeat(missingBraces);
  }

  return next;
}

function countChar(input: string, char: string): number {
  return [...input].filter((item) => item === char).length;
}

function stripDisallowedControlChars(input: string): string {
  return [...input]
    .filter((char) => {
      const code = char.charCodeAt(0);
      return !(code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d);
    })
    .join("");
}
