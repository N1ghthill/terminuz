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

  if (isPending) return "Compressing history...";

  const orig = originalTokenCount ?? 0;
  const next = newTokenCount ?? 0;

  switch (compressionStatus) {
    case CompressionStatus.COMPRESSED:
      return `History compressed: ${orig} -> ${next} tokens.`;
    case CompressionStatus.COMPRESSION_FAILED_INFLATED_TOKEN_COUNT:
      return orig < 50_000
        ? "Compression has no benefit for this history size."
        : "Compression did not reduce size. Check the compression prompt.";
    case CompressionStatus.COMPRESSION_FAILED_TOKEN_COUNT_ERROR:
      return "Could not compress: token counting failed.";
    case CompressionStatus.NOOP:
      return "Nothing to compress.";
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
