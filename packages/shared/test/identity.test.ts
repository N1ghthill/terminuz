import { describe, expect, it } from "vitest";
import {
  getLegacyProjectDataPath,
  getProductEnv,
  getProjectDataPath,
  PRODUCT_ENV,
  PRODUCT_IDENTITY,
} from "../src/index.js";

describe("product identity", () => {
  it("defines Terminuz as the preferred public identity", () => {
    expect(PRODUCT_IDENTITY.name).toBe("Terminuz");
    expect(PRODUCT_IDENTITY.command).toBe("terminuz");
    expect(PRODUCT_IDENTITY.packageName).toBe("terminuz");
    expect(PRODUCT_IDENTITY.projectDirName).toBe(".terminuz");
  });

  it("keeps the production DeepCode identifiers as explicit legacy aliases", () => {
    expect(PRODUCT_IDENTITY.legacy.packageName).toBe("deepcode-ai");
    expect(PRODUCT_IDENTITY.legacy.projectDirName).toBe(".deepcode");
    expect(PRODUCT_ENV.legacy.provider).toBe("DEEPCODE_PROVIDER");
  });

  it("prefers a Terminuz environment value over its legacy alias", () => {
    const env = {
      TERMINUZ_MODEL: "preferred/model",
      DEEPCODE_MODEL: "legacy/model",
    };
    expect(getProductEnv(PRODUCT_ENV.model, PRODUCT_ENV.legacy.model, env)).toBe("preferred/model");
  });

  it("falls back to the legacy environment value", () => {
    expect(
      getProductEnv(PRODUCT_ENV.provider, PRODUCT_ENV.legacy.provider, {
        DEEPCODE_PROVIDER: "legacy-provider",
      }),
    ).toBe("legacy-provider");
  });

  it("resolves preferred and legacy project paths independently", () => {
    expect(getProjectDataPath("/workspace/project", "config.json")).toBe(
      "/workspace/project/.terminuz/config.json",
    );
    expect(getLegacyProjectDataPath("/workspace/project", "config.json")).toBe(
      "/workspace/project/.deepcode/config.json",
    );
  });
});
