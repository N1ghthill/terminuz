import { describe, expect, it } from "vitest";
import { createSafeChildEnvironment } from "../src/security/child-environment.js";

describe("createSafeChildEnvironment", () => {
  it("removes secret-bearing variables and preserves ordinary process settings", () => {
    expect(
      createSafeChildEnvironment(
        {
          PATH: "/usr/bin",
          OPENAI_API_KEY: "provider-secret",
          GITHUB_TOKEN: "github-secret",
          DATABASE_PASSWORD: "database-secret",
          TERM: "xterm",
        },
        { FORCE_COLOR: "1" },
      ),
    ).toEqual({ PATH: "/usr/bin", TERM: "xterm", FORCE_COLOR: "1" });
  });
});
