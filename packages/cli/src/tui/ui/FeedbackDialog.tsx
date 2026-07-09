import fs from "node:fs";
import path from "node:path";
import React, { useCallback, useMemo } from "react";
import { Box, Text } from "ink";
import { theme } from "./semantic-colors.js";
import { useKeypress } from "./hooks/useKeypress.js";
import { RadioButtonSelect, type RadioSelectItem } from "./components/shared/RadioButtonSelect.js";
import { getProjectDataPath } from "@terminuz/shared";

interface FeedbackDialogProps {
  cwd: string;
  onClose: () => void;
}

interface RatingOption {
  rating: number;
  label: string;
}

const RATINGS: readonly RatingOption[] = [
  { rating: 5, label: "Excellent" },
  { rating: 4, label: "Good" },
  { rating: 3, label: "Fair" },
  { rating: 2, label: "Poor" },
  { rating: 1, label: "Very poor" },
];

const CANCEL_VALUE = "__cancel__";

function appendFeedbackEntry(cwd: string, rating: number, label: string): void {
  const file = getProjectDataPath(cwd, "feedback.log");
  const entry = JSON.stringify({ ts: new Date().toISOString(), rating, label });
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, `${entry}\n`, "utf8");
  } catch {
    // Best-effort — never crash the TUI over a feedback write failure.
  }
}

export const FeedbackDialog: React.FC<FeedbackDialogProps> = ({ cwd, onClose }) => {
  const items = useMemo<Array<RadioSelectItem<string>>>(
    () => [
      ...RATINGS.map(({ rating, label }) => ({
        key: String(rating),
        value: String(rating),
        label: `${rating}  ${label}`,
      })),
      { key: CANCEL_VALUE, value: CANCEL_VALUE, label: "Cancel" },
    ],
    [],
  );

  const handleSelect = useCallback(
    (value: string) => {
      if (value !== CANCEL_VALUE) {
        const opt = RATINGS.find((r) => String(r.rating) === value);
        if (opt) appendFeedbackEntry(cwd, opt.rating, opt.label);
      }
      onClose();
    },
    [cwd, onClose],
  );

  const handleEscape = useCallback(
    (key: { name: string }) => {
      if (key.name === "escape") onClose();
    },
    [onClose],
  );
  useKeypress(handleEscape, { isActive: true });

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
        How useful was Terminuz in this session?
      </Text>
      <RadioButtonSelect items={items} onSelect={handleSelect} isFocused showNumbers={false} />
      <Text color={theme.text.secondary}>↑↓ navigate · Enter submit · Esc cancel</Text>
    </Box>
  );
};
