import React from "react";

/**
 * Footer pill for background tasks (dream tasks, future parallel work types).
 *
 * Currently returns null: running subagents are displayed in the SubagentsPanel
 * (above the Composer) which already shows all detail — a redundant pill in the
 * footer would duplicate that signal.  Re-enable here when non-subagent
 * background task types are added.
 */
export function BackgroundTasksPill(): React.ReactElement | null {
  return null;
}
