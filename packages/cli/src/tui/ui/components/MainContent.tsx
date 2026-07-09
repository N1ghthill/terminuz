import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Static, Text } from "ink";
import type { HistoryItem, HistoryItemWithoutId, IndividualToolCallDisplay } from "../types.js";
import { ToolCallStatus } from "../types.js";
import { HistoryItemDisplay } from "./HistoryItemDisplay.js";
import { useCompactMode } from "../contexts/CompactModeContext.js";
import { useUIActions } from "../contexts/UIActionsContext.js";
import { mergeCompactToolGroups, isForceExpandGroup } from "../utils/mergeCompactToolGroups.js";
import { theme } from "../semantic-colors.js";

// Limit the visible streaming text to the last N lines so the dynamic render
// area stays small and constant — prevents the flash caused by Ink repainting
// a growing block of text on every 40ms tick.
const STREAMING_WINDOW_LINES = 20;

// Completed tools in the live panel only need to signal "done" — the full
// result appears in Static after the next onIteration commit. Cap string
// results to this many lines to keep the panel compact.
const LIVE_COMPLETED_RESULT_LINES = 3;

function truncateLiveResult(tool: IndividualToolCallDisplay): IndividualToolCallDisplay {
  const done =
    tool.status === ToolCallStatus.Success ||
    tool.status === ToolCallStatus.Error ||
    tool.status === ToolCallStatus.Canceled;
  if (!done || tool.resultDisplay === undefined) return tool;
  if (typeof tool.resultDisplay !== "string") {
    // Object results (diffs, todo lists, etc.) can be very large — hide them;
    // the full version is committed to Static at the next iteration boundary.
    return { ...tool, resultDisplay: undefined };
  }
  const lines = tool.resultDisplay.split("\n");
  if (lines.length <= LIVE_COMPLETED_RESULT_LINES) return tool;
  return {
    ...tool,
    resultDisplay: lines.slice(0, LIVE_COMPLETED_RESULT_LINES).join("\n") + "\n…",
  };
}
function streamingWindow(text: string, maxHeight?: number): string {
  const limit = maxHeight ?? STREAMING_WINDOW_LINES;
  const trimmed = text.trimEnd();
  const lines = trimmed.split("\n");
  if (lines.length <= limit) return trimmed;
  return lines.slice(-limit).join("\n");
}

// Progressive replay — keeps input responsive when resuming a long session.
// Below the threshold, all items render at once (normal path). Above it, we
// feed Static in CHUNK_SIZE slices via setImmediate, yielding to the event
// loop between each chunk so the composer stays responsive.
const PROGRESSIVE_REPLAY_THRESHOLD = 100;
const PROGRESSIVE_REPLAY_CHUNK_SIZE = 50;

function initialReplayCount(length: number): number {
  return length <= PROGRESSIVE_REPLAY_THRESHOLD
    ? length
    : Math.min(PROGRESSIVE_REPLAY_CHUNK_SIZE, length);
}

const EmptyState: React.FC<{ width: number }> = ({ width }) => (
  <Box
    flexDirection="column"
    marginLeft={2}
    marginRight={2}
    marginTop={1}
    width={Math.max(40, Math.min(width, 92))}
  >
    <Box>
      <Text bold color={theme.text.accent}>
        ◆ Terminuz
      </Text>
      <Text color={theme.text.secondary}> is ready.</Text>
    </Box>
    <Text color={theme.text.secondary}>
      Start with a task, mention files with @, or run setup commands.
    </Text>
    <Box marginTop={1} flexDirection="column">
      <Text color={theme.text.primary}>Try:</Text>
      <Text color={theme.text.secondary}> Review the current diff and suggest fixes</Text>
      <Text color={theme.text.secondary}> Find failing tests and make the smallest fix</Text>
      <Text color={theme.text.secondary}> Explain this repository architecture</Text>
    </Box>
    <Box marginTop={1}>
      <Text color={theme.ui.comment}>/setup · /provider · /model · /doctor · /permissions</Text>
    </Box>
  </Box>
);

interface MainContentProps {
  history: HistoryItem[];
  historyRemountKey: number;
  pendingAssistantText: string;
  liveToolCalls: IndividualToolCallDisplay[];
  terminalWidth: number;
  mainAreaWidth: number;
  isFocused?: boolean;
  liveAreaMaxHeight?: number;
  showEmptyState?: boolean;
}

