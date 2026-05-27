import React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import { theme } from "../semantic-colors.js";
import type { SubagentEntry } from "../contexts/UIStateContext.js";

function statusIcon(e: SubagentEntry): React.ReactNode {
  if (e.status === "running") {
    return (
      <Text color={theme.text.accent}>
        <Spinner type="dots" />
      </Text>
    );
  }
  if (e.status === "done") return <Text color={theme.status.success}>✓</Text>;
  return <Text color={theme.status.error}>✗</Text>;
}

interface SubagentsPanelProps {
  subagents: SubagentEntry[];
  mainAreaWidth: number;
}

export const SubagentsPanel: React.FC<SubagentsPanelProps> = ({ subagents, mainAreaWidth }) => {
  if (subagents.length === 0) return null;

  const running = subagents.filter((s) => s.status === "running").length;
  const done    = subagents.filter((s) => s.status === "done").length;
  const failed  = subagents.filter((s) => s.status === "failed").length;

  let titleSuffix: string;
  if (running > 0) {
    titleSuffix = `${running} em execução`;
  } else if (failed > 0) {
    titleSuffix = `${done} ok · ${failed} falha${failed !== 1 ? "s" : ""}`;
  } else {
    titleSuffix = `${done} concluído${done !== 1 ? "s" : ""}`;
  }

  const borderColor =
    running > 0 ? theme.text.accent
    : failed > 0 ? theme.status.error
    : theme.status.success;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={borderColor}
      marginLeft={2}
      marginRight={2}
      marginTop={1}
      width={Math.min(mainAreaWidth, 80)}
    >
      <Box paddingX={1}>
        <Text bold color={borderColor}>Subagents</Text>
        <Text color={theme.text.secondary}>{" · "}{titleSuffix}</Text>
      </Box>
      {subagents.map((entry) => (
        <Box key={entry.taskId} flexDirection="column" paddingX={1}>
          <Box flexDirection="row" gap={1}>
            {statusIcon(entry)}
            <Text wrap="truncate" color={theme.text.primary}>
              {entry.prompt}{entry.prompt.length >= 50 ? "…" : ""}
            </Text>
          </Box>
          {entry.status === "running" && entry.currentTool && (
            <Text color={theme.text.secondary} dimColor>
              {"  "}ferramenta: {entry.currentTool}
            </Text>
          )}
          {entry.status === "running" && !entry.currentTool && entry.currentOutput && (
            <Text color={theme.text.secondary} dimColor wrap="truncate">
              {"  "}{entry.currentOutput.trimStart()}
            </Text>
          )}
          {entry.status === "failed" && entry.error && (
            <Text color={theme.status.error} dimColor wrap="truncate">
              {"  "}{entry.error.slice(0, 60)}
            </Text>
          )}
        </Box>
      ))}
    </Box>
  );
};
