import React from "react";
import { Text } from "ink";
import { useUIState } from "../../contexts/UIStateContext.js";
import { theme } from "../../semantic-colors.js";

export function MCPHealthPill(): React.ReactElement | null {
  const { mcpConnected, mcpTotal } = useUIState();
  if (mcpTotal === 0) return null;
  const color = mcpConnected === mcpTotal ? theme.status.success : theme.status.warning;
  return (
    <Text color={color}>
      {" "}
      MCP {mcpConnected}/{mcpTotal}
    </Text>
  );
}
