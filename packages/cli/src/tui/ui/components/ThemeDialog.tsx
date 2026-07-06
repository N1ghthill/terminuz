import React, { useCallback, useMemo, useRef } from "react";
import { Box, Text } from "ink";
import { theme } from "../semantic-colors.js";
import { themeManager } from "../themes/theme-manager.js";
import { useKeypress } from "../hooks/useKeypress.js";
import { RadioButtonSelect, type RadioSelectItem } from "./shared/RadioButtonSelect.js";

interface ThemeDialogProps {
  /** Commit the chosen theme: applied live, persisted to config. */
  onSelect: (themeName: string) => void;
  /** Cancel without persisting. */
  onClose: () => void;
  /** Force a re-render after themeManager's active theme is mutated. */
  onPreview: () => void;
}

/**
 * Interactive theme picker. Highlighting a theme previews it live; Enter
 * commits and persists it; Esc reverts to the theme active on open.
 * DeepCode-authored (Qwen's ThemeDialog was not ported).
 */
export const ThemeDialog: React.FC<ThemeDialogProps> = ({ onSelect, onClose, onPreview }) => {
  const originalTheme = useRef(themeManager.getActiveTheme().name);
  const available = useMemo(() => themeManager.getAvailableThemes(), []);

  const items = useMemo<Array<RadioSelectItem<string>>>(
    () =>
      available.map((entry) => ({
        key: entry.name,
        value: entry.name,
        label: entry.name,
        themeNameDisplay: entry.name,
        themeTypeDisplay: `(${entry.type})`,
      })),
    [available],
  );

  const initialIndex = Math.max(
    0,
    available.findIndex((entry) => entry.name === originalTheme.current),
  );

  const handleEscape = useCallback(
    (key: { name: string }) => {
      if (key.name === "escape") {
        themeManager.setActiveTheme(originalTheme.current);
        onPreview();
        onClose();
      }
    },
    [onClose, onPreview],
  );
  useKeypress(handleEscape, { isActive: true });

  const handleHighlight = useCallback(
    (themeName: string) => {
      themeManager.setActiveTheme(themeName);
      onPreview();
    },
    [onPreview],
  );

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      paddingX={1}
      marginLeft={2}
      marginRight={2}
    >
      <Text bold color={theme.text.accent}>
        Select theme
      </Text>
      <RadioButtonSelect
        items={items}
        initialIndex={initialIndex}
        onHighlight={handleHighlight}
        onSelect={onSelect}
        isFocused
      />
      <Text color={theme.text.secondary}>↑↓ navigate · Enter apply · Esc cancel</Text>
    </Box>
  );
};
