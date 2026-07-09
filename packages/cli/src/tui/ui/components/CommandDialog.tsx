import React from "react";
import { Box, Text } from "ink";
import { theme } from "../semantic-colors.js";

export interface CommandDialogProps {
  title: string;
  lines: string[];
  footerText?: string;
}

export const CommandDialog: React.FC<CommandDialogProps> = ({
  title,
  lines,
  footerText = "Press Esc or Enter to close.",
}) => (
  <Box marginLeft={2} marginRight={2} marginTop={1} flexDirection="column">
    <Box borderStyle="round" borderColor={theme.border.default} padding={1} flexDirection="column">
      <Text bold color={theme.text.accent}>
        {title}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {lines.map((line, index) => (
          <Text key={index} color={theme.text.primary}>
            {line}
          </Text>
        ))}
      </Box>
      <Box marginTop={1}>
        <Text color={theme.text.secondary}>{footerText}</Text>
      </Box>
    </Box>
  </Box>
);
