#!/usr/bin/env node
/**
 * Promote an already-published deepcode-ai version to the npm "stable" tag.
 *
 * Usage:
 *   node scripts/promote-stable.mjs
 *   node scripts/promote-stable.mjs 1.1.27
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJsonPath = resolve(root, "apps", "deepcode", "package.json");
const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
const [explicitVersion] = process.argv.slice(2).filter((arg) => arg !== "--");
const version = explicitVersion ?? packageJson.version;

if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`Invalid version: ${version}`);
  process.exit(1);
}

try {
  execFileSync("npm", ["view", `deepcode-ai@${version}`, "version"], {
    cwd: root,
    stdio: "pipe",
  });
} catch {
  console.error(`deepcode-ai@${version} was not found on npm.`);
  process.exit(1);
}

console.log(`Promoting deepcode-ai@${version} to the npm "stable" dist-tag...`);
execFileSync("npm", ["dist-tag", "add", `deepcode-ai@${version}`, "stable"], {
  cwd: root,
  stdio: "inherit",
});

console.log("");
console.log("Stable promotion complete.");
console.log("Users can install it with:");
console.log("  npm install -g deepcode-ai@stable");
