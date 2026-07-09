import { afterEach, describe, expect, it, vi } from "vitest";

const { checkForUpdate, isNewer, writeStdoutLine } = vi.hoisted(() => ({
  checkForUpdate: vi.fn(),
  isNewer: vi.fn(),
  writeStdoutLine: vi.fn(),
}));

vi.mock("../src/update-checker.js", () => ({
  checkForUpdate,
  isNewer,
}));

vi.mock("../src/stream-flush.js", () => ({
  writeStdoutLine,
}));

vi.mock("../src/version.js", () => ({
  VERSION: "1.2.10",
}));

import { updateCommand } from "../src/commands/update.js";

afterEach(() => {
  vi.clearAllMocks();
});

describe("updateCommand", () => {
  it("prints a registry failure message when the npm registry is unavailable", async () => {
    checkForUpdate.mockResolvedValue(null);

    await updateCommand();

    expect(checkForUpdate).toHaveBeenCalledWith("1.2.10", { force: true });
    expect(writeStdoutLine.mock.calls).toEqual([
      ["Current version: 1.2.10"],
      ["Could not reach the npm registry right now."],
    ]);
  });

  it("prints latest and stable channels and install hints when an update exists", async () => {
    checkForUpdate.mockResolvedValue({ latest: "1.2.11", stable: "1.2.10" });
    isNewer.mockImplementation((_current: string, candidate: string) => candidate === "1.2.11");

    await updateCommand();

    expect(writeStdoutLine.mock.calls).toEqual([
      ["Current version: 1.2.10"],
      ["Latest version:  1.2.11 (update available)"],
      ["Stable version:  1.2.10 (up to date)"],
      [""],
      ["Install latest:  npm install -g terminuz@latest"],
      ["Install stable:  npm install -g --tag stable terminuz"],
    ]);
  });

  it("handles a missing stable channel without install hints when already up to date", async () => {
    checkForUpdate.mockResolvedValue({ latest: "1.2.10", stable: null });
    isNewer.mockReturnValue(false);

    await updateCommand();

    expect(writeStdoutLine.mock.calls).toEqual([
      ["Current version: 1.2.10"],
      ["Latest version:  1.2.10 (up to date)"],
      ["Stable version:  not published yet"],
    ]);
  });
});
