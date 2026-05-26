import os from "node:os";
import path from "node:path";

/**
 * Returns the platform-appropriate user data directory for an app.
 * Linux:   XDG_DATA_HOME/<app> or ~/.local/share/<app>
 * macOS:   ~/Library/Application Support/<app>
 * Windows: %APPDATA%/<app>
 */
export function getUserDataDir(appName: string): string {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? os.homedir(), appName);
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appName);
  }
  const xdg = process.env.XDG_DATA_HOME;
  const base = xdg ?? path.join(os.homedir(), ".local", "share");
  return path.join(base, appName);
}
