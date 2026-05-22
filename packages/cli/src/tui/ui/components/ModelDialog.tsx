import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Box, Text, useInput } from "ink";
import type { Model, ProviderId } from "@deepcode/shared";
import { theme } from "../semantic-colors.js";

type LoadState = "loading" | "ready" | "error";

export interface ModelDialogProps {
  currentProvider: ProviderId;
  currentModel?: string;
  onFetchModels: (provider: ProviderId, signal: AbortSignal) => Promise<Model[]>;
  onSelectModel: (modelId: string) => void;
  onClose: () => void;
}

// ── helpers ────────────────────────────────────────────────────────────────

function providerGroup(model: Model): string {
  const slash = model.id.indexOf("/");
  return slash !== -1 ? model.id.slice(0, slash) : model.provider;
}

function isFree(model: Model): boolean {
  return (
    model.pricing !== undefined &&
    model.pricing.inputPer1k === 0 &&
    model.pricing.outputPer1k === 0
  );
}

function fmtCtx(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(0)}M ctx`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k ctx`;
  return `${n} ctx`;
}

function fmtPrice(model: Model): string | null {
  if (!model.pricing) return null;
  if (isFree(model)) return "Free";
  const inp = model.pricing.inputPer1k;
  const out = model.pricing.outputPer1k;
  const fmtUsd = (n: number) => n < 0.01 ? `$${(n * 1000).toFixed(2)}/M` : `$${n.toFixed(3)}/k`;
  return `${fmtUsd(inp)} in · ${fmtUsd(out)} out`;
}

// ── flat display list (headers + model rows) ───────────────────────────────

type Row =
  | { kind: "header"; label: string }
  | { kind: "item"; model: Model; selIndex: number };

function buildRows(models: Model[], currentId: string | undefined, search: string): Row[] {
  const q = search.toLowerCase();
  const filtered = search
    ? models.filter(
        (m) => m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q),
      )
    : models;

  const rows: Row[] = [];
  let selIndex = 0;

  if (!search && currentId) {
    const recent = filtered.find((m) => m.id === currentId);
    if (recent) {
      rows.push({ kind: "header", label: "Recent" });
      rows.push({ kind: "item", model: recent, selIndex: selIndex++ });
    }
  }

  let lastGroup = "";
  for (const model of filtered) {
    if (!search && model.id === currentId) continue; // already in Recent
    const group = providerGroup(model);
    if (group !== lastGroup) {
      rows.push({ kind: "header", label: group });
      lastGroup = group;
    }
    rows.push({ kind: "item", model, selIndex: selIndex++ });
  }

  return rows;
}

// ── component ──────────────────────────────────────────────────────────────

const MAX_VISIBLE = 16;

