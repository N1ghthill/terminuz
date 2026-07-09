import { useState, useEffect, useCallback, useMemo } from "react";
import { Box, Text, useInput, useApp } from "ink";
import path from "node:path";
import { SessionManager } from "@terminuz/core";
import { getProjectDataPath, type Session } from "@terminuz/shared";

interface SessionsAppProps {
  cwd: string;
  storageDir?: string;
}

function sessionLabel(session: Session): string {
  const name = typeof session.metadata["name"] === "string" ? session.metadata["name"] : undefined;
  const firstUser = session.messages.find((m) => m.role === "user");
  return name ?? firstUser?.content?.slice(0, 60) ?? "(no messages)";
}

export function SessionsApp({ cwd, storageDir }: SessionsAppProps) {
  const { exit } = useApp();
  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [search, setSearch] = useState("");
  const [searchMode, setSearchMode] = useState(false);
  const [terminalHeight, setTerminalHeight] = useState(process.stdout.rows ?? 24);

  useEffect(() => {
    const onResize = () => setTerminalHeight(process.stdout.rows ?? 24);
    process.stdout.on("resize", onResize);
    return () => {
      process.stdout.off("resize", onResize);
    };
  }, []);

  useEffect(() => {
    const manager = new SessionManager(cwd, undefined, storageDir);
    manager
      .loadAll()
      .then((loaded) => {
        const sorted = [...loaded].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        setAllSessions(sorted);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [cwd, storageDir]);

  const sessions = useMemo(() => {
    if (!search) return allSessions;
    const q = search.toLowerCase();
    return allSessions.filter((s) => sessionLabel(s).toLowerCase().includes(q));
  }, [allSessions, search]);

  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  const handleExit = useCallback(
    (sessionId?: string) => {
      if (sessionId) {
        process.stdout.write(`${sessionId}\n`);
      }
      exit();
    },
    [exit],
  );

  const clampedActive = Math.min(activeIndex, Math.max(0, sessions.length - 1));
  const listAreaHeight = Math.max(4, terminalHeight - 12);
  const scrollOffset = Math.max(
    0,
    Math.min(clampedActive - Math.floor(listAreaHeight / 2), sessions.length - listAreaHeight),
  );
  const visibleSessions = sessions.slice(scrollOffset, scrollOffset + listAreaHeight);

  useInput(
    (input, key) => {
      if (searchMode) {
        if (key.escape) {
          setSearchMode(false);
          setSearch("");
          return;
        }
        if (key.return) {
          const session = sessions[clampedActive];
          if (session) handleExit(session.id);
          return;
        }
        if (key.upArrow) {
          setActiveIndex((i) => Math.max(0, i - 1));
          return;
        }
        if (key.downArrow) {
          setActiveIndex((i) => Math.min(sessions.length - 1, i + 1));
          return;
        }
        if (key.backspace || key.delete) {
          setSearch((s) => s.slice(0, -1));
          return;
        }
        if (key.ctrl && input === "u") {
          setSearch("");
          return;
        }
        if (input && !key.ctrl && !key.meta && input.length === 1) {
          setSearch((s) => s + input);
        }
        return;
      }

      // Normal mode
      if (input === "/") {
        setSearchMode(true);
        return;
      }
      if (key.upArrow || input === "k") {
        setActiveIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setActiveIndex((i) => Math.min(sessions.length - 1, i + 1));
        return;
      }
      if (key.return) {
        const session = sessions[clampedActive];
        if (session) handleExit(session.id);
        return;
      }
      if (input === "q" || key.escape || (key.ctrl && input === "c")) {
        handleExit();
      }
    },
    { isActive: true },
  );

  if (loading) {
    return (
      <Box flexDirection="column">
        <Text color="cyan">
          Loading sessions from{" "}
          {storageDir ? path.join(storageDir, "sessions") : getProjectDataPath(cwd, "sessions")}...
        </Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderColor="cyan" flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between" marginBottom={0}>
          <Text bold color="cyan">
            Sessions
          </Text>
          <Text color="gray">
            [{sessions.length}
            {search ? `/${allSessions.length}` : ""}] ↑/↓ navigate
          </Text>
        </Box>
        <Box flexDirection="column" height={listAreaHeight}>
          {sessions.length === 0 && !loading && (
            <Text color="gray">
              {search
                ? `No sessions match "${search}"`
                : `No sessions found in ${storageDir ? path.join(storageDir, "sessions") : getProjectDataPath(cwd, "sessions")}`}
            </Text>
          )}
          {visibleSessions.map((session, visIdx) => {
            const globalIdx = scrollOffset + visIdx;
            const isActive = globalIdx === clampedActive;
            const shortId = session.id.slice(-8);
            const date = new Date(session.updatedAt).toLocaleString();
            const target = session.model
              ? `${session.provider}/${session.model}`
              : session.provider;
            const msgCount = session.messages.length;
            const preview = sessionLabel(session);

            return (
              <Box key={session.id} flexDirection="column">
                <Box>
                  <Text color={isActive ? "cyan" : undefined}>{isActive ? "▶ " : "  "}</Text>
                  <Text bold={isActive} color={isActive ? "cyan" : undefined} wrap="truncate-end">
                    {preview}
                  </Text>
                </Box>
                {isActive && (
                  <Box paddingLeft={4}>
                    <Text color="gray">
                      {shortId} {target} {msgCount} msgs {date}
                    </Text>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>
      <Box borderStyle="single" borderColor={searchMode ? "cyan" : "gray"} paddingX={1}>
        {searchMode ? (
          <Text color="cyan">
            search: {search}
            <Text color="white">█</Text>{" "}
            <Text color="gray">[Esc] cancel [↑/↓] navigate [Enter] resume</Text>
          </Text>
        ) : (
          <Text color="gray">[Enter] resume [↑/↓ j/k] navigate [/] search [q/Esc] quit</Text>
        )}
      </Box>
    </Box>
  );
}
