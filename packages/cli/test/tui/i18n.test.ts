import { describe, expect, it } from "vitest";
import { getCurrentLanguage, setLanguage, t, ta } from "../../src/tui/i18n/index.js";

describe("tui i18n", () => {
  it("falls back to English keys for missing translations", () => {
    setLanguage("pt-BR");
    expect(t("Untranslated {{value}}", { value: 123 })).toBe("Untranslated 123");
  });

  it("translates known pt-BR keys with interpolation", () => {
    setLanguage("pt-BR");
    expect(t("{{count}} files changed, +{{added}} / -{{removed}}", {
      count: 2,
      added: 10,
      removed: 3,
    })).toBe("2 arquivos alterados, +10 / -3");
  });

  it("returns translated arrays and tracks current language", () => {
    setLanguage("pt-BR");
    expect(getCurrentLanguage()).toBe("pt-BR");
    expect(ta("Submit")).toEqual(["Enviar"]);
    setLanguage("en");
    expect(getCurrentLanguage()).toBe("en");
  });
});
