import React, { useState, useEffect, useCallback } from "react";
import { Box, Text, useInput, useApp } from "ink";
import path from "node:path";
import { discoverGitProjects, enrichProjects, type ProjectInfo } from "@terminuz/core";

interface ProjectRow {
  info: ProjectInfo;
  enriched: boolean;
}

interface ProjectsAppProps {
  cwd: string;
}

export function ProjectsApp({ cwd }: ProjectsAppProps) {
  const { exit } = useApp();
  const [rows, setRows] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeIndex, setActiveIndex] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);
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
    let cancelled = false;

    async function load() {
      const paths = await discoverGitProjects(cwd, 3);
      if (cancelled) return;

      const initialRows: ProjectRow[] = paths.map((p) => ({
        info: { path: p, branch: null, isDirty: null },
        enriched: false,
      }));
      setRows(initialRows);
      setLoading(false);

      const BATCH = 8;
      for (let i = 0; i < paths.length; i += BATCH) {
        if (cancelled) return;
        const batch = paths.slice(i, i + BATCH);
        const enriched = await enrichProjects(batch, BATCH);
        if (cancelled) return;
        setRows((prev) => {
          const next = [...prev];
          for (let j = 0; j < enriched.length; j++) {
            const globalIdx = i + j;
            if (next[globalIdx]) {
              next[globalIdx] = { info: enriched[j]!, enriched: true };
            }
          }
          return next;
        });
      }
    }

    load().catch(() => setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const filtered = rows.filter((r) => {
    if (!search) return true;
    const name = path.basename(r.info.path).toLowerCase();
    return name.includes(search.toLowerCase());
  });

  const clampedActive = Math.min(activeIndex, Math.max(0, filtered.length - 1));

  const listAreaHeight = Math.max(4, terminalHeight - 8);

  const scrollOffset = Math.max(
    0,
    Math.min(clampedActive - Math.floor(listAreaHeight / 2), filtered.length - listAreaHeight),
  );

  const visibleRows = filtered.slice(scrollOffset, scrollOffset + listAreaHeight);

  const handleExit = useCallback(
    (selectedPath?: string) => {
      if (selectedPath) {
        process.stdout.write(selectedPath + "\n");
      }
      exit();
    },
    [exit],
  );

  useInput(
    (input, key) => {
      if (searchMode) {
        if (key.escape || (key.ctrl && input === "c")) {
          setSearchMode(false);
          setSearch("");
          return;
        }
        if (key.return) {
          setSearchMode(false);
          return;
        }
        if (key.backspace || key.delete) {
          setSearch((s) => s.slice(0, -1));
          return;
        }
        if (input && !key.ctrl && !key.meta) {
          setSearch((s) => s + input);
          setActiveIndex(0);
        }
        return;
      }

      if (key.upArrow || input === "k") {
        setActiveIndex((i) => Math.max(0, i - 1));
        setExpandedIndex(null);
        return;
      }
      if (key.downArrow || input === "j") {
        setActiveIndex((i) => Math.min(filtered.length - 1, i + 1));
        setExpandedIndex(null);
        return;
      }
      if (key.return) {
        const row = filtered[clampedActive];
        if (row) handleExit(row.info.path);
        return;
      }
      if (input === "c") {
        const row = filtered[clampedActive];
        if (row) handleExit(row.info.path);
        return;
      }
      if (input === "d") {
        setExpandedIndex((prev) => (prev === clampedActive ? null : clampedActive));
        return;
      }
      if (input === "/") {
        setSearchMode(true);
        setSearch("");
        return;
      }
      if (input === "q" || key.escape || (key.ctrl && input === "c")) {
        handleExit();
      }
    },
    { isActive: true },
  );

  if (loading && rows.length === 0) {
    return (
      <Box flexDirection="column">
        <Text color="cyan">Searching projects in {cwd}...</Text>
      </Box>
    );
  }

  const totalCount = filtered.length;

  return (
    <Box flexDirection="column">
      <Box borderStyle="single" borderColor="cyan" flexDirection="column" paddingX={1}>
        <Box justifyContent="space-between" marginBottom={0}>
          <Text bold color="cyan">
            Projects
          </Text>
          <Text color="gray">
            [{totalCount}]{"  "}
            <Text color="gray">↑/↓ navigate</Text>
          </Text>
        </Box>

        <Box flexDirection="column" height={listAreaHeight}>
          {filtered.length === 0 && !loading && (
            <Text color="gray">
              {search ? `No projects found for "${search}"` : `No git repositories found in ${cwd}`}
            </Text>
          )}
          {visibleRows.map((row, visIdx) => {
            const globalIdx = scrollOffset + visIdx;
            const isActive = globalIdx === clampedActive;
            const isExpanded = expandedIndex === globalIdx;
            const name = path.basename(row.info.path);
            const relativePath = path.relative(cwd, row.info.path) || ".";
            const branch = row.enriched ? (row.info.branch ?? "?") : "…";
            const dirty = row.enriched
              ? row.info.isDirty === null
                ? "?"
                : row.info.isDirty
                  ? "● dirty"
                  : "✓ clean"
              : "…";
            const dirtyColor = !row.enriched
              ? "gray"
              : row.info.isDirty === null
                ? "gray"
                : row.info.isDirty
                  ? "yellow"
                  : "green";

            return (
              <Box key={row.info.path} flexDirection="column">
                <Box>
                  <Text color={isActive ? "cyan" : undefined}>{isActive ? "▶ " : "  "}</Text>
                  <Text bold={isActive} color={isActive ? "cyan" : undefined} wrap="truncate-end">
                    {name}
                  </Text>
                  <Text> </Text>
                  <Text color="gray" wrap="truncate-end">
                    {branch}
                  </Text>
                  <Text> </Text>
                  <Text color={dirtyColor}>{dirty}</Text>
                </Box>
                {isExpanded && (
                  <Box flexDirection="column" paddingLeft={4}>
                    <Text color="gray">{relativePath}</Text>
                  </Box>
                )}
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box borderStyle="single" borderColor="gray" paddingX={1}>
        {searchMode ? (
          <Text>
            <Text color="cyan">buscar: </Text>
            <Text>{search}</Text>
            <Text color="cyan">█</Text>
          </Text>
        ) : (
          <Text color="gray">[Enter/c] cd [d] detalhes [/] buscar [q] sair</Text>
        )}
      </Box>
    </Box>
  );
}
