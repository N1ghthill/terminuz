import type React from "react";
import { Box, Text } from "ink";
import { theme } from "../../semantic-colors.js";
import type {
  ContextCategoryBreakdown,
  ContextToolDetail,
  ContextMemoryDetail,
  ContextSkillDetail,
} from "../../types.js";

const FILLED = "█"; // █
const BUFFER = "▒"; // ▒
const EMPTY = "░"; // ░

const CONTENT_WIDTH = 56;

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtPct(tokens: number, total: number): string {
  if (total <= 0) return "0.0";
  const p = (tokens / total) * 100;
  return p > 100 ? ">100" : p.toFixed(1);
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : `${s.slice(0, max - 1)}…`;
}

const ProgressBar: React.FC<{
  usedPct: number;
  bufferPct: number;
  width: number;
}> = ({ usedPct, bufferPct, width }) => {
  const used = Math.round((Math.min(usedPct, 100) / 100) * width);
  const buffer = Math.round((Math.min(bufferPct, 100 - usedPct) / 100) * width);
  const free = Math.max(0, width - used - buffer);

  const usedColor =
    usedPct > 80 ? theme.status.error : usedPct > 60 ? theme.status.warning : theme.text.accent;

  return (
    <Text>
      <Text color={usedColor}>{FILLED.repeat(Math.max(0, used))}</Text>
      <Text color={theme.text.secondary}>{EMPTY.repeat(Math.max(0, free))}</Text>
      <Text color={theme.status.warning}>{BUFFER.repeat(Math.max(0, buffer))}</Text>
    </Text>
  );
};

const CategoryRow: React.FC<{
  symbol: string;
  label: string;
  tokens: number;
  total: number;
  symbolColor?: string;
  overLimit?: boolean;
}> = ({ symbol, label, tokens, total, symbolColor, overLimit }) => (
  <Box width={CONTENT_WIDTH}>
    <Box width={2}>
      <Text color={symbolColor ?? theme.text.secondary}>{symbol}</Text>
    </Box>
    <Box width={24}>
      <Text color={theme.text.primary}>{label}</Text>
    </Box>
    <Box flexGrow={1} justifyContent="flex-end">
      <Text color={overLimit ? theme.status.error : theme.text.secondary}>
        {fmtTokens(tokens)} tokens ({fmtPct(tokens, total)}%)
      </Text>
    </Box>
  </Box>
);

const DetailRow: React.FC<{ name: string; tokens: number }> = ({ name, tokens }) => (
  <Box width={CONTENT_WIDTH} paddingLeft={2}>
    <Text color={theme.text.secondary}>{"└"} </Text>
    <Box width={32}>
      <Text color={theme.text.link}>{truncate(name, 30)}</Text>
    </Box>
    <Box flexGrow={1} justifyContent="flex-end">
      <Text color={theme.text.secondary}>{fmtTokens(tokens)} tokens</Text>
    </Box>
  </Box>
);

export interface ContextUsageProps {
  modelName: string;
  totalTokens: number;
  contextWindowSize: number;
  breakdown: ContextCategoryBreakdown;
  builtinTools: ContextToolDetail[];
  mcpTools: ContextToolDetail[];
  memoryFiles: ContextMemoryDetail[];
  skills: ContextSkillDetail[];
  isEstimated?: boolean;
  showDetails?: boolean;
}

