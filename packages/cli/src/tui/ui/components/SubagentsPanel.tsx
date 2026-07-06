import React from "react";
import { Box, Text } from "ink";
import { theme } from "../semantic-colors.js";
import type { SubagentEntry } from "../contexts/UIStateContext.js";
import { useBackgroundTaskViewState } from "../contexts/BackgroundTaskViewContext.js";

function statusIcon(e: SubagentEntry): React.ReactNode {
  if (e.status === "queued") {
    return <Text color={theme.text.secondary}>○</Text>;
  }
  if (e.status === "running") {
    return <Text color={theme.text.accent}>◐</Text>;
  }
  if (e.status === "done") return <Text color={theme.status.success}>✓</Text>;
  if (e.status === "cancelled") return <Text color={theme.status.warning}>■</Text>;
  return <Text color={theme.status.error}>✗</Text>;
}

interface SubagentsPanelProps {
  subagents: SubagentEntry[];
  mainAreaWidth: number;
}

export const SubagentsPanel: React.FC<SubagentsPanelProps> = ({ subagents, mainAreaWidth }) => {
  const { minimized, dialogOpen } = useBackgroundTaskViewState();
  const panelWidth = Math.max(20, Math.min(mainAreaWidth, 80));
  if (dialogOpen) return null;
  if (subagents.length === 0 || minimized) {
    return (
      <Box marginLeft={2} marginRight={2} width={panelWidth} height={1}>
        <Text> </Text>
      </Box>
    );
  }

  const running = subagents.filter((s) => s.status === "running").length;
  const queued = subagents.filter((s) => s.status === "queued").length;
  const done = subagents.filter((s) => s.status === "done").length;
  const failed = subagents.filter((s) => s.status === "failed").length;
  const cancelled = subagents.filter((s) => s.status === "cancelled").length;
  const activeEntry =
    subagents.find((s) => s.status === "running") ?? subagents[subagents.length - 1]!;

  let titleSuffix: string;
  if (running > 0) {
    titleSuffix = `${running} running${queued > 0 ? ` · ${queued} queued` : ""}`;
  } else if (queued > 0) {
    titleSuffix = `${queued} queued`;
  } else if (failed > 0) {
    titleSuffix = `${done} ok · ${failed} failed`;
  } else if (cancelled > 0) {
    titleSuffix = `${done} ok · ${cancelled} cancelled`;
  } else {
    titleSuffix = `${done} done`;
  }

  const borderColor =
    running > 0
      ? theme.text.accent
      : failed > 0
        ? theme.status.error
        : cancelled > 0
          ? theme.status.warning
          : theme.status.success;

  return (
    <Box flexDirection="row" marginLeft={2} marginRight={2} width={panelWidth} height={1}>
      {statusIcon(activeEntry)}
      <Text color={borderColor} bold>
        {" Subagents"}
      </Text>
      <Text color={theme.text.secondary} wrap="truncate">
        {` · ${titleSuffix} · ↓ details`}
      </Text>
    </Box>
  );
};
