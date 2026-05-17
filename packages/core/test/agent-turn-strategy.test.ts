import { describe, expect, it } from "vitest";
import { DeepCodeConfigSchema } from "@deepcode/shared";
import { parseUtilityRequest, resolveTurnStrategy } from "../src/agent/agent-turn-strategy.js";

const policy = DeepCodeConfigSchema.parse({
  permissions: {
    read: "allow",
    write: "allow",
    gitLocal: "allow",
    shell: "allow",
    dangerous: "deny",
    allowShell: [],
  },
  paths: { whitelist: ["${WORKTREE}/**"], blacklist: [] },
}).buildTurnPolicy;

describe("agent turn strategy", () => {
  it("treats project discovery requests as direct utility work", () => {
    const strategy = resolveTurnStrategy("Me lista os meus projetos", "build", policy);

    expect(strategy.kind).toBe("utility");
    expect(strategy.shouldPlan).toBe(false);
  });

  it("parses git-based project discovery phrasing without turning it into versioning work", () => {
    const request = parseUtilityRequest("Usa o git para rastrear os projetos e o diretorio");

    expect(request).toEqual({
      kind: "list_projects",
      path: ".",
      rawPath: ".",
    });
  });
});
