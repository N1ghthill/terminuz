import type React from "react";
import { Box, Text } from "ink";
import { theme } from "../../semantic-colors.js";
import type { DoctorCheckResult, DoctorCheckStatus } from "../../types.js";

interface DoctorReportProps {
  checks: DoctorCheckResult[];
  summary: { pass: number; warn: number; fail: number };
}

const STATUS_ICONS: Record<DoctorCheckStatus, string> = {
  pass: "✓",
  warn: "⚠",
  fail: "✗",
};

const STATUS_COLORS: Record<DoctorCheckStatus, string> = {
  pass: theme.status.success,
  warn: theme.status.warning,
  fail: theme.status.error,
};

function groupByCategory(checks: DoctorCheckResult[]): Map<string, DoctorCheckResult[]> {
  const groups = new Map<string, DoctorCheckResult[]>();
  for (const check of checks) {
    const arr = groups.get(check.category) ?? [];
    arr.push(check);
    groups.set(check.category, arr);
  }
  return groups;
}

export const DoctorReport: React.FC<DoctorReportProps> = ({ checks, summary }) => {
  const groups = groupByCategory(checks);
  const hasIssues = summary.fail > 0 || summary.warn > 0;
  const actionable = checks.filter(
    (c) => (c.status === "fail" || c.status === "warn") && c.detail,
  );

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text color={theme.text.secondary} bold>
        DeepCode Doctor
      </Text>

      {Array.from(groups.entries()).map(([category, items]) => (
        <Box key={category} flexDirection="column" marginTop={1}>
          <Text color={theme.text.accent} bold>
            {category}
          </Text>
          {items.map((check) => (
            <Box key={check.name} flexDirection="row" gap={1}>
              <Text color={STATUS_COLORS[check.status]}>{STATUS_ICONS[check.status]}</Text>
              <Text color={check.status === "pass" ? theme.text.secondary : theme.text.primary}>
                {check.name}
              </Text>
              <Text color={STATUS_COLORS[check.status]} dimColor={check.status === "pass"}>
                {check.message}
              </Text>
            </Box>
          ))}
        </Box>
      ))}

      {/* Consolidated recommendations for failed/warned checks */}
      {actionable.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          <Text color={theme.text.secondary} dimColor>
            Recommendations
          </Text>
          {actionable.map((check) => (
            <Box key={check.name} flexDirection="row" gap={1} marginLeft={1}>
              <Text color={STATUS_COLORS[check.status]}>→</Text>
              <Text color={theme.text.secondary} dimColor wrap="wrap">
                {check.name}: {check.detail}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Summary bar */}
      <Box marginTop={1} flexDirection="row" gap={2}>
        <Text color={theme.status.success}>✓ {summary.pass}</Text>
        {summary.warn > 0 && (
          <Text color={theme.status.warning}>⚠ {summary.warn}</Text>
        )}
        {summary.fail > 0 && (
          <Text color={theme.status.error}>✗ {summary.fail}</Text>
        )}
        {!hasIssues && (
          <Text color={theme.text.secondary} dimColor>all good</Text>
        )}
      </Box>
    </Box>
  );
};
