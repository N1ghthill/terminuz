import { Box, Text } from "ink";
import os from "node:os";
import { useUIState } from "../contexts/UIStateContext.js";
import { StreamingState } from "../types.js";
import { theme } from "../semantic-colors.js";
import { useGitBranchName } from "../hooks/useGitBranchName.js";
import { useElapsedTime } from "../hooks/useElapsedTime.js";

interface IterationInfo {
  round: number;
  max: number;
}

export interface AppHeaderProps {
  version: string;
  cwd: string;
  /** Formatted "provider › model" label (e.g. "anthropic › claude-opus-4-5"). */
  providerLabel: string;
  mode: "build" | "plan";
  iterationInfo: IterationInfo | null;
  updateAvailable?: string | null;
  sessionName?: string;
}

function tildeify(p: string): string {
  const home = os.homedir();
  return p.startsWith(home) ? `~${p.slice(home.length)}` : p;
}

function statusLabel(state: StreamingState): { text: string; color: string } {
  switch (state) {
    case StreamingState.Responding:
      return { text: "running", color: theme.status.success };
    case StreamingState.WaitingForConfirmation:
      return { text: "awaiting approval", color: theme.status.warning };
    default:
      return { text: "idle", color: theme.text.secondary };
  }
}

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export const AppHeader = ({
  version,
  cwd,
  providerLabel,
  mode,
  iterationInfo,
  updateAvailable,
  sessionName,
}: AppHeaderProps) => {
  const {
    streamingState,
    sessionStats: { lastPromptTokenCount, lastOutputTokenCount, totalPromptTokenCount, totalOutputTokenCount },
    terminalWidth,
  } = useUIState();
  const elapsedTime = useElapsedTime(streamingState);

  const branchName = useGitBranchName(cwd);
  const status = statusLabel(streamingState);
  const displayDir = tildeify(cwd);
  const hasTokens = lastPromptTokenCount > 0;
  const hasSessionTokens = totalPromptTokenCount > 0;

  // Color the context size based on absolute thresholds (model-agnostic).
  // lastPromptTokenCount = tokens sent on the last API call = real context pressure.
  const ctxColor = lastPromptTokenCount >= 80_000
    ? theme.status.error
    : lastPromptTokenCount >= 32_000
      ? theme.status.warning
      : theme.text.secondary;

  return (
    <Box
      flexDirection="column"
      marginLeft={2}
      marginRight={2}
      marginTop={1}
      marginBottom={1}
    >
      {/* Row 1: brand + version + provider/model + mode + status */}
      <Box flexDirection="row" flexWrap="nowrap" width={terminalWidth - 4}>
        <Text bold color={theme.text.accent}>
          DeepCode
        </Text>
        <Text color={theme.text.secondary}>{` v${version}`}</Text>
        {providerLabel && (
          <>
            <Text color={theme.text.secondary}>  </Text>
            <Text color={theme.text.primary}>{providerLabel}</Text>
          </>
        )}
        <Text color={theme.text.secondary}>  </Text>
        <Text
          bold
          color={
            mode === "build" ? theme.status.success : theme.status.warning
          }
        >
          {mode.toUpperCase()}
        </Text>
        <Text color={theme.text.secondary}>  </Text>
        <Text color={status.color}>
          {status.text}
          {streamingState === StreamingState.Responding && elapsedTime > 0
            ? ` ${elapsedTime}s`
            : ""}
        </Text>
        {iterationInfo && (
          <Text color={theme.text.secondary}>
            {"  "}iter {iterationInfo.round}/{iterationInfo.max}
          </Text>
        )}
        {hasTokens && (
          <Text color={ctxColor}>
            {"  "}↑{fmt(lastPromptTokenCount)}
            {" ↓"}
            {fmt(lastOutputTokenCount)}
          </Text>
        )}
      </Box>

      {/* Row 2: working directory + git branch + session name + session token totals */}
      <Box flexDirection="row">
        <Text color={theme.text.secondary} dimColor>
          {displayDir}
        </Text>
        {sessionName && (
          <Text color={theme.text.accent} dimColor>
            {"  "}{sessionName}
          </Text>
        )}
        {branchName && (
          <Text color={theme.text.accent} dimColor>
            {"  "}({branchName})
          </Text>
        )}
        {hasSessionTokens && (
          <Text color={theme.text.secondary} dimColor>
            {"  "}sessão ↑{fmt(totalPromptTokenCount)} ↓{fmt(totalOutputTokenCount)}
          </Text>
        )}
      </Box>

      {updateAvailable && (
        <Box flexDirection="row" gap={1}>
          <Text color={theme.status.warning}>⬆</Text>
          <Text color={theme.text.secondary} dimColor>
            nova versão disponível: {updateAvailable} — execute /update
          </Text>
        </Box>
      )}

    </Box>
  );
};
