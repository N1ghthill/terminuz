import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface UpdateInfo {
  latest: string;
  stable: string | null;
}

interface UpdateCache extends UpdateInfo {
  checkedAt: number;
}

export interface CheckForUpdateOptions {
  force?: boolean;
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const PACKAGE_NAME = "deepcode-ai";

function cachePath(): string {
  const cacheHome = process.env["XDG_CACHE_HOME"]
    ?? path.join(os.homedir(), ".cache");
  return path.join(cacheHome, "deepcode-ai", "update.json");
}

function readCache(): UpdateCache | null {
  try {
    const raw = fs.readFileSync(cachePath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<UpdateCache>;
    if (
      typeof parsed.checkedAt !== "number"
      || typeof parsed.latest !== "string"
      || Date.now() - parsed.checkedAt >= CACHE_TTL_MS
    ) {
      return null;
    }
    return {
      checkedAt: parsed.checkedAt,
      latest: parsed.latest,
      stable: typeof parsed.stable === "string" ? parsed.stable : null,
    };
  } catch {
    return null;
  }
}

function writeCache(cache: UpdateCache): void {
  try {
    const filePath = cachePath();
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(cache)}\n`, "utf8");
  } catch {
    // Best-effort only; update checks must never block CLI startup.
  }
}

export async function checkForUpdate(
  _currentVersion: string,
  options: CheckForUpdateOptions = {},
): Promise<UpdateInfo | null> {
  if (
    process.env["CI"]
    || process.env["NODE_ENV"] === "test"
    || process.env["DEEPCODE_DISABLE_UPDATE_CHECK"] === "1"
  ) {
    return null;
  }

  if (!options.force) {
    const cached = readCache();
    if (cached) {
      return { latest: cached.latest, stable: cached.stable };
    }
  }

  try {
    const response = await fetch(
      `https://registry.npmjs.org/-/package/${PACKAGE_NAME}/dist-tags`,
      { signal: AbortSignal.timeout(3000) },
    );
    if (!response.ok) return null;

    const tags = await response.json() as Record<string, unknown>;
    const latest = tags["latest"];
    if (typeof latest !== "string" || latest.length === 0) return null;

    const stable = typeof tags["stable"] === "string" && tags["stable"].length > 0
      ? tags["stable"]
      : null;
    const update = { latest, stable };
    writeCache({ ...update, checkedAt: Date.now() });
    return update;
  } catch {
    return null;
  }
}

export function isNewer(current: string, candidate: string): boolean {
  const currentParts = parseVersion(current);
  const candidateParts = parseVersion(candidate);
  if (!currentParts || !candidateParts) return false;

  for (let index = 0; index < 3; index += 1) {
    const currentPart = currentParts[index] ?? 0;
    const candidatePart = candidateParts[index] ?? 0;
    if (candidatePart !== currentPart) {
      return candidatePart > currentPart;
    }
  }
  return false;
}

function parseVersion(version: string): [number, number, number] | null {
  const match = version.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}
