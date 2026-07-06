import React, { useCallback, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { CREDENTIAL_FREE_PROVIDERS, type ProviderId } from "@deepcode/shared";
import { theme } from "../semantic-colors.js";
import { useKeypress } from "../hooks/useKeypress.js";
import { BaseSelectionList } from "./shared/BaseSelectionList.js";
import type { SelectionListItem } from "../hooks/useSelectionList.js";

type Phase = "providers" | "actions" | "apiKey";
type ActionId = "use" | "setDefault" | "editKey" | "test" | "back" | "close";

export interface ProviderTestResult {
  ok: boolean;
  detail: string;
  latencyMs?: number;
}

interface ProviderListItem extends SelectionListItem<ProviderId> {
  provider: ProviderId;
  isCurrent: boolean;
  isLocal: boolean;
  keyIsSet: boolean;
}

interface ActionListItem extends SelectionListItem<ActionId> {
  icon: string;
  label: string;
  hint?: string;
}

interface StatusMessage {
  text: string;
  ok: boolean;
}

export interface ProviderDialogProps {
  providers: readonly ProviderId[];
  currentProvider: ProviderId;
  currentModel?: string;
  hasApiKey: (provider: ProviderId) => boolean;
  getProviderKeyHint: (provider: ProviderId) => string | undefined;
  onSelectProvider: (provider: ProviderId) => void;
  onSetDefaultProvider: (provider: ProviderId) => Promise<void>;
  onSaveApiKey: (provider: ProviderId, apiKey: string) => Promise<void>;
  onTestProvider: (provider: ProviderId) => Promise<ProviderTestResult>;
  onClose: () => void;
}

function getStatusMark(
  provider: ProviderId,
  keyIsSet: boolean,
): { icon: string; color: string; label: string } {
  if (CREDENTIAL_FREE_PROVIDERS.has(provider)) {
    return { icon: "⊙", color: theme.text.accent, label: "local" };
  }
  if (keyIsSet) {
    return { icon: "●", color: theme.status.success, label: "ready" };
  }
  return { icon: "○", color: theme.ui.comment, label: "setup needed" };
}

function getLatencyColor(ms: number): string {
  if (ms < 300) return theme.status.success;
  if (ms < 800) return theme.status.warning;
  return theme.status.error;
}

function maskApiKeyInput(length: number): string {
  if (length === 0) return "";
  const dots = Math.min(length, 24);
  const rest = length > 24 ? ` +${length - 24}` : "";
  return "●".repeat(dots) + rest;
}

export const ProviderDialog: React.FC<ProviderDialogProps> = ({
  providers,
  currentProvider,
  currentModel,
  hasApiKey,
  getProviderKeyHint,
  onSelectProvider,
  onSetDefaultProvider,
  onSaveApiKey,
  onTestProvider,
  onClose,
}) => {
  const [phase, setPhase] = useState<Phase>("providers");
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(currentProvider);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [testLatencyMs, setTestLatencyMs] = useState<number | undefined>(undefined);

  const isLocal = CREDENTIAL_FREE_PROVIDERS.has(selectedProvider);
  const keyIsSet = hasApiKey(selectedProvider);
  const keyHint = getProviderKeyHint(selectedProvider);
  const canTest = keyIsSet || isLocal;

  // Provider list items
  const providerItems = useMemo<ProviderListItem[]>(
    () =>
      providers.map((p) => ({
        key: p,
        value: p,
        provider: p,
        isCurrent: p === currentProvider,
        isLocal: CREDENTIAL_FREE_PROVIDERS.has(p),
        keyIsSet: hasApiKey(p),
      })),
    [currentProvider, hasApiKey, providers],
  );

  // Action menu items
  const actionItems = useMemo<ActionListItem[]>(
    () => [
      {
        key: "use",
        value: "use" as ActionId,
        icon: "●",
        label: selectedProvider === currentProvider
          ? "Current session provider"
          : "Use provider for this session",
      },
      {
        key: "editKey",
        value: "editKey" as ActionId,
        icon: "✎",
        label: isLocal ? "Edit API key (optional)" : "Save API key",
      },
      {
        key: "setDefault",
        value: "setDefault" as ActionId,
        icon: "◆",
        label: "Set as default in config",
      },
      {
        key: "test",
        value: "test" as ActionId,
        icon: "⚡",
        label: "Test connection",
        hint: canTest ? undefined : "save API key first",
        disabled: !canTest,
      },
      {
        key: "back",
        value: "back" as ActionId,
        icon: "←",
        label: "Back",
      },
      {
        key: "close",
        value: "close" as ActionId,
        icon: "✕",
        label: "Close",
      },
    ],
    [canTest, currentProvider, isLocal, selectedProvider],
  );

  // Handlers
  const selectProvider = useCallback(
    (provider: ProviderId) => {
      setSelectedProvider(provider);
      setStatus(null);
      setTestLatencyMs(undefined);
      setPhase("actions");
    },
    [],
  );

  const runTest = useCallback(async () => {
    setIsBusy(true);
    setTestLatencyMs(undefined);
    setStatus({ text: `Testing ${selectedProvider}…`, ok: true });
    try {
      const result = await onTestProvider(selectedProvider);
      if (result.ok) {
        const latency = result.latencyMs !== undefined ? ` · ${result.latencyMs}ms` : "";
        setStatus({ text: `✓ Connected${latency}  ${result.detail}`, ok: true });
        setTestLatencyMs(result.latencyMs);
      } else {
        setStatus({ text: `✗ ${result.detail}`, ok: false });
      }
    } catch (err) {
      setStatus({
        text: `✗ ${err instanceof Error ? err.message : String(err)}`,
        ok: false,
      });
    } finally {
      setIsBusy(false);
    }
  }, [onTestProvider, selectedProvider]);

  const selectAction = useCallback(
    (action: ActionId) => {
      if (isBusy) return;
      if (action === "editKey") {
        setApiKeyInput("");
        setStatus(null);
        setPhase("apiKey");
        return;
      }
      if (action === "test") {
        void runTest();
        return;
      }
      if (action === "use") {
        onSelectProvider(selectedProvider);
        onClose();
        return;
      }
      if (action === "setDefault") {
        setIsBusy(true);
        setStatus({ text: `Saving ${selectedProvider} as default…`, ok: true });
        void onSetDefaultProvider(selectedProvider)
          .then(() => {
            setStatus({ text: `Saved ${selectedProvider} as config default.`, ok: true });
            onClose();
          })
          .catch((err) => {
            setStatus({ text: err instanceof Error ? err.message : String(err), ok: false });
          })
          .finally(() => {
            setIsBusy(false);
          });
        return;
      }
      if (action === "back") {
        setStatus(null);
        setTestLatencyMs(undefined);
        setPhase("providers");
        return;
      }
      onClose();
    },
    [isBusy, onClose, onSelectProvider, onSetDefaultProvider, runTest, selectedProvider],
  );

  const saveApiKey = useCallback(async () => {
    const normalized = apiKeyInput.trim();
    if (!normalized) {
      setStatus({ text: "Type a key before saving.", ok: false });
      return;
    }
    setIsBusy(true);
    setStatus({ text: "Saving…", ok: true });
    try {
      await onSaveApiKey(selectedProvider, normalized);
      setApiKeyInput("");
      setStatus({ text: `Saved for ${selectedProvider}.`, ok: true });
      setPhase("actions");
    } catch (err) {
      setStatus({ text: err instanceof Error ? err.message : String(err), ok: false });
    } finally {
      setIsBusy(false);
    }
  }, [apiKeyInput, onSaveApiKey, selectedProvider]);

  // ESC navigation
  useKeypress(
    (key) => {
      if (key.name !== "escape" || isBusy) return;
      setStatus(null);
      setApiKeyInput("");
      if (phase === "providers") {
        onClose();
      } else if (phase === "apiKey") {
        setPhase("actions");
      } else {
        setPhase("providers");
      }
    },
    { isActive: true },
  );

  // API key raw input
  useInput(
    (input, key) => {
      if (phase !== "apiKey" || isBusy) return;
      if (key.return) { void saveApiKey(); return; }
      if (key.backspace || key.delete) { setApiKeyInput((p) => p.slice(0, -1)); return; }
      if (key.ctrl && input.toLowerCase() === "u") { setApiKeyInput(""); return; }
      if (input && !key.ctrl && !key.meta) { setApiKeyInput((p) => p + input); }
    },
    { isActive: phase === "apiKey" },
  );

  // Status message color: success messages shown in secondary (dim), errors in red
  const statusColor = status
    ? status.ok
      ? status.text.startsWith("✓")
        ? theme.status.success
        : theme.text.secondary
      : theme.status.error
    : undefined;

  const footer =
    phase === "apiKey"
      ? "Enter save  Ctrl+U clear  Esc cancel"
      : phase === "providers"
        ? "↑↓ navigate  Enter select  Esc close"
        : "↑↓ navigate  Enter confirm  Esc back";

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      paddingX={2}
      paddingY={1}
      marginLeft={2}
      marginRight={2}
      minWidth={44}
    >
      {/* ── Header ── */}
      <Box marginBottom={1} gap={1}>
        <Text bold color={theme.text.accent}>
          Provider Setup
        </Text>
        {phase !== "providers" && (
          <>
            <Text color={theme.text.secondary}>›</Text>
            <Text bold color={theme.text.primary}>
              {selectedProvider}
            </Text>
          </>
        )}
        {phase === "providers" && currentModel && (
          <Text color={theme.text.secondary}> current model: {currentModel}</Text>
        )}
      </Box>

      {/* ── Phase: provider list ── */}
      {phase === "providers" && (
        <BaseSelectionList<ProviderId, ProviderListItem>
          items={providerItems}
          onSelect={selectProvider}
          isFocused
          showNumbers={false}
          maxItemsToShow={8}
          renderItem={(item, { titleColor }) => {
            const { icon, color, label } = getStatusMark(item.provider, item.keyIsSet);
            return (
              <Box gap={1}>
                <Text color={color}>{icon}</Text>
                <Text color={titleColor} bold={item.isCurrent}>
                  {item.provider.padEnd(12)}
                </Text>
                <Text color={color} dimColor={!item.keyIsSet && !item.isLocal}>
                  {label}
                </Text>
                {item.isCurrent && (
                  <Text color={theme.text.accent}>▶</Text>
                )}
              </Box>
            );
          }}
        />
      )}

      {/* ── Phase: action menu ── */}
      {phase === "actions" && (
        <>
          {/* Key hint row */}
          <Box marginBottom={1} gap={1}>
            <Text color={theme.ui.comment}>session</Text>
            <Text color={selectedProvider === currentProvider ? theme.text.accent : theme.text.secondary}>
              {selectedProvider === currentProvider ? "active" : `still using ${currentProvider}`}
            </Text>
          </Box>
          <Box marginBottom={1} gap={1}>
            <Text color={theme.ui.comment}>key</Text>
            {isLocal ? (
              <Text color={theme.text.accent}>no key required</Text>
            ) : keyHint ? (
              <Text color={theme.text.secondary}>{keyHint}</Text>
            ) : (
              <Text color={theme.status.warning}>not configured</Text>
            )}
          </Box>

          <BaseSelectionList<ActionId, ActionListItem>
            items={actionItems}
            onSelect={selectAction}
            isFocused={!isBusy}
            showNumbers={false}
            maxItemsToShow={6}
            renderItem={(item, { titleColor }) => (
              <Box gap={1}>
                <Text color={titleColor}>{item.icon}</Text>
                <Text color={titleColor}>{item.label}</Text>
                {item.hint && (
                  <Text color={theme.ui.comment} dimColor>
                    ({item.hint})
                  </Text>
                )}
              </Box>
            )}
          />
        </>
      )}

      {/* ── Phase: API key input ── */}
      {phase === "apiKey" && (
        <Box flexDirection="column" gap={1} marginBottom={1}>
          {/* Current key row */}
          <Box gap={1}>
            <Text color={theme.ui.comment}>current</Text>
            {isLocal ? (
              <Text color={theme.text.accent}>no key required</Text>
            ) : keyHint ? (
              <Text color={theme.text.secondary}>{keyHint}</Text>
            ) : (
              <Text color={theme.ui.comment} dimColor>not set</Text>
            )}
          </Box>

          {/* Input row */}
          <Box gap={1}>
            <Text color={theme.ui.comment}>new key</Text>
            <Box borderStyle="single" borderColor={theme.border.focused} paddingX={1}>
              <Text color={theme.text.accent}>
                {apiKeyInput.length > 0
                  ? maskApiKeyInput(apiKeyInput.length)
                  : <Text color={theme.ui.comment} dimColor>paste or type…</Text>}
              </Text>
            </Box>
          </Box>
        </Box>
      )}

      {/* ── Status message ── */}
      {status && (
        <Box marginTop={1}>
          <Text color={statusColor}>{status.text}</Text>
        </Box>
      )}

      {/* ── Test result latency badge ── */}
      {phase === "actions" && testLatencyMs !== undefined && (
        <Box marginTop={0} gap={1}>
          <Text color={getLatencyColor(testLatencyMs)} bold>{testLatencyMs}ms</Text>
          <Text color={theme.text.secondary}>
            {testLatencyMs < 300 ? "excellent" : testLatencyMs < 800 ? "good" : "slow"}
          </Text>
        </Box>
      )}

      {/* ── Footer ── */}
      <Box
        marginTop={1}
        borderStyle="single"
        borderTop
        borderBottom={false}
        borderLeft={false}
        borderRight={false}
        borderColor={theme.ui.comment}
      >
        <Text color={theme.ui.comment} dimColor>
          {footer}
          {phase === "actions" && "  Test does not change the session."}
        </Text>
      </Box>
    </Box>
  );
};
