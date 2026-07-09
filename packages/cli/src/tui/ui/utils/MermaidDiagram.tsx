import React from "react";
/**
 * MermaidDiagram — Terminuz stub.
 *
 * Qwen Code renders Mermaid diagrams to terminal images/ASCII. Terminuz does
 * not ship that renderer; the stub shows the diagram source as a dimmed block
 * so the information is still visible.
 */

import { Box, Text } from "ink";
import { theme } from "../semantic-colors.js";

interface MermaidDiagramProps {
  source: string;
  sourceCopyCommand: string;
  contentWidth: number;
  isPending: boolean;
  availableTerminalHeight?: number;
}

export const MermaidDiagram = ({ source }: MermaidDiagramProps) => (
  <Box flexDirection="column" paddingX={1}>
    <Text color={theme.text.secondary}>[mermaid diagram]</Text>
    <Text color={theme.text.secondary} dimColor>
      {source}
    </Text>
  </Box>
);
