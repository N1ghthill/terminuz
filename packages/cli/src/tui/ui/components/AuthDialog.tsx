import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text } from "ink";
import { GitHubClient, GitHubOAuthDeviceFlow, type GitHubDeviceCode } from "@terminuz/core";
import { theme } from "../semantic-colors.js";
import { useKeypress } from "../hooks/useKeypress.js";
import { RadioButtonSelect, type RadioSelectItem } from "./shared/RadioButtonSelect.js";

type Phase = "menu" | "running" | "done" | "error";

interface AuthDialogProps {
  /** GitHub OAuth app client id, if one is configured. */
  clientId?: string;
  /** OAuth scopes to request. */
  scopes: string[];
  /** GitHub Enterprise base URL, if configured. */
  enterpriseUrl?: string;
  /** Worktree path, used to construct the GitHub client. */
  worktree: string;
  /** Human-readable summary of the current auth state. */
  statusSummary: string;
  /** Whether a token is currently stored. */
  hasToken: boolean;
  /** Persist (or, with `undefined`, clear) the GitHub token in config. */
  onPersistToken: (token: string | undefined) => Promise<void>;
  /** Close the dialog. */
  onClose: () => void;
}

/**
 * Interactive GitHub authentication dialog. "Login" runs the OAuth device
 * flow inline — showing the verification URL and code, then polling until the
 * user authorizes. Terminuz-authored (Qwen's auth dialog was not ported).
 */
export const AuthDialog: React.FC<AuthDialogProps> = ({
  clientId,
  scopes,
  enterpriseUrl,
  worktree,
  statusSummary,
  hasToken,
  onPersistToken,
  onClose,
}) => {
  const [phase, setPhase] = useState<Phase>("menu");
  const [deviceCode, setDeviceCode] = useState<GitHubDeviceCode | null>(null);
  const [message, setMessage] = useState<string>("");
  const abortRef = useRef<AbortController | null>(null);

  const items = useMemo<Array<RadioSelectItem<string>>>(
    () => [
      { key: "login", value: "login", label: "Login with GitHub" },
      { key: "clear", value: "clear", label: "Clear stored token", disabled: !hasToken },
      { key: "close", value: "close", label: "Close" },
    ],
    [hasToken],
  );

  const startLogin = useCallback(async () => {
    if (!clientId) {
      setMessage(
        "No OAuth client configured. Set github.oauthClientId in " +
          ".terminuz/config.json, or run `terminuz github login` in a terminal.",
      );
      return;
    }
    setPhase("running");
    setDeviceCode(null);
    setMessage("Requesting device code…");
    const controller = new AbortController();
    abortRef.current = controller;
    const flow = new GitHubOAuthDeviceFlow({
      enterpriseUrl,
      openBrowser: false,
      signal: controller.signal,
    });
    try {
      const token = await flow.authorize({
        clientId,
        scopes,
        onVerification: (code) => {
          setDeviceCode(code);
          setMessage("Waiting for authorization…");
        },
      });
      const client = new GitHubClient({ token: token.accessToken, enterpriseUrl, worktree });
      await client.getAuthenticatedUser();
      await onPersistToken(token.accessToken);
      setPhase("done");
      setMessage("Authenticated. Token saved to config.");
    } catch (error) {
      if (controller.signal.aborted) {
        setPhase("menu");
        setDeviceCode(null);
        setMessage("Login cancelled.");
        return;
      }
      setPhase("error");
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      abortRef.current = null;
    }
  }, [clientId, enterpriseUrl, onPersistToken, scopes, worktree]);

  const clearToken = useCallback(async () => {
    try {
      await onPersistToken(undefined);
      setPhase("done");
      setMessage("Stored token cleared.");
    } catch (error) {
      setPhase("error");
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, [onPersistToken]);

  const handleSelect = useCallback(
    (value: string) => {
      if (value === "login") {
        void startLogin();
      } else if (value === "clear") {
        void clearToken();
      } else {
        onClose();
      }
    },
    [clearToken, onClose, startLogin],
  );

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const handleEscape = useCallback(
    (key: { name: string }) => {
      if (key.name !== "escape") return;
      if (phase === "running") {
        abortRef.current?.abort();
        return;
      }
      onClose();
    },
    [onClose, phase],
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
        GitHub authentication
      </Text>
      <Text color={theme.text.secondary}>{statusSummary}</Text>

      {phase === "menu" && (
        <RadioButtonSelect items={items} onSelect={handleSelect} isFocused showNumbers={false} />
      )}

      {deviceCode && phase === "running" && (
        <Box flexDirection="column" marginTop={1}>
          <Text>
            Open: <Text color={theme.text.accent}>{deviceCode.verificationUri}</Text>
          </Text>
          <Text>
            Code:{" "}
            <Text bold color={theme.text.accent}>
              {deviceCode.userCode}
            </Text>
          </Text>
          <Text color={theme.text.secondary}>
            Expires in {Math.round(deviceCode.expiresIn / 60)} minutes.
          </Text>
        </Box>
      )}

      {message && (
        <Text
          color={
            phase === "error"
              ? theme.status.error
              : phase === "done"
                ? theme.status.success
                : theme.text.secondary
          }
        >
          {message}
        </Text>
      )}

      <Text color={theme.text.secondary}>
        {phase === "running"
          ? "Esc cancel login"
          : phase === "menu"
            ? "↑↓ navigate · Enter select · Esc close"
            : "Esc close"}
      </Text>
    </Box>
  );
};
