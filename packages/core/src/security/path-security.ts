import os from "node:os";
import { access, realpath } from "node:fs/promises";
import path from "node:path";
import { PathNotAllowedError } from "../errors.js";

export interface PathRules {
  whitelist: string[];
  blacklist: string[];
}

export type PathAccessLevel = "allowed" | "outside_whitelist" | "blacklisted";

function escapeRegex(input: string): string {
  return input.replace(/[.+^${}()|[\]\\]/g, "\\$&");
}

function globPatternToRegexSource(glob: string): string {
  const doubleStar = "__DEEPCODE_DOUBLE_STAR__";
  const singleStar = "__DEEPCODE_SINGLE_STAR__";
  return escapeRegex(
    glob
      .replaceAll("**", doubleStar)
      .replaceAll("*", singleStar),
  )
    .replaceAll(doubleStar, ".*")
    .replaceAll(singleStar, "[^/]*");
}

function globToRegex(glob: string): RegExp {
  if (glob.endsWith("/**")) {
    const base = glob.slice(0, -3);
    return new RegExp(`^${globPatternToRegexSource(base)}(?:/.*)?$`);
  }
  return new RegExp(`^${globPatternToRegexSource(glob)}$`);
}

export class PathSecurity {
  private readonly rules: PathRules;
  private readonly sourceRules: PathRules;
  private readonly home: string;

  constructor(
    private readonly worktree: string,
    rules: PathRules,
  ) {
    this.home = process.env.HOME ?? os.homedir();
    this.sourceRules = {
      whitelist: [...rules.whitelist],
      blacklist: [...rules.blacklist],
    };
    this.rules = {
      whitelist: rules.whitelist.map((rule) => this.expand(rule, this.home)),
      blacklist: rules.blacklist.map((rule) => this.expand(rule, this.home)),
    };
  }

  forWorktree(worktree: string): PathSecurity {
    return new PathSecurity(path.resolve(worktree), this.sourceRules);
  }

  async normalize(inputPath: string, options: { enforceAccess?: boolean } = {}): Promise<string> {
    const enforceAccess = options.enforceAccess ?? true;
    const resolved = await this.resolvePath(inputPath);
    if (enforceAccess && this.classify(resolved) !== "allowed") {
      throw new PathNotAllowedError(resolved, "It did not match whitelist rules or it matched blacklist rules.");
    }
    // SECURITY FIX: Return the resolved path (after symlink resolution) instead of normalized
    // This prevents symlink attacks where validation happens on one path but return another
    return resolved;
  }

  classify(targetPath: string): PathAccessLevel {
    const candidate = path.normalize(targetPath);
    const blacklisted = this.rules.blacklist.some((rule) => globToRegex(rule).test(candidate));
    if (blacklisted) {
      return "blacklisted";
    }
    const whitelisted = this.rules.whitelist.some((rule) => globToRegex(rule).test(candidate));
    return whitelisted ? "allowed" : "outside_whitelist";
  }

  isAllowed(targetPath: string): boolean {
    return this.classify(targetPath) === "allowed";
  }

  private async resolvePath(inputPath: string): Promise<string> {
    const expanded = this.expandUserPath(inputPath);
    const absolute = path.isAbsolute(expanded) ? expanded : path.resolve(this.worktree, expanded);
    const normalized = path.normalize(absolute);
    const resolved = await this.resolveExistingParent(normalized);
    return resolved;
  }

  private expandUserPath(inputPath: string): string {
    if (!this.home) return inputPath;
    if (inputPath === "~") return this.home;
    const normalizedHome = this.home.replace(/^[\\/]+/, "").replace(/\\/g, "/");
    const normalizedInput = inputPath.replace(/\\/g, "/");
    const duplicatedHomePrefix = normalizedHome ? `~/${normalizedHome}` : "";

    if (
      duplicatedHomePrefix
      && (normalizedInput === duplicatedHomePrefix || normalizedInput.startsWith(`${duplicatedHomePrefix}/`))
    ) {
      const absoluteSuffix = normalizedInput.slice(2);
      return path.sep === "\\" ? absoluteSuffix.replace(/\//g, "\\") : `/${absoluteSuffix}`;
    }

    return inputPath.replace(/^~(?=\/|\\)/, this.home);
  }

  private expand(rule: string, home: string): string {
    return rule.replaceAll("${WORKTREE}", this.worktree).replaceAll("${HOME}", home);
  }

  private async resolveExistingParent(targetPath: string): Promise<string> {
    let cursor = targetPath;
    while (cursor !== path.dirname(cursor)) {
      try {
        await access(cursor);
        const real = await realpath(cursor);
        if (targetPath === cursor) {
          return real;
        }
        return path.join(real, path.relative(cursor, targetPath));
      } catch {
        cursor = path.dirname(cursor);
      }
    }
    return targetPath;
  }
}
