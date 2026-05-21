import { Box, Text } from "ink";
import Spinner from "ink-spinner";
import type { CompressionProps } from "../../types.js";
import { CompressionStatus } from "../../../qwen-core/index.js";
import { theme } from "../../semantic-colors.js";

export interface CompressionDisplayProps {
  compression: CompressionProps;
}

function getCompressionText(compression: CompressionProps): string {
  const { isPending, originalTokenCount, newTokenCount, compressionStatus } =
    compression;

  if (isPending) return "Comprimindo histórico...";

  const orig = originalTokenCount ?? 0;
  const next = newTokenCount ?? 0;

  switch (compressionStatus) {
    case CompressionStatus.COMPRESSED:
      return `Histórico comprimido: ${orig} → ${next} tokens.`;
    case CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT:
      return orig < 50_000
        ? "Compressão sem benefício para esse tamanho de histórico."
        : "Compressão não reduziu o tamanho. Verifique o prompt de compressão.";
    case CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR:
      return "Não foi possível comprimir: erro na contagem de tokens.";
    case CompressionStatus.NOOP:
      return "Nada para comprimir.";
    default:
      return "";
  }
}

export function CompressionMessage({
  compression,
}: CompressionDisplayProps): React.JSX.Element {
  const text = getCompressionText(compression);

  return (
    <Box flexDirection="row">
      <Box marginRight={1}>
        {compression.isPending ? (
          <Spinner type="dots" />
        ) : (
          <Text color={theme.text.accent}>✦</Text>
        )}
      </Box>
      <Text color={compression.isPending ? theme.text.accent : theme.status.success}>
        {text}
      </Text>
    </Box>
  );
}
