import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Box, Text, useInput } from "ink";
import { SessionManager } from "@deepcode/core";
import type { Session } from "@deepcode/shared";
import { theme } from "../semantic-colors.js";

export interface SessionsDialogProps {
  cwd: string;
  onSelect: (sessionId: string) => void;
  onClose: () => void;
}

type LoadState = "loading" | "ready" | "error";

const MAX_VISIBLE = 12;

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return "agora";
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `há ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `há ${diffHours}h`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "ontem";
  if (diffDays < 7) return `há ${diffDays} dias`;
  const diffWeeks = Math.floor(diffDays / 7);
  if (diffWeeks === 1) return "há 1 semana";
  if (diffWeeks < 5) return `há ${diffWeeks} semanas`;
  const diffMonths = Math.floor(diffDays / 30);
  return `há ${diffMonths} mês${diffMonths !== 1 ? "es" : ""}`;
}

function sessionLabel(session: Session): string {
  const name = typeof session.metadata["name"] === "string" && session.metadata["name"].trim()
    ? session.metadata["name"].trim()
    : undefined;
  const firstUser = session.messages.find((m) => m.role === "user");
  const preview = typeof firstUser?.content === "string" ? firstUser.content.trim().slice(0, 60) : "";
  return name ?? (preview || "(sem mensagens)");
}

export const SessionsDialog: React.FC<SessionsDialogProps> = ({ cwd, onSelect, onClose }) => {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    const manager = new SessionManager(cwd);
    manager.loadAll()
      .then((loaded) => {
        const sorted = [...loaded].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setAllSessions(sorted);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, [cwd]);

  // Reset selection when search changes
  useEffect(() => { setActiveIndex(0); }, [search]);

  const sessions = useMemo(() => {
    if (!search) return allSessions;
    const q = search.toLowerCase();
    return allSessions.filter((s) => sessionLabel(s).toLowerCase().includes(q));
  }, [allSessions, search]);

  const clampedIndex = Math.min(activeIndex, Math.max(0, sessions.length - 1));

  const scrollTop = useMemo(
    () => Math.max(0, Math.min(clampedIndex - Math.floor(MAX_VISIBLE / 2), sessions.length - MAX_VISIBLE)),
    [clampedIndex, sessions.length],
  );

  const visibleSessions = sessions.slice(scrollTop, scrollTop + MAX_VISIBLE);

  const confirm = useCallback(() => {
    const session = sessions[clampedIndex];
    if (session) onSelect(session.id);
  }, [sessions, clampedIndex, onSelect]);

  useInput((input, key) => {
    if (loadState !== "ready") {
      if (key.escape) onClose();
      return;
    }
    if (key.escape) {
      if (search) { setSearch(""); return; }
      onClose();
      return;
    }
    if (key.return) { confirm(); return; }
    if (key.upArrow || (key.ctrl && input === "k")) {
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || (key.ctrl && input === "j")) {
      setActiveIndex((i) => Math.min(sessions.length - 1, i + 1));
      return;
    }
    if (key.backspace || key.delete) { setSearch((s) => s.slice(0, -1)); return; }
    if (key.ctrl && input === "u") { setSearch(""); return; }
    if (input && !key.ctrl && !key.meta && input.length === 1) {
      setSearch((s) => s + input);
    }
  }, { isActive: true });

  const canScrollUp = scrollTop > 0;
  const canScrollDown = scrollTop + MAX_VISIBLE < sessions.length;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      paddingX={2}
      paddingY={1}
      marginLeft={1}
      marginRight={1}
      minWidth={60}
    >
      {/* Title */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={theme.text.primary}>Retomar sessão</Text>
        <Text color={theme.ui.comment} dimColor>esc</Text>
      </Box>

      {/* Search box */}
      <Box
        borderStyle="single"
        borderColor={search ? theme.border.focused : theme.ui.comment}
        paddingX={1}
        marginBottom={1}
      >
        <Text color={theme.ui.comment}>⌕ </Text>
        {search ? (
          <Text color={theme.text.primary}>{search}<Text color={theme.text.accent}>▌</Text></Text>
        ) : (
          <Text color={theme.ui.comment} dimColor>Search<Text color={theme.text.accent}>▌</Text></Text>
        )}
      </Box>

      {loadState === "loading" && (
        <Box marginY={1}>
          <Text color={theme.text.secondary}>Carregando sessões…</Text>
        </Box>
      )}

      {loadState === "error" && (
        <Box marginY={1}>
          <Text color={theme.status.error}>✗ Não foi possível carregar sessões</Text>
        </Box>
      )}

      {loadState === "ready" && sessions.length === 0 && (
        <Box marginY={1}>
          <Text color={theme.ui.comment} dimColor>
            {search ? `Nenhuma sessão para "${search}"` : "Nenhuma sessão em .deepcode/sessions/"}
          </Text>
        </Box>
      )}

      {loadState === "ready" && sessions.length > 0 && (
        <Box flexDirection="column">
          {canScrollUp && <Text color={theme.ui.comment} dimColor>  ↑</Text>}

          {visibleSessions.map((session, visIdx) => {
            const globalIdx = scrollTop + visIdx;
            const isActive = globalIdx === clampedIndex;
            const shortId = session.id.slice(-8);
            const date = relativeTime(session.updatedAt);
            const target = session.model
              ? `${session.provider}/${session.model}`
              : session.provider;
            const msgCount = session.messages.length;
            const preview = sessionLabel(session);

            return (
              <Box key={session.id} flexDirection="column">
                <Box gap={1}>
                  <Text color={isActive ? theme.text.accent : theme.ui.comment}>
                    {isActive ? "›" : " "}
                  </Text>
                  <Text
                    color={isActive ? theme.text.primary : theme.text.secondary}
                    bold={isActive}
                    wrap="truncate-end"
                  >
                    {preview}
                  </Text>
                </Box>
                {isActive && (
                  <Box paddingLeft={2}>
                    <Text color={theme.ui.comment} dimColor>
                      {shortId}  {target}  {msgCount} msgs  {date}
                    </Text>
                  </Box>
                )}
              </Box>
            );
          })}

          {canScrollDown && <Text color={theme.ui.comment} dimColor>  ↓</Text>}

          <Box marginTop={1} justifyContent="space-between">
            <Text color={theme.ui.comment} dimColor>
              {sessions.length} session{sessions.length !== 1 ? "s" : ""}
              {search ? ` · "${search}"` : ""}
            </Text>
            {sessions.length > MAX_VISIBLE && (
              <Text color={theme.ui.comment} dimColor>
                {clampedIndex + 1}/{sessions.length}
              </Text>
            )}
          </Box>
        </Box>
      )}

      <Box
        marginTop={1}
        borderStyle="single"
        borderTop borderBottom={false} borderLeft={false} borderRight={false}
        borderColor={theme.ui.comment}
      >
        <Text color={theme.ui.comment} dimColor>
          ↑↓ navegar  digitar para buscar  Enter retomar  Esc fechar
        </Text>
      </Box>
    </Box>
  );
};
