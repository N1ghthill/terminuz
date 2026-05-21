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

  return (
    <Box flexDirection="column" marginLeft={2}>
      <Text color={theme.text.secondary} bold>
        DeepCode Doctor
      </Text>
      {Array.from(groups.entries()).map(([category, items]) => (
        <Box key={category} flexDirection="column" marginTop={1}>
          <Text color={theme.text.secondary} dimColor>
            {category}
          </Text>
          {items.map((check) => (
            <Box key={check.name} flexDirection="column">
              <Box flexDirection="row">
                <Box width={2}>
                  <Text color={STATUS_COLORS[check.status]}>{STATUS_ICONS[check.status]}</Text>
                </Box>
                <Text>
                  {check.name}
                  {": "}
                  <Text color={STATUS_COLORS[check.status]}>{check.message}</Text>
                </Text>
              </Box>
              {check.detail && (
                <Box marginLeft={2}>
                  <Text color={theme.text.secondary} dimColor>
                    {check.detail}
                  </Text>
                </Box>
              )}
            </Box>
          ))}
        </Box>
      ))}
      <Box marginTop={1} flexDirection="row">
        <Text color={theme.status.success}>✓ {summary.pass} pass</Text>
        {summary.warn > 0 && (
          <>
            <Text>{"  "}</Text>
            <Text color={theme.status.warning}>⚠ {summary.warn} warn</Text>
          </>
        )}
        {summary.fail > 0 && (
          <>
            <Text>{"  "}</Text>
            <Text color={theme.status.error}>✗ {summary.fail} fail</Text>
          </>
        )}
        {!hasIssues && (
          <Text color={theme.text.secondary}>{"  — all checks passed"}</Text>
        )}
      </Box>
    </Box>
  );
};
