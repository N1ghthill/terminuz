import { describe, it, expect } from "vitest";
import { findLastSafeSplitPoint } from "../../src/tui/utils/markdownUtilities.js";

describe("findLastSafeSplitPoint", () => {
  it("returns content.length when there is no double newline", () => {
    const text = "Hello world\nno split here";
    expect(findLastSafeSplitPoint(text)).toBe(text.length);
  });

  it("returns content.length when text ends with the double newline (nothing after)", () => {
    const text = "Paragraph one.\n\n";
    expect(findLastSafeSplitPoint(text)).toBe(text.length);
  });

  it("finds the split after a paragraph break", () => {
    const text = "First paragraph.\n\nSecond paragraph in progress";
    // split point is right after \n\n (index 18)
    expect(findLastSafeSplitPoint(text)).toBe(18);
  });

  it("picks the LAST safe split when multiple paragraph breaks exist", () => {
    const text = "Para 1.\n\nPara 2.\n\nPara 3 in progress";
    const split = findLastSafeSplitPoint(text);
    expect(text.substring(split)).toBe("Para 3 in progress");
  });

  it("does not split inside a fenced code block", () => {
    const text = "Intro.\n\n```\ncode block\n\nstill inside\n```\nafter";
    const split = findLastSafeSplitPoint(text);
    // The only safe \n\n is the one before the code fence — index 7
    expect(split).toBe(8);
  });

  it("splits after a closing code fence when a paragraph break follows", () => {
    const text = "Intro.\n\n```\ncode\n```\n\nOutro in progress";
    const split = findLastSafeSplitPoint(text);
    expect(text.substring(split)).toBe("Outro in progress");
  });

  it("returns content.length for empty string", () => {
    expect(findLastSafeSplitPoint("")).toBe(0);
  });

  it("returns content.length for a single paragraph with no break", () => {
    const text = "Just one line.";
    expect(findLastSafeSplitPoint(text)).toBe(text.length);
  });

  it("does not split on a single newline", () => {
    const text = "Line one.\nLine two still pending";
    expect(findLastSafeSplitPoint(text)).toBe(text.length);
  });

  it("handles multiple code blocks correctly — only splits outside them", () => {
    const text = "A.\n\n```\nblock1\n\n```\n\nB.\n\n```\nblock2\n\n```\n\nC in progress";
    const split = findLastSafeSplitPoint(text);
    expect(text.substring(split)).toBe("C in progress");
  });
});
