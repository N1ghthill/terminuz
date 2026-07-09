import React from "react";
import { Box, Text } from "ink";
import type { HistoryItem } from "../types.js";
import {
  AssistantMessage,
  AssistantMessageContent,
  ThinkMessage,
  ThinkMessageContent,
  UserMessage,
  UserShellMessage,
} from "./messages/ConversationMessages.js";
import { ToolGroupMessage } from "./messages/ToolGroupMessage.js";
import { CompressionMessage } from "./messages/CompressionMessage.js";
import { SummaryMessage } from "./messages/SummaryMessage.js";
import { ContextUsage } from "./views/ContextUsage.js";
import { DoctorReport } from "./views/DoctorReport.js";
import { BtwMessage } from "./messages/BtwMessage.js";
import { StatsDisplay } from "./views/StatsDisplay.js";
import { GoalStatusMessage } from "./messages/GoalStatusMessage.js";
import { theme } from "../semantic-colors.js";
import { escapeAnsiCtrlCodes } from "../utils/textUtils.js";
import { useCompactMode } from "../contexts/CompactModeContext.js";

interface HistoryItemDisplayProps {
  item: HistoryItem;
  availableTerminalHeight?: number;
  terminalWidth: number;
  mainAreaWidth?: number;
  isPending: boolean;
  isFocused?: boolean;
  activeShellPtyId?: number | null;
  embeddedShellFocused?: boolean;
  compactLabel?: string;
  summaryAbsorbed?: boolean;
}

export const HistoryItemDisplay: React.FC<HistoryItemDisplayProps> = ({
  item,
  availableTerminalHeight,
  terminalWidth,
  mainAreaWidth,
  isPending,
  isFocused = true,
  activeShellPtyId,
  embeddedShellFocused,
  compactLabel,
  summaryAbsorbed = false,
}) => {
  const { compactMode } = useCompactMode();
  const safeItem = escapeAnsiCtrlCodes(item);
  const contentWidth = terminalWidth - 4;
  const boxWidth = mainAreaWidth ?? contentWidth;
  const marginTop =
    safeItem.type === "gemini_content" || safeItem.type === "gemini_thought_content" ? 0 : 1;

  return (
    <Box flexDirection="column" marginTop={marginTop} marginLeft={2} marginRight={2}>
      {safeItem.type === "user" && <UserMessage text={safeItem.text} />}
      {safeItem.type === "user_shell" && <UserShellMessage text={safeItem.text} />}
      {safeItem.type === "gemini" && (
        <AssistantMessage
          text={safeItem.text}
          isPending={isPending}
          availableTerminalHeight={availableTerminalHeight}
          contentWidth={contentWidth}
        />
      )}
      {safeItem.type === "gemini_content" && (
        <AssistantMessageContent
          text={safeItem.text}
          isPending={isPending}
          availableTerminalHeight={availableTerminalHeight}
          contentWidth={contentWidth}
        />
      )}
      {!compactMode && safeItem.type === "gemini_thought" && (
        <ThinkMessage
          text={safeItem.text}
          isPending={isPending}
          availableTerminalHeight={availableTerminalHeight}
          contentWidth={contentWidth}
        />
      )}
      {!compactMode && safeItem.type === "gemini_thought_content" && (
        <ThinkMessageContent
          text={safeItem.text}
          isPending={isPending}
          availableTerminalHeight={availableTerminalHeight}
          contentWidth={contentWidth}
        />
      )}
      {safeItem.type === "info" && <InfoMessage text={safeItem.text} />}
      {safeItem.type === "success" && <SuccessMessage text={safeItem.text} />}
      {safeItem.type === "warning" && <WarningMessage text={safeItem.text} />}
      {safeItem.type === "error" && <ErrorMessage text={safeItem.text} />}
      {safeItem.type === "tool_group" && (
        <ToolGroupMessage
          toolCalls={safeItem.tools}
          groupId={safeItem.id}
          availableTerminalHeight={availableTerminalHeight}
          contentWidth={contentWidth}
          isFocused={isFocused}
          isPending={isPending}
          activeShellPtyId={activeShellPtyId}
          embeddedShellFocused={embeddedShellFocused}
          memoryWriteCount={safeItem.memoryWriteCount}
          memoryReadCount={safeItem.memoryReadCount}
          isUserInitiated={safeItem.isUserInitiated}
          compactLabel={compactLabel}
        />
      )}
      {safeItem.type === "context_usage" && (
        <ContextUsage
          modelName={safeItem.modelName}
          totalTokens={safeItem.totalTokens}
          contextWindowSize={safeItem.contextWindowSize}
          breakdown={safeItem.breakdown}
          builtinTools={safeItem.builtinTools}
          mcpTools={safeItem.mcpTools}
          memoryFiles={safeItem.memoryFiles}
          skills={safeItem.skills}
          isEstimated={safeItem.isEstimated}
          showDetails={safeItem.showDetails}
        />
      )}
      {safeItem.type === "doctor" && (
        <DoctorReport checks={safeItem.checks} summary={safeItem.summary} />
      )}
      {safeItem.type === "stats" && (
        <StatsDisplay
          duration={safeItem.duration}
          promptTokens={safeItem.promptTokens}
          outputTokens={safeItem.outputTokens}
          messageCount={safeItem.messageCount}
        />
      )}
      {safeItem.type === "btw" && <BtwMessage btw={safeItem.btw} containerWidth={boxWidth} />}
      {safeItem.type === "goal_status" && (
        <GoalStatusMessage
          kind={safeItem.kind}
          condition={safeItem.condition}
          iterations={safeItem.iterations}
          durationMs={safeItem.durationMs}
          lastReason={safeItem.lastReason}
        />
      )}
      {safeItem.type === "compression" && <CompressionMessage compression={safeItem.compression} />}
      {safeItem.type === "summary" && <SummaryMessage summary={safeItem.summary} />}
      {safeItem.type === "tool_use_summary" && (!compactMode || !summaryAbsorbed) && (
        <Box paddingLeft={1}>
          <Text dimColor>● {safeItem.summary}</Text>
        </Box>
      )}
      {safeItem.type === "retry_countdown" && <WarningMessage text={safeItem.text} />}
      {safeItem.type === "away_recap" && <InfoMessage text={safeItem.text} />}
      {safeItem.type === "memory_saved" && (
        <InfoMessage
          text={`${safeItem.verb ?? "Saved"} ${safeItem.writtenCount} ${
            safeItem.writtenCount === 1 ? "memory file" : "memory files"
          }.`}
        />
      )}
      {shouldRenderFallback(safeItem.type) && safeItem.text && <InfoMessage text={safeItem.text} />}
      {safeItem.type === "quit" && (
        <InfoMessage text={`Session ended. Duration: ${safeItem.duration}`} width={boxWidth} />
      )}
    </Box>
  );
};

function shouldRenderFallback(type: HistoryItem["type"]): boolean {
  return (
    type === "notification" ||
    type === "extensions_list" ||
    type === "model_stats" ||
    type === "tool_stats"
  );
}

const InfoMessage: React.FC<{ text: string; width?: number }> = ({ text }) => (
  <Text color={theme.text.secondary}>ℹ {text}</Text>
);

const SuccessMessage: React.FC<{ text: string }> = ({ text }) => (
  <Text color={theme.status.success}>✓ {text}</Text>
);

const WarningMessage: React.FC<{ text: string }> = ({ text }) => (
  <Text color={theme.status.warning}>⚠ {text}</Text>
);

const ErrorMessage: React.FC<{ text: string }> = ({ text }) => (
  <Text color={theme.status.error}>✗ {text}</Text>
);
