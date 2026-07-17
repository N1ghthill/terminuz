#!/usr/bin/env node
/**
 * Release helper: bumps one public package version,
 * commits the change, creates a git tag, and pushes both.
 *
 * Usage:
 *   node scripts/release.mjs terminuz release
 *   node scripts/release.mjs terminuz patch
 *   node scripts/release.mjs deepcode-ai patch
 */

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const products = {
  terminuz: resolve(root, "apps", "terminuz", "package.json"),
  "deepcode-ai": resolve(root, "apps", "deepcode-legacy", "package.json"),
};
const product = process.argv[2];
const pkgPath = products[product];
if (!pkgPath) {
  console.error("Usage: node scripts/release.mjs terminuz|deepcode-ai release|patch|minor|major");
  process.exit(1);
}
const appDir = dirname(pkgPath);

const bump = process.argv[3];
if (!["release", "patch", "minor", "major"].includes(bump ?? "")) {
  console.error("Usage: node scripts/release.mjs terminuz|deepcode-ai release|patch|minor|major");
  process.exit(1);
}

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });

const capture = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, encoding: "utf8", ...opts });

const initialStatus = capture("git", ["status", "--porcelain"]);
if (initialStatus.trim()) {
  console.error("Refusing to release from a dirty worktree.");
  console.error("Commit or stash local changes first.");
  process.exit(1);
}

const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
const versionMatch = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(pkg.version);
if (!versionMatch) {
  console.error(`Unsupported current version: ${pkg.version}`);
  process.exit(1);
}
const [, majorRaw, minorRaw, patchRaw] = versionMatch;
const major = Number(majorRaw);
const minor = Number(minorRaw);
const patch = Number(patchRaw);

const isPrerelease = pkg.version.includes("-");
let next;
if (bump === "release") {
  if (!isPrerelease) {
    console.error(`Cannot promote ${pkg.version}: the current version is not a prerelease.`);
    process.exit(1);
  }
  next = `${major}.${minor}.${patch}`;
} else if (bump === "major") next = `${major + 1}.0.0`;
else if (bump === "minor") next = `${major}.${minor + 1}.0`;
else next = `${major}.${minor}.${patch + 1}`;

pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
console.log(`Bumped ${product} to ${next}`);

const tag = `${product}-v${next}`;

function verifyPackedPackage() {
  const packDir = mkdtempSync(join(tmpdir(), "terminuz-pack-"));
  try {
    const raw = capture("pnpm", ["pack", "--pack-destination", packDir, "--json"], { cwd: appDir });
    const pack = JSON.parse(raw);
    if (!Array.isArray(pack.files)) {
      throw new Error("pnpm pack returned an invalid file manifest.");
    }
    const files = pack.files;
    const tarball = pack.filename ?? readdirSync(packDir).find((file) => file.endsWith(".tgz"));
    if (!tarball) {
      throw new Error("pnpm pack did not produce a tarball.");
    }

    const manifestRaw = capture("tar", ["-xOf", resolve(packDir, tarball), "package/package.json"]);
    const packedManifest = JSON.parse(manifestRaw);
    const workspaceDependencies = findWorkspaceProtocolDependencies(packedManifest);
    if (workspaceDependencies.length > 0) {
      throw new Error(
        `package contains unresolved workspace dependencies:\n${workspaceDependencies.map((dependency) => `- ${dependency}`).join("\n")}`,
      );
    }

    verifyPackedFiles(files);
  } finally {
    rmSync(packDir, { recursive: true, force: true });
  }
}

function findWorkspaceProtocolDependencies(pkg) {
  const dependencyFields = [
    "dependencies",
    "devDependencies",
    "peerDependencies",
    "optionalDependencies",
  ];
  const unresolved = [];
  for (const field of dependencyFields) {
    const dependencies = pkg[field];
    if (!dependencies || typeof dependencies !== "object") continue;
    for (const [name, version] of Object.entries(dependencies)) {
      if (typeof version === "string" && version.startsWith("workspace:")) {
        unresolved.push(`${field}.${name}=${version}`);
      }
    }
  }
  return unresolved;
}

function verifyPackedFiles(files) {
  const paths = files.map((file) => file.path);
  const forbidden = paths.filter((filePath) => {
    const normalized = filePath.replaceAll("\\", "/");
    return (
      normalized.endsWith(".map") ||
      normalized.startsWith(".terminuz/") ||
      normalized.includes("/.terminuz/") ||
      normalized.startsWith(".deepcode/") ||
      normalized.includes("/.deepcode/") ||
      /(^|\/)\.env($|[./-])/.test(normalized) ||
      /(^|\/)(config\.json|runtime\.log|audit\.log)($|\.)/.test(normalized) ||
      /(^|\/)[^/]*(api[_-]?key|token|secret|credential|password)[^/]*$/i.test(normalized)
    );
  });

  if (forbidden.length > 0) {
    throw new Error(
      `package contains sensitive or debug artifacts:\n${forbidden.map((filePath) => `- ${filePath}`).join("\n")}`,
    );
  }
}

// Gates: these must pass before we tag anything.
run("pnpm", ["secrets:scan"]);
run("pnpm", ["audit"]);
run("pnpm", ["audit", "--prod"]);
run("pnpm", ["lint"]);
run("pnpm", ["typecheck"]);
run("pnpm", ["test"]);

// Rebuild all workspace packages in dependency order so the local binary
// matches what CI will publish. Uses turbo's "dependsOn": ["^build"] pipeline.
run("pnpm", ["build"]);
try {
  verifyPackedPackage();
} catch (error) {
  console.error(`Refusing to release: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

run("git", ["add", pkgPath]);
run("git", ["commit", "-m", `chore(release): ${tag}`]);
run("git", ["tag", tag]);
run("git", ["push"]);
run("git", ["push", "origin", tag]);

console.log(
  `\nReleased ${tag} — GitHub Actions will publish ${product} to NPM unless that version already exists.`,
);
