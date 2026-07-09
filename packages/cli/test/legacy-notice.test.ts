import { describe, expect, it } from "vitest";
import { getLegacyIdentityNotices } from "../src/legacy-notice.js";

describe("getLegacyIdentityNotices", () => {
  it("reports legacy variable names without exposing their values", () => {
    const notices = getLegacyIdentityNotices({
      cwd: "/work",
      env: { DEEPCODE_MODEL: "private-model-name" },
    });

    expect(notices).toEqual(["DEEPCODE_MODEL is deprecated; use TERMINUZ_MODEL."]);
    expect(notices.join(" ")).not.toContain("private-model-name");
  });

  it("does not warn when the preferred variable is present", () => {
    const notices = getLegacyIdentityNotices({
      cwd: "/work",
      env: { TERMINUZ_MODEL: "new", DEEPCODE_MODEL: "old" },
    });

    expect(notices).toEqual([]);
  });

  it("reports a legacy config only when no preferred config exists", () => {
    const notices = getLegacyIdentityNotices({
      cwd: "/work",
      env: {},
      pathExists: (filePath) => filePath === "/work/.deepcode/config.json",
    });

    expect(notices).toEqual(["Using legacy .deepcode/config.json; new writes use .terminuz/."]);
  });
});
