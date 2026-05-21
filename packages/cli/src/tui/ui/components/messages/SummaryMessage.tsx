import type React from "react";
import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { SummaryProps } from "../../types.js";
import { theme } from "../../semantic-colors.js";

export interface SummaryDisplayProps {
  summary: SummaryProps;
}

function getSummaryText(summary: SummaryProps): string {
  if (summary.isPending) {
    switch (summary.stage) {
      case "generating":
        return "Gerando resumo do projeto...";
      case "saving":
        return "Salvando resumo...";
      default:
        return "Processando resumo...";
    }
  }
  const base = "Resumo gerado e salvo com sucesso!";
  return summary.filePath ? `${base} Salvo em: ${summary.filePath}` : base;
}

export const SummaryMessage: React.FC<SummaryDisplayProps> = ({ summary }) => (
  <Box flexDirection="row">
    <Box marginRight={1}>
      {summary.isPending ? (
        <Spinner type="dots" />
      ) : (
        <Text color={theme.status.success}>✓</Text>
      )}
    </Box>
    <Text color={summary.isPending ? theme.text.accent : theme.status.success}>
      {getSummaryText(summary)}
    </Text>
  </Box>
);
