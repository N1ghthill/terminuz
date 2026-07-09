#!/usr/bin/env node
/**
 * Promote an already-published public package version to the npm "stable" tag.
 *
 * Usage:
 *   node scripts/promote-stable.mjs terminuz
 *   node scripts/promote-stable.mjs deepcode-ai 1.3.0
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [packageName = "terminuz", explicitVersion] = process.argv.slice(2).filter((arg) => arg !== "--");
const packageDirs = {
  terminuz: "terminuz",
  "deepcode-ai": "deepcode-legacy",
};
const packageDir = packageDirs[packageName];
if (!packageDir) {
  console.error("Usage: node scripts/promote-stable.mjs terminuz|deepcode-ai [version]");
  process.exit(1);
}
const packageJsonPath = resolve(root, "apps", packageDir, "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const version = explicitVersion ?? packageJson.version;

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid version: ${version}`);
  process.exit(1);
}

try {
  execFileSync("npm", ["view", `${packageName}@${version}`, "version"], {
    cwd: root,
    stdio: "pipe",
  });
} catch {
  console.error(`${packageName}@${version} was not found on npm.`);
  process.exit(1);
}

console.log(`Promoting ${packageName}@${version} to the npm "stable" dist-tag...`);
execFileSync("npm", ["dist-tag", "add", `${packageName}@${version}`, "stable"], {
  cwd: root,
  stdio: "inherit",
});

console.log("");
console.log("Stable promotion complete.");
console.log("Users can install it with:");
console.log(`  npm install -g --tag stable ${packageName}`);
