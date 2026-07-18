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

/**
 * Returns the platform-appropriate user configuration directory for an app.
 * Linux:   XDG_CONFIG_HOME/<app> or ~/.config/<app>
 * macOS:   ~/Library/Application Support/<app>
 * Windows: %APPDATA%/<app>
 */
export function getUserConfigDir(appName: string): string {
  if (process.platform === "win32") {
    return path.join(process.env.APPDATA ?? os.homedir(), appName);
  }
  if (process.platform === "darwin") {
    return path.join(os.homedir(), "Library", "Application Support", appName);
  }
  const base = process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config");
  return path.join(base, appName);
}
