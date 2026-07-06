import React, { useCallback } from "react";
import { Box, Text } from "ink";
import {
  useBackgroundTaskViewActions,
  useBackgroundTaskViewState,
} from "../../contexts/BackgroundTaskViewContext.js";
import { useKeypress, type Key } from "../../hooks/useKeypress.js";
import { theme } from "../../semantic-colors.js";
import { escapeAnsiCtrlCodes } from "../../utils/textUtils.js";

function safeLine(value: string | undefined): string {
  return escapeAnsiCtrlCodes(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function statusLabel(status: "queued" | "running" | "done" | "failed" | "cancelled"): string {
  if (status === "queued") return "queued";
  if (status === "running") return "running";
  if (status === "done") return "done";
  if (status === "cancelled") return "cancelled";
  return "failed";
}

export function BackgroundTasksDialog(): React.ReactElement | null {
  const { entries, selectedIndex, dialogMode } = useBackgroundTaskViewState();
  const {
    moveSelectionUp,
    moveSelectionDown,
    closeDialog,
    cancelSelected,
    enterDetail,
    exitDetail,
    toggleMinimized,
  } = useBackgroundTaskViewActions();
  const selected = entries[selectedIndex];

  const onKeypress = useCallback(
    (key: Key) => {
      if (key.name === "escape") {
        if (dialogMode === "detail") exitDetail();
        else closeDialog();
        return;
      }
      if (key.name === "m") {
        toggleMinimized();
        return;
      }
      if (key.name === "c") {
        cancelSelected();
        return;
      }
      if (dialogMode === "detail") {
        if (key.name === "left" || key.name === "backspace") exitDetail();
        return;
      }
      if (key.name === "up") moveSelectionUp();
      else if (key.name === "down") moveSelectionDown();
      else if (key.name === "return" || key.name === "right") enterDetail();
    },
    [
      closeDialog,
      cancelSelected,
      dialogMode,
      enterDetail,
      exitDetail,
      moveSelectionDown,
      moveSelectionUp,
      toggleMinimized,
    ],
  );

  useKeypress(onKeypress, { isActive: dialogMode !== "closed" });
  if (dialogMode === "closed") return null;

  if (dialogMode === "detail" && selected) {
    return (
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor={theme.border.default}
        marginX={2}
        paddingX={1}
      >
        <Text bold color={theme.text.accent}>
          {safeLine(selected.prompt) || selected.taskId}
        </Text>
        <Text color={theme.text.secondary}>
          {`${statusLabel(selected.status)} · ${Math.max(0, Math.floor((Date.now() - selected.startedAt) / 1000))}s`}
        </Text>
        {selected.mode === "background" && <Text color={theme.text.secondary}>background</Text>}
        {selected.currentTool && <Text>{`Tool: ${safeLine(selected.currentTool)}`}</Text>}
        {selected.summary && <Text wrap="wrap">{safeLine(selected.summary)}</Text>}
        {!selected.summary && selected.currentOutput && (
          <Text wrap="wrap">{safeLine(selected.currentOutput)}</Text>
        )}
        {selected.error && (
          <Text color={theme.status.error} wrap="wrap">
            {safeLine(selected.error)}
          </Text>
        )}
        <Text color={theme.text.secondary}>Esc/← back · c cancel · m minimize/restore</Text>
      </Box>
    );
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      marginX={2}
      paddingX={1}
    >
      <Text bold>{`Background tasks (${entries.length})`}</Text>
      {entries.map((entry, index) => {
        const selectedRow = index === selectedIndex;
        const icon =
          entry.status === "queued"
            ? "○"
            : entry.status === "running"
              ? "◐"
              : entry.status === "done"
                ? "✓"
                : entry.status === "cancelled"
                  ? "■"
                  : "✗";
        return (
          <Text
            key={entry.taskId}
            color={selectedRow ? theme.text.accent : theme.text.primary}
            inverse={selectedRow}
            wrap="truncate"
          >
            {`${selectedRow ? "›" : " "} ${icon} ${safeLine(entry.prompt) || entry.taskId} · ${statusLabel(entry.status)}${entry.mode === "background" ? " · bg" : ""}`}
          </Text>
        );
      })}
      <Text color={theme.text.secondary}>
        ↑↓ select · Enter details · c cancel · m minimize/restore · Esc close
      </Text>
    </Box>
  );
}
