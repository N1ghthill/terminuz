import { Box, Text } from "ink";
import { useContext } from "react";
import { AppContext } from "../contexts/AppContext.js";
import { theme } from "../semantic-colors.js";

/**
 * Non-blocking warning banner shown above the Composer.
 * Displays startup warnings (config issues, missing API keys, etc.).
 * Init errors are rendered separately in the main content area.
 */
export const Notifications = () => {
  const appCtx = useContext(AppContext);
  const warnings = appCtx?.startupWarnings ?? [];

  if (warnings.length === 0) return null;

  return (
    <Box flexDirection="column" marginLeft={2} marginRight={2} marginBottom={1}>
      <Box
        borderStyle="round"
        borderColor={theme.status.warning}
        paddingX={1}
        flexDirection="column"
      >
        {warnings.map((w, i) => (
          <Text key={i} color={theme.status.warning}>
            ⚠ {w}
          </Text>
        ))}
      </Box>
    </Box>
  );
};
