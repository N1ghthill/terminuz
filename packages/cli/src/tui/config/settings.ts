/**
 * Settings types for the Terminuz TUI.
 *
 * Terminuz-native, minimal stand-in for Qwen Code's `config/settings.ts`. The
 * ported TUI reads a small set of settings through `useSettings()`; this module
 * provides just that surface. New fields are added to `MergedSettings` as
 * components are ported. The Terminuz `AppContainer` supplies a `LoadedSettings`
 * instance backed by the runtime config.
 */

export enum SettingScope {
  User = "User",
  Workspace = "Workspace",
  System = "System",
}

export interface UISettings {
  showLineNumbers?: boolean;
  shellOutputMaxLines?: number;
}

export interface GeneralSettings {
  vimMode?: boolean;
  preferredEditor?: string;
}

export interface MergedSettings {
  ui?: UISettings;
  general?: GeneralSettings;
}

export interface LoadedSettings {
  merged: MergedSettings;
  setValue(scope: SettingScope, key: string, value: unknown): void | Promise<void>;
}
