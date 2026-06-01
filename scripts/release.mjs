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

const bump = process.argv[2];
if (!["patch", "minor", "major"].includes(bump ?? "")) {
  console.error("Usage: node scripts/release.mjs patch|minor|major");
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

const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: "inherit", ...opts });

// Gate: lint must pass before we tag anything.
run("pnpm", ["lint"]);

// Rebuild the CLI binary so dist/__VERSION__ matches the bumped version.
// dist/ is gitignored — the rebuild only refreshes the local binary for e2e tests.
// CI publishes to NPM from source using its own build step.
const appDir = resolve(root, "apps", "deepcode");
run("pnpm", ["build"], { cwd: appDir });

run("git", ["add", "apps/deepcode/package.json"]);
run("git", ["commit", "-m", `chore(release): ${tag}`]);
run("git", ["tag", tag]);
run("git", ["push"]);
run("git", ["push", "origin", tag]);

console.log(`\nReleased ${tag} — GitHub Actions will publish to NPM.`);
