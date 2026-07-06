import React from "react";
import { Box, Text } from "ink";
import { theme } from "../../semantic-colors.js";
import { formatDuration } from "../../utils/formatters.js";
import { isTerminalGoalStatusKind, type GoalStatusKind } from "../../types.js";

interface GoalStatusMessageProps {
  kind: GoalStatusKind;
  condition: string;
  iterations?: number;
  durationMs?: number;
  lastReason?: string;
}

function pluralTurns(n: number): string {
  return n === 1 ? "turn" : "turns";
}

function assertNever(kind: never): never {
  throw new Error(`Unexpected goal status kind: ${kind}`);
}

const GoalStatusMessageInternal: React.FC<GoalStatusMessageProps> = ({
  kind,
  condition,
  iterations,
  durationMs,
  lastReason,
}) => {
  if (kind === "checking") {
    const reason = lastReason?.trim();
    return (
      <Box flexDirection="row">
        <Box width={2} flexShrink={0}>
          <Text color={theme.text.secondary}>○</Text>
        </Box>
        <Box flexGrow={1} flexDirection="column">
          <Text color={theme.text.secondary}>
            Checking goal
            {typeof iterations === "number" && iterations > 0
              ? ` · turn ${iterations}`
              : ""}{" "}
            · not achieved yet
          </Text>
          <Text color={theme.text.secondary} wrap="wrap">
            Goal: {condition}
          </Text>
          {reason ? (
            <Text color={theme.text.secondary} wrap="wrap">
              Evaluation: {reason}
            </Text>
          ) : null}
        </Box>
      </Box>
    );
  }

  const { prefix, prefixColor, title } = (() => {
    switch (kind) {
      case "set":
        return { prefix: "◎", prefixColor: theme.text.accent, title: "Goal set" };
      case "achieved":
        return { prefix: "✓", prefixColor: theme.status.success, title: "Goal achieved" };
      case "cleared":
        return { prefix: "○", prefixColor: theme.text.secondary, title: "Goal cleared" };
      case "failed":
        return { prefix: "✖", prefixColor: theme.status.error, title: "Goal not achieved" };
      case "aborted":
        return { prefix: "!", prefixColor: theme.status.warning, title: "Goal aborted" };
      default:
        return assertNever(kind);
    }
  })();

  const stats: string[] = [];
  if (typeof iterations === "number" && iterations > 0) {
    stats.push(`${iterations} ${pluralTurns(iterations)}`);
  }
  if (typeof durationMs === "number") {
    stats.push(formatDuration(durationMs, { hideTrailingZeros: true }));
  }
  const subtitle = stats.length > 0 ? stats.join(" · ") : null;

  return (
    <Box flexDirection="row">
      <Box width={2} flexShrink={0}>
        <Text color={prefixColor}>{prefix}</Text>
      </Box>
      <Box flexGrow={1} flexDirection="column">
        <Text color={prefixColor}>
          {title}
          {subtitle ? (
            <Text color={theme.text.secondary}> · {subtitle}</Text>
          ) : null}
        </Text>
        <Box flexDirection="row">
          <Box flexShrink={0} marginRight={1}>
            <Text color={theme.text.secondary}>Goal:</Text>
          </Box>
          <Box flexGrow={1}>
            <Text wrap="wrap">{condition}</Text>
          </Box>
        </Box>
        {isTerminalGoalStatusKind(kind) && lastReason?.trim() ? (
          <Text color={theme.text.secondary} wrap="wrap">
            Last evaluation: {lastReason.trim()}
          </Text>
        ) : null}
      </Box>
    </Box>
  );
};

export const GoalStatusMessage = React.memo(GoalStatusMessageInternal);
