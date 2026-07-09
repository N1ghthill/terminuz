import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, themeManager } from "../../src/tui/ui/themes/theme-manager.js";

describe("theme manager", () => {
  it("uses Terminuz Dark as the default theme", () => {
    expect(DEFAULT_THEME.name).toBe("Terminuz Dark");
  });

  it("lists Terminuz Dark first in the theme picker", () => {
    expect(themeManager.getAvailableThemes()[0]?.name).toBe("Terminuz Dark");
  });
});