const MainContentComponent: React.FC<MainContentProps> = ({
  history,
  historyRemountKey,
  pendingAssistantText,
  liveToolCalls,
  terminalWidth,
  mainAreaWidth,
  isFocused = true,
  liveAreaMaxHeight,
  showEmptyState = true,
}) => {
  const { compactMode } = useCompactMode();
  const { refreshStatic } = useUIActions();

  // callIds whose summary label is absorbed into a compact tool_group header.
  const absorbedCallIds = useMemo(() => {
    const absorbed = new Set<string>();
    if (!compactMode) return absorbed;
    for (const item of history) {
      if (item.type !== "tool_group") continue;
      if (isForceExpandGroup(item, false, undefined)) continue;
      for (const tool of item.tools) absorbed.add(tool.callId);
    }
    return absorbed;
  }, [compactMode, history]);

  // In compact mode, merge consecutive non-force-expanded tool_groups.
  const mergedHistory = useMemo(
    () =>
      compactMode ? mergeCompactToolGroups(history, false, undefined, absorbedCallIds) : history,
    [compactMode, history, absorbedCallIds],
  );

  // Build callId → summary label lookup from tool_use_summary items.
  const summaryByCallId = useMemo(() => {
    const map = new Map<string, string>();
    for (const item of history) {
      if (item.type === "tool_use_summary") {
        for (const callId of item.precedingToolUseIds) {
          if (!map.has(callId)) map.set(callId, item.summary);
        }
      }
    }
    return map;
  }, [history]);

  const getCompactLabel = useCallback(
    (item: HistoryItem | HistoryItemWithoutId): string | undefined => {
      if (item.type !== "tool_group" || item.tools.length === 0) return undefined;
      return summaryByCallId.get(item.tools[0].callId);
    },
    [summaryByCallId],
  );

  const isSummaryAbsorbed = useCallback(
    (item: HistoryItem | HistoryItemWithoutId): boolean => {
      if (item.type !== "tool_use_summary") return false;
      return item.precedingToolUseIds.some((id) => absorbedCallIds.has(id));
    },
    [absorbedCallIds],
  );

  // Trigger refreshStatic when a merge happens: history grew but merged length
  // did not — Static won't repaint committed items on its own.
  // Debounced to 300ms so rapid consecutive merges produce a single remount
  // instead of one full Static repaint per tool call.
  const prevHistoryLengthRef = useRef(history.length);
  const prevMergedLengthRef = useRef(mergedHistory.length);
  const refreshDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!compactMode) {
      prevHistoryLengthRef.current = history.length;
      prevMergedLengthRef.current = mergedHistory.length;
      return;
    }
    const prevH = prevHistoryLengthRef.current;
    const currH = history.length;
    const prevM = prevMergedLengthRef.current;
    const currM = mergedHistory.length;
    if (currH > prevH && currM <= prevM) {
      if (refreshDebounceRef.current !== null) clearTimeout(refreshDebounceRef.current);
      refreshDebounceRef.current = setTimeout(() => {
        refreshDebounceRef.current = null;
        refreshStatic();
      }, 300);
    }
    prevHistoryLengthRef.current = currH;
    prevMergedLengthRef.current = currM;
  }, [compactMode, history, mergedHistory, refreshStatic]);
  useEffect(
    () => () => {
      if (refreshDebounceRef.current !== null) clearTimeout(refreshDebounceRef.current);
    },
    [],
  );

  // Progressive replay: start with a small slice, grow via setImmediate.
  const [replayCount, setReplayCount] = useState(() => initialReplayCount(mergedHistory.length));
  const mergedLengthRef = useRef(mergedHistory.length);
  mergedLengthRef.current = mergedHistory.length;

  // React "store previous prop in state" pattern — reset replayCount during
  // render (not in an effect) so Static receives the right key+slice atomically.
  const [lastRemountKey, setLastRemountKey] = useState(historyRemountKey);
  if (lastRemountKey !== historyRemountKey) {
    setLastRemountKey(historyRemountKey);
    setReplayCount(initialReplayCount(mergedLengthRef.current));
  }

  useEffect(() => {
    if (replayCount >= mergedHistory.length) return;
    const remaining = mergedHistory.length - replayCount;
    if (remaining <= PROGRESSIVE_REPLAY_CHUNK_SIZE) {
      setReplayCount(mergedHistory.length);
      return;
    }
    const handle = setImmediate(() => {
      setReplayCount((c) => Math.min(c + PROGRESSIVE_REPLAY_CHUNK_SIZE, mergedLengthRef.current));
    });
    return () => clearImmediate(handle);
  }, [replayCount, mergedHistory.length]);

  // When the tail gap is small, show the full list immediately — avoids a
  // one-tick flash where a just-committed item vanishes from pending but isn't
  // yet in the Static slice.
  const visibleHistory =
    mergedHistory.length - replayCount <= PROGRESSIVE_REPLAY_CHUNK_SIZE
      ? mergedHistory
      : mergedHistory.slice(0, replayCount);
  const shouldShowEmptyState =
    showEmptyState &&
    visibleHistory.length === 0 &&
    pendingAssistantText.trim().length === 0 &&
    liveToolCalls.length === 0;

  return (
    <Box flexDirection="column" flexGrow={1}>
      {shouldShowEmptyState && <EmptyState width={mainAreaWidth} />}
      <Static key={historyRemountKey} items={visibleHistory}>
        {(item) => (
          <HistoryItemDisplay
            key={item.id}
            item={item}
            terminalWidth={terminalWidth}
            mainAreaWidth={mainAreaWidth}
            isPending={false}
            isFocused={isFocused}
            compactLabel={getCompactLabel(item)}
            summaryAbsorbed={isSummaryAbsorbed(item)}
          />
        )}
      </Static>
      {pendingAssistantText.trim().length > 0 && (
        <HistoryItemDisplay
          item={{ id: -1, type: "gemini", text: streamingWindow(pendingAssistantText) + "▌" }}
          terminalWidth={terminalWidth}
          mainAreaWidth={mainAreaWidth}
          isPending={true}
          isFocused={isFocused}
          availableTerminalHeight={STREAMING_WINDOW_LINES}
        />
      )}
      {liveToolCalls.length > 0 && (
        <HistoryItemDisplay
          item={{ id: -2, type: "tool_group", tools: liveToolCalls.map(truncateLiveResult) }}
          terminalWidth={terminalWidth}
          mainAreaWidth={mainAreaWidth}
          isPending={true}
          isFocused={isFocused}
          compactLabel={getCompactLabel({ type: "tool_group", tools: liveToolCalls })}
          availableTerminalHeight={liveAreaMaxHeight}
        />
      )}
    </Box>
  );
};

export const MainContent = React.memo(MainContentComponent);
