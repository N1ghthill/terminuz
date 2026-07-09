import { describe, expect, it } from "vitest";
import { DeepCodeConfigSchema } from "@terminuz/shared";
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

  it("gives tools to ambiguous build-mode prompts and lets the model decide", () => {
    const strategy = resolveTurnStrategy("o que voce acha disso", "build", policy);
    expect(strategy.allowTools).toBe(true);
    expect(strategy.kind).toBe("task");
  });

  it("treats improvement proposals as workspace work even with an older saved policy", () => {
    const legacyPolicy = DeepCodeConfigSchema.parse({
      permissions: {
        read: "allow",
        write: "allow",
        gitLocal: "allow",
        shell: "allow",
        dangerous: "deny",
        allowShell: [],
      },
      paths: { whitelist: ["${WORKTREE}/**"], blacklist: [] },
      buildTurnPolicy: {
        mode: "heuristic",
        conversationalPhrases: ["oi"],
        workspaceTerms: ["projeto", "arquivo", "erro"],
        taskVerbs: ["analise", "corrija", "teste"],
        fileExtensions: [".ts"],
      },
    }).buildTurnPolicy;

    const strategy = resolveTurnStrategy("proponha melhorias", "build", legacyPolicy);

    expect(strategy.kind).toBe("task");
    expect(strategy.allowTools).toBe(true);
    // Build mode never pre-plans — the model uses the `task` tool to self-organize.
    expect(strategy.shouldPlan).toBe(false);
  });
});
