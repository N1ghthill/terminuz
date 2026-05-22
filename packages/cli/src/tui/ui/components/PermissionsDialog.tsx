import React, { useCallback, useState } from "react";
import { Box, Text } from "ink";
import type { PermissionMode } from "@deepcode/shared";
import { theme } from "../semantic-colors.js";
import { useKeypress } from "../hooks/useKeypress.js";

/** The five permission keys editable from the dialog. */
export type PermissionKey = "read" | "write" | "gitLocal" | "shell" | "dangerous";

export type PermissionModes = Record<PermissionKey, PermissionMode>;

const PERMISSION_KEYS: readonly PermissionKey[] = [
  "read",
  "write",
  "gitLocal",
  "shell",
  "dangerous",
];

const MODE_CYCLE: readonly PermissionMode[] = ["allow", "ask", "deny"];

const ACTIONS = ["save", "cancel"] as const;

const ALL_ROWS = [...PERMISSION_KEYS, ...ACTIONS] as const;

function nextMode(mode: PermissionMode): PermissionMode {
  const index = MODE_CYCLE.indexOf(mode);
  return MODE_CYCLE[(index + 1) % MODE_CYCLE.length]!;
}

function modeColor(mode: PermissionMode): string {
  if (mode === "allow") return theme.status.success;
  if (mode === "deny") return theme.status.error;
  return theme.status.warning;
}

const KEY_LABEL: Record<PermissionKey, string> = {
  read: "read",
  write: "write",
  gitLocal: "git local",
  shell: "shell",
  dangerous: "dangerous",
};

interface PermissionsDialogProps {
  /** Current persisted permission modes. */
  current: PermissionModes;
  /** Persist the edited modes (applied live and written to config). */
  onSave: (modes: PermissionModes) => void;
  /** Close without persisting. */
  onClose: () => void;
}

/**
 * Interactive permission-policy editor. ↑↓ navigates rows; Enter on a
 * permission row cycles allow→ask→deny; Enter on "save" persists; Esc cancels.
 */
export const PermissionsDialog: React.FC<PermissionsDialogProps> = ({
  current,
  onSave,
  onClose,
}) => {
  const [modes, setModes] = useState<PermissionModes>(current);
  const [focusIndex, setFocusIndex] = useState(0);

  const dirty = PERMISSION_KEYS.some((k) => modes[k] !== current[k]);

  const handleKey = useCallback(
    (key: { name: string; ctrl: boolean }) => {
      if (key.name === "escape") {
        onClose();
        return;
      }
      if (key.name === "up" || (key.ctrl && key.name === "p")) {
        setFocusIndex((i) => (i - 1 + ALL_ROWS.length) % ALL_ROWS.length);
        return;
      }
      if (key.name === "down" || (key.ctrl && key.name === "n")) {
        setFocusIndex((i) => (i + 1) % ALL_ROWS.length);
        return;
      }
      if (key.name === "return") {
        const row = ALL_ROWS[focusIndex];
        if (row === "save") {
          onSave(modes);
          return;
        }
        if (row === "cancel") {
          onClose();
          return;
        }
        setModes((prev) => ({ ...prev, [row]: nextMode(prev[row]) }));
      }
    },
    [focusIndex, modes, onClose, onSave],
  );

  useKeypress(handleKey, { isActive: true });

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
        Permissões
      </Text>

      {PERMISSION_KEYS.map((key, i) => {
        const focused = focusIndex === i;
        const mode = modes[key];
        return (
          <Box key={key} flexDirection="row" gap={1}>
            <Text color={focused ? theme.text.accent : theme.text.secondary}>
              {focused ? "›" : " "}
            </Text>
            <Text color={focused ? theme.text.primary : theme.text.secondary} bold={focused}>
              {KEY_LABEL[key].padEnd(10)}
            </Text>
            <Text color={modeColor(mode)} bold={focused}>
              {mode}
            </Text>
          </Box>
        );
      })}

      <Box marginTop={1} flexDirection="column">
        {ACTIONS.map((action, i) => {
          const focused = focusIndex === PERMISSION_KEYS.length + i;
          const label = action === "save"
            ? dirty ? "Salvar" : "Salvar (sem edições)"
            : "Cancelar";
          return (
            <Box key={action} flexDirection="row" gap={1}>
              <Text color={focused ? theme.text.accent : theme.text.secondary}>
                {focused ? "›" : " "}
              </Text>
              <Text color={focused ? theme.text.primary : theme.text.secondary} bold={focused}>
                {label}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Text color={theme.text.secondary} dimColor>
        ↑↓ navegar · Enter cicla allow/ask/deny ou confirma · Esc cancelar
      </Text>
    </Box>
  );
};
