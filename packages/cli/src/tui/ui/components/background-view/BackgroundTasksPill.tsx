import React, { useCallback } from "react";
import { Box, Text } from "ink";
import {
  useBackgroundTaskViewActions,
  useBackgroundTaskViewState,
} from "../../contexts/BackgroundTaskViewContext.js";
import { useKeypress, type Key } from "../../hooks/useKeypress.js";
import { theme } from "../../semantic-colors.js";

export function BackgroundTasksPill(): React.ReactElement | null {
  const { entries, pillFocused, minimized } = useBackgroundTaskViewState();
  const { openDialog, setPillFocused, toggleMinimized } = useBackgroundTaskViewActions();

  const onKeypress = useCallback(
    (key: Key) => {
      if (key.name === "return" || key.name === "down") {
        openDialog();
      } else if (key.name === "m") {
        toggleMinimized();
      } else if (key.name === "up" || key.name === "escape") {
        setPillFocused(false);
      } else if (key.sequence?.length === 1 && !key.ctrl && !key.meta) {
        setPillFocused(false);
      }
    },
    [openDialog, setPillFocused, toggleMinimized],
  );

  useKeypress(onKeypress, { isActive: pillFocused });

  if (entries.length === 0) {
    return (
      <Box width={22} flexShrink={0}>
        <Text> </Text>
      </Box>
    );
  }
  const running = entries.filter((entry) => entry.status === "running").length;
  const queued = entries.filter((entry) => entry.status === "queued").length;
  const failed = entries.filter((entry) => entry.status === "failed").length;
  const cancelled = entries.filter((entry) => entry.status === "cancelled").length;
  const label =
    running > 0
      ? `${running} active${queued > 0 ? ` +${queued}` : ""}`
      : queued > 0
        ? `${queued} queued`
        : failed > 0
          ? `${failed} failed`
          : cancelled > 0
            ? `${cancelled} cancelled`
            : `${entries.length} done`;

  return (
    <Box width={22} flexShrink={0}>
      <Text
        color={running > 0 ? theme.text.accent : theme.text.secondary}
        inverse={pillFocused}
        wrap="truncate"
      >
        {` · ${minimized ? "▸" : "▾"} ${label}`}
      </Text>
    </Box>
  );
}