export const ModelDialog: React.FC<ModelDialogProps> = ({
  currentProvider,
  currentModel,
  onFetchModels,
  onSelectModel,
  onClose,
}) => {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [models, setModels] = useState<Model[]>([]);
  const [errorMsg, setErrorMsg] = useState("");
  const [search, setSearch] = useState("");
  const [activeSelIndex, setActiveSelIndex] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  // Fetch on open
  useEffect(() => {
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    onFetchModels(currentProvider, ctrl.signal)
      .then((fetched) => {
        if (ctrl.signal.aborted) return;
        setModels(fetched);
        setLoadState("ready");
      })
      .catch((err) => {
        if (ctrl.signal.aborted) return;
        setErrorMsg(err instanceof Error ? err.message : String(err));
        setLoadState("error");
      });
    return () => ctrl.abort();
  }, [currentProvider, onFetchModels]);

  // Build rows
  const rows = useMemo(
    () => buildRows(models, currentModel, search),
    [models, currentModel, search],
  );

  const selectableCount = rows.filter((r) => r.kind === "item").length;
  const clampedIndex = Math.min(activeSelIndex, Math.max(0, selectableCount - 1));

  // Reset selection on search change
  useEffect(() => { setActiveSelIndex(0); }, [search]);

  // Active row position in flat list (for scrolling)
  const activeRowPos = useMemo(
    () => rows.findIndex((r) => r.kind === "item" && r.selIndex === clampedIndex),
    [rows, clampedIndex],
  );

  const scrollTop = useMemo(
    () => Math.max(0, Math.min(activeRowPos - 4, rows.length - MAX_VISIBLE)),
    [activeRowPos, rows.length],
  );

  const visibleRows = rows.slice(scrollTop, scrollTop + MAX_VISIBLE);

  // Confirm selection
  const confirm = useCallback(() => {
    const row = rows.find((r) => r.kind === "item" && r.selIndex === clampedIndex);
    if (row?.kind === "item") onSelectModel(row.model.id);
  }, [rows, clampedIndex, onSelectModel]);

  // Key handling
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
      setActiveSelIndex((i) => Math.max(0, i - 1));
      return;
    }
    if (key.downArrow || (key.ctrl && input === "j")) {
      setActiveSelIndex((i) => Math.min(selectableCount - 1, i + 1));
      return;
    }
    if (key.backspace || key.delete) { setSearch((s) => s.slice(0, -1)); return; }
    if (key.ctrl && input === "u") { setSearch(""); return; }
    if (input && !key.ctrl && !key.meta && input.length === 1) {
      setSearch((s) => s + input);
    }
  }, { isActive: true });

  const canScrollUp = scrollTop > 0;
  const canScrollDown = scrollTop + MAX_VISIBLE < rows.length;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      paddingX={2}
      paddingY={1}
      marginLeft={1}
      marginRight={1}
      minWidth={58}
    >
      {/* Title bar */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Box gap={1}>
          <Text bold color={theme.text.primary}>Select model</Text>
          <Text color={theme.text.secondary}>for</Text>
          <Text color={theme.text.accent}>{currentProvider}</Text>
        </Box>
        <Text color={theme.ui.comment} dimColor>esc</Text>
      </Box>

      {/* Search */}
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

      {/* Body */}
      {loadState === "loading" && (
        <Box marginY={1}>
          <Text color={theme.text.secondary}>Loading models…</Text>
        </Box>
      )}

      {loadState === "error" && (
        <Box flexDirection="column" marginY={1}>
          <Text color={theme.status.error}>✗ Could not load models</Text>
          <Text color={theme.ui.comment} dimColor>{errorMsg}</Text>
        </Box>
      )}

      {loadState === "ready" && selectableCount === 0 && (
        <Box marginY={1}>
          <Text color={theme.ui.comment} dimColor>No models match "{search}"</Text>
        </Box>
      )}

      {loadState === "ready" && selectableCount > 0 && (
        <Box flexDirection="column">
          {canScrollUp && (
            <Text color={theme.ui.comment} dimColor>  ↑</Text>
          )}

          {visibleRows.map((row, i) => {
            if (row.kind === "header") {
              return (
                <Box key={`h${i}`} marginTop={i === 0 ? 0 : 1}>
                  <Text color={theme.text.accent} bold>{row.label}</Text>
                </Box>
              );
            }

            const { model, selIndex } = row;
            const isActive = selIndex === clampedIndex;
            const isCurrent = model.id === currentModel;
            const price = fmtPrice(model);
            const group = providerGroup(model);

            return (
              <Box key={model.id} flexDirection="column">
                <Box gap={1}>
                  {/* selector */}
                  <Text color={isActive ? theme.text.accent : theme.ui.comment}>
                    {isCurrent ? "●" : isActive ? "›" : " "}
                  </Text>

                  {/* model name */}
                  <Box flexGrow={1} gap={1}>
                    <Text
                      color={isActive ? theme.text.primary : theme.text.secondary}
                      bold={isActive}
                    >
                      {model.name}
                    </Text>
                    <Text color={theme.text.accent} dimColor>
                      {group}
                    </Text>
                  </Box>

                  {/* price badge (always visible) */}
                  {price && (
                    <Text
                      color={price === "Free" ? theme.status.success : theme.ui.comment}
                      dimColor={!isActive}
                    >
                      {price}
                    </Text>
                  )}
                </Box>

                {/* expanded info when focused */}
                {isActive && (
                  <Box paddingLeft={2} gap={2}>
                    <Text color={theme.ui.comment} dimColor>{model.id}</Text>
                    {model.contextLength > 0 && (
                      <Text color={theme.ui.comment} dimColor>
                        {fmtCtx(model.contextLength)}
                      </Text>
                    )}
                  </Box>
                )}
              </Box>
            );
          })}

          {canScrollDown && (
            <Text color={theme.ui.comment} dimColor>  ↓</Text>
          )}
        </Box>
      )}

      {/* count */}
      {loadState === "ready" && (
        <Box marginTop={1}>
          <Text color={theme.ui.comment} dimColor>
            {selectableCount} model{selectableCount !== 1 ? "s" : ""}
            {search ? ` · "${search}"` : ""}
          </Text>
        </Box>
      )}

      {/* footer */}
      <Box
        marginTop={1}
        borderStyle="single"
        borderTop borderBottom={false} borderLeft={false} borderRight={false}
        borderColor={theme.ui.comment}
      >
        <Text color={theme.ui.comment} dimColor>
          ↑↓ navigate  type to search  Enter use for session  Esc close
        </Text>
      </Box>
    </Box>
  );
};
