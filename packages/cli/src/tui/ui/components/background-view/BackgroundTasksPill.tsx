import React from "react";
import { Text } from "ink";
import { useUIState } from "../../contexts/UIStateContext.js";
import { theme } from "../../semantic-colors.js";

export function BackgroundTasksPill(): React.ReactElement | null {
  const { activeSubagents } = useUIState();
  const running = activeSubagents.filter((s) => s.status === "running").length;
  if (running <= 0) return null;
  return (
    <Text color={theme.text.accent}>
      {" "}
      {running} task{running !== 1 ? "s" : ""}
    </Text>
  );
}
