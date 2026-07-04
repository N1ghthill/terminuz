#!/usr/bin/env node
/**
 * Release helper: bumps the version in apps/deepcode/package.json,
 * commits the change, creates a git tag, and pushes both.
 *
 * Usage:
 *   node scripts/release.mjs patch   # 1.0.0 → 1.0.1
 *   node scripts/release.mjs minor   # 1.0.0 → 1.1.0
 *   node scripts/release.mjs major   # 1.0.0 → 2.0.0
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkgPath = resolve(root, "apps", "deepcode", "package.json");
const appDir = dirname(pkgPath);

const bump = process.argv[2];
if (!["patch", "minor", "major"].includes(bump ?? "")) {
  console.error("Usage: node scripts/release.mjs patch|minor|major");
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
const [major, minor, patch] = pkg.version.split(".").map(Number);

let next;
if (bump === "major") next = `${major + 1}.0.0`;
else if (bump === "minor") next = `${major}.${minor + 1}.0`;
else next = `${major}.${minor}.${patch + 1}`;

pkg.version = next;
writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`, "utf8");
console.log(`Bumped ${pkg.version.replace(next, "")}${next}`);

const tag = `v${next}`;

function verifyPackedPackage() {
  const raw = capture("npm", ["pack", "--dry-run", "--json"], { cwd: appDir });
  const pack = JSON.parse(raw);
  const files = pack.flatMap((item) => item.files ?? []);
  const paths = files.map((file) => file.path);
  const forbidden = paths.filter((filePath) => {
    const normalized = filePath.replaceAll("\\", "/");
    return (
      normalized.endsWith(".map") ||
      normalized.startsWith(".deepcode/") ||
      normalized.includes("/.deepcode/") ||
      /(^|\/)\.env($|[./-])/.test(normalized) ||
      /(^|\/)(config\.json|runtime\.log|audit\.log)($|\.)/.test(normalized) ||
      /(^|\/)[^/]*(api[_-]?key|token|secret|credential|password)[^/]*$/i.test(normalized)
    );
  });

  if (forbidden.length > 0) {
    console.error("Refusing to release package with sensitive or debug artifacts:");
    for (const filePath of forbidden) {
      console.error(`- ${filePath}`);
    }
    process.exit(1);
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
verifyPackedPackage();

run("git", ["add", "apps/deepcode/package.json"]);
run("git", ["commit", "-m", `chore(release): ${tag}`]);
run("git", ["tag", tag]);
run("git", ["push"]);
run("git", ["push", "origin", tag]);

console.log(`\nReleased ${tag} — GitHub Actions will publish to NPM as latest unless that version is already present.`);
