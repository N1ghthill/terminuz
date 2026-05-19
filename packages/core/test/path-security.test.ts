import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { PathSecurity } from "../src/security/path-security.js";

describe("PathSecurity", () => {
  it("allows files inside the worktree", () => {
    const worktree = path.resolve("/tmp/deepcode-test");
    const security = new PathSecurity(worktree, {
      whitelist: ["${WORKTREE}/**"],
      blacklist: ["**/.env"],
    });
    expect(security.isAllowed(path.join(worktree, "src/index.ts"))).toBe(true);
  });

  it("allows the worktree root for tools that execute with cwd dot", () => {
    const worktree = path.resolve("/tmp/deepcode-test");
    const security = new PathSecurity(worktree, {
      whitelist: ["${WORKTREE}/**"],
      blacklist: ["**/.env"],
    });
    expect(security.isAllowed(worktree)).toBe(true);
  });

  it("re-bases worktree-relative rules for a selected project", () => {
    const homeRoot = path.resolve("/tmp/deepcode-home");
    const projectRoot = path.join(homeRoot, "repos", "app");
    const security = new PathSecurity(homeRoot, {
      whitelist: ["${WORKTREE}/**"],
      blacklist: ["**/.env"],
    }).forWorktree(projectRoot);

    expect(security.isAllowed(path.join(projectRoot, "src/index.ts"))).toBe(true);
    expect(security.isAllowed(path.join(homeRoot, "notes.txt"))).toBe(false);
  });

  it("blocks blacklisted paths", () => {
    const worktree = path.resolve("/tmp/deepcode-test");
    const security = new PathSecurity(worktree, {
      whitelist: ["${WORKTREE}/**"],
      blacklist: ["**/.env"],
    });
    expect(security.isAllowed(path.join(worktree, ".env"))).toBe(false);
  });

  it("supports blacklist globs that contain double-star prefixes and suffixes", () => {
    const worktree = path.resolve("/tmp/deepcode-test");
    const security = new PathSecurity(worktree, {
      whitelist: ["${WORKTREE}/**", "/tmp/**"],
      blacklist: ["**/.ssh/**"],
    });

    expect(security.isAllowed("/tmp/example/.ssh/id_rsa")).toBe(false);
  });

  it("expands tilde-prefixed user paths before access checks", async () => {
    const worktree = path.resolve("/tmp/deepcode-test");
    const security = new PathSecurity(worktree, {
      whitelist: ["${WORKTREE}/**"],
      blacklist: ["**/.env"],
    });

    await expect(
      security.normalize("~/Documentos", { enforceAccess: false }),
    ).resolves.toBe(path.join(os.homedir(), "Documentos"));
  });

  it("collapses accidental home duplication in tilde-prefixed absolute paths", async () => {
    const worktree = path.resolve("/tmp/deepcode-test");
    const security = new PathSecurity(worktree, {
      whitelist: ["${WORKTREE}/**"],
      blacklist: ["**/.env"],
    });

    const duplicatedHomePath = `~/${os.homedir().replace(/^[\\/]+/, "").replace(/\\/g, "/")}/Documentos`;

    await expect(
      security.normalize(duplicatedHomePath, { enforceAccess: false }),
    ).resolves.toBe(path.join(os.homedir(), "Documentos"));
  });
});