export const ContextUsage: React.FC<ContextUsageProps> = ({
  modelName,
  totalTokens,
  contextWindowSize,
  breakdown,
  builtinTools,
  mcpTools,
  memoryFiles,
  skills,
  isEstimated,
  showDetails = false,
}) => {
  const pct = contextWindowSize > 0 ? (totalTokens / contextWindowSize) * 100 : 0;
  const overLimit = pct > 100;
  const bufferPct =
    contextWindowSize > 0 ? (breakdown.autocompactBuffer / contextWindowSize) * 100 : 0;

  const sortDesc = <T extends { tokens: number }>(arr: T[]) =>
    [...arr].sort((a, b) => b.tokens - a.tokens);

  return (
    <Box
      borderStyle="round"
      borderColor={theme.border.default}
      flexDirection="column"
      paddingY={1}
      paddingX={2}
    >
      <Text bold color={theme.text.accent}>
        Context Usage
      </Text>
      <Box height={1} />

      {isEstimated ? (
        <Box marginBottom={1}>
          <Text color={theme.status.warning} italic>
            Estimate - send a message to see actual usage.
          </Text>
        </Box>
      ) : (
        <>
          <Box width={CONTENT_WIDTH} marginBottom={1}>
            <Text color={theme.text.secondary}>Model: {modelName}</Text>
            <Box flexGrow={1} justifyContent="flex-end">
              <Text color={theme.text.secondary}>
                Window: {fmtTokens(contextWindowSize)} tokens
              </Text>
            </Box>
          </Box>
          <Box width={CONTENT_WIDTH}>
            <ProgressBar usedPct={Math.min(pct, 100)} bufferPct={bufferPct} width={CONTENT_WIDTH} />
          </Box>
          {overLimit && (
            <Box marginBottom={1}>
              <Text color={theme.status.error}>
                Context exceeds the limit. Use /compact or /clear to reduce it.
              </Text>
            </Box>
          )}
          <Box height={1} />
          <CategoryRow
            symbol={FILLED}
            label="Used"
            tokens={totalTokens}
            total={contextWindowSize}
            symbolColor={overLimit ? theme.status.error : theme.text.accent}
            overLimit={overLimit}
          />
          <CategoryRow
            symbol={EMPTY}
            label="Free"
            tokens={breakdown.freeSpace}
            total={contextWindowSize}
            symbolColor={theme.text.secondary}
          />
          <CategoryRow
            symbol={BUFFER}
            label="Compression buffer"
            tokens={breakdown.autocompactBuffer}
            total={contextWindowSize}
            symbolColor={theme.status.warning}
          />
          <Box height={1} />
          <Text bold color={theme.text.primary}>
            By category
          </Text>
        </>
      )}

      <CategoryRow
        symbol={FILLED}
        label="System prompt"
        tokens={breakdown.systemPrompt}
        total={contextWindowSize}
        symbolColor={theme.text.accent}
      />
      {breakdown.builtinTools > 0 && (
        <CategoryRow
          symbol={FILLED}
          label="Built-in tools"
          tokens={breakdown.builtinTools}
          total={contextWindowSize}
          symbolColor={theme.text.accent}
        />
      )}
      {breakdown.mcpTools > 0 && (
        <CategoryRow
          symbol={FILLED}
          label="MCP tools"
          tokens={breakdown.mcpTools}
          total={contextWindowSize}
          symbolColor={theme.text.accent}
        />
      )}
      {breakdown.memoryFiles > 0 && (
        <CategoryRow
          symbol={FILLED}
          label="Memory files"
          tokens={breakdown.memoryFiles}
          total={contextWindowSize}
          symbolColor={theme.text.accent}
        />
      )}
      {!isEstimated && (
        <CategoryRow
          symbol={FILLED}
          label="Messages"
          tokens={breakdown.messages}
          total={contextWindowSize}
          symbolColor={theme.text.accent}
        />
      )}

      {showDetails ? (
        <>
          {builtinTools.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color={theme.text.primary}>
                Built-in tools
              </Text>
              {sortDesc(builtinTools).map((t) => (
                <DetailRow key={t.name} name={t.name} tokens={t.tokens} />
              ))}
            </Box>
          )}
          {mcpTools.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color={theme.text.primary}>
                MCP tools
              </Text>
              {sortDesc(mcpTools).map((t) => (
                <DetailRow key={t.name} name={t.name} tokens={t.tokens} />
              ))}
            </Box>
          )}
          {memoryFiles.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color={theme.text.primary}>
                Memory files
              </Text>
              {sortDesc(memoryFiles).map((f) => (
                <DetailRow key={f.path} name={f.path} tokens={f.tokens} />
              ))}
            </Box>
          )}
          {skills.length > 0 && (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color={theme.text.primary}>
                Skills
              </Text>
              {skills.map((sk) => (
                <DetailRow key={sk.name} name={sk.name} tokens={sk.tokens} />
              ))}
            </Box>
          )}
        </>
      ) : (
        <Box marginTop={1}>
          <Text color={theme.text.secondary} italic>
            Use /context detail para ver o detalhamento por item.
          </Text>
        </Box>
      )}
    </Box>
  );
};
