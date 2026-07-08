import type React from "react";
import { Box, Text } from "ink";
import type { ApprovalRequest } from "@deepcode/core";
import { theme } from "../semantic-colors.js";

const APPROVAL_PREVIEW_MAX_LINES = 4;

export function formatApprovalOperationLabel(request: ApprovalRequest): string {
  if (request.operation.startsWith("mcp ")) {
    return "MCP tool";
  }

  const labels: Record<string, string> = {
    write_file: "write file",
    edit_file: "edit file",
    read_file: "read file",
    bash: "run shell command",
    shell: "run shell command",
    git: "run git command",
    fetch_web: "access URL",
    search_text: "search files",
    list_dir: "list directory",
    analyze_code: "analyze code",
  };
  return labels[request.operation] ?? request.operation.replace(/_/g, " ");
}

export const ApprovalPrompt: React.FC<{ request?: ApprovalRequest; queueLength?: number }> = ({ request, queueLength = 1 }) => {
  if (!request) return null;

  const operationLabel = formatApprovalOperationLabel(request);
  const mcpDetails = getMcpDetails(request);
  const hasDiff = !!(request.diff?.before && request.diff?.after);

  let beforeLines: string[] = [];
  let afterLines: string[] = [];
  let singleLines: string[] = [];
  let truncated = false;

  if (hasDiff) {
    beforeLines = request.diff!.before.split("\n").slice(0, APPROVAL_PREVIEW_MAX_LINES);
    afterLines = request.diff!.after.split("\n").slice(0, APPROVAL_PREVIEW_MAX_LINES);
    truncated =
      request.diff!.before.split("\n").length > APPROVAL_PREVIEW_MAX_LINES ||
      request.diff!.after.split("\n").length > APPROVAL_PREVIEW_MAX_LINES;
  } else {
    const raw = request.diff?.after ?? request.preview?.content ?? "";
    singleLines = raw.split("\n").slice(0, APPROVAL_PREVIEW_MAX_LINES);
    truncated = raw.split("\n").length > APPROVAL_PREVIEW_MAX_LINES;
  }

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.status.warning}
      paddingX={1}
      marginLeft={2}
      marginRight={2}
      marginTop={1}
    >
      <Text bold color={theme.status.warning}>
        {"⚠  "}{operationLabel}
        {request.level && <Text color={theme.text.secondary}>{` [${request.level}]`}</Text>}
        {queueLength > 1 && <Text color={theme.text.secondary}>{` (1 of ${queueLength})`}</Text>}
      </Text>

      {request.origin?.subagent && (
        <Text color={theme.text.accent}>
          {`Requested by subagent ${request.origin.subagentType ?? request.origin.taskId ?? "unknown"}`}
        </Text>
      )}

      {request.path && (
        <Text color={theme.text.secondary}>{request.path}</Text>
      )}

      {mcpDetails && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.text.primary}>{`Server: ${mcpDetails.server}`}</Text>
          <Text color={theme.text.primary}>{`Tool: ${mcpDetails.tool}`}</Text>
          {mcpDetails.argsPreview && (
            <Text color={theme.ui.comment} dimColor wrap="truncate">
              {`Args: ${mcpDetails.argsPreview}`}
            </Text>
          )}
        </Box>
      )}

      {!mcpDetails && request.preview?.command && (
        <Text color={theme.text.primary}>
          {"$ "}{request.preview.command}
          {request.preview.args?.length ? ` ${request.preview.args.join(" ")}` : ""}
        </Text>
      )}

      {hasDiff && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.status.error} dimColor>-- before</Text>
          {beforeLines.map((line, i) => (
            <Text key={`b${i}`} color={theme.status.error} dimColor wrap="truncate">
              {"− "}{line}
            </Text>
          ))}
          <Text color={theme.status.success} dimColor>-- after</Text>
          {afterLines.map((line, i) => (
            <Text key={`a${i}`} color={theme.status.success} dimColor wrap="truncate">
              {"+ "}{line}
            </Text>
          ))}
          {truncated && <Text color={theme.ui.comment} dimColor>…</Text>}
        </Box>
      )}

      {!hasDiff && singleLines.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {singleLines.map((line, i) => (
            <Text key={i} color={theme.ui.comment} dimColor wrap="truncate">
              {line}
            </Text>
          ))}
          {truncated && <Text color={theme.ui.comment} dimColor>…</Text>}
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={theme.text.secondary} dimColor>
          {"[↵/y] once  [s] session  [a] always  [n/Esc] deny"}
        </Text>
      </Box>
    </Box>
  );
};

function getMcpDetails(request: ApprovalRequest): { server: string; tool: string; argsPreview?: string } | null {
  const server = request.details?.server;
  const tool = request.details?.tool;
  if (typeof server !== "string" || typeof tool !== "string") {
    return null;
  }

  const rawArgs = request.details?.arguments;
  const argsPreview = rawArgs === undefined ? undefined : truncateText(JSON.stringify(rawArgs), 160);
  return { server, tool, argsPreview };
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}
