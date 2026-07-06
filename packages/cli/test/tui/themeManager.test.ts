import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME,
  themeManager,
} from "../../src/tui/ui/themes/theme-manager.js";

describe("theme manager", () => {
  it("uses DeepCode Dark as the default theme", () => {
    expect(DEFAULT_THEME.name).toBe("DeepCode Dark");
  });

  it("lists DeepCode Dark first in the theme picker", () => {
    expect(themeManager.getAvailableThemes()[0]?.name).toBe("DeepCode Dark");
  });
});
