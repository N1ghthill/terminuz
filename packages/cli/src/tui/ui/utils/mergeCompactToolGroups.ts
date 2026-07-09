import type { HistoryItem, IndividualToolCallDisplay } from "../types.js";
import { ToolCallStatus } from "../types.js";
import type { AgentResultDisplay } from "@terminuz/tui-shim";

function isAgentWithPendingConfirmation(rd: IndividualToolCallDisplay["resultDisplay"]): boolean {
  return (
    typeof rd === "object" &&
    rd !== null &&
    "type" in rd &&
    (rd as AgentResultDisplay).type === "task_execution" &&
    (rd as AgentResultDisplay).pendingConfirmation !== undefined
  );
}

function isTerminalSubagent(rd: IndividualToolCallDisplay["resultDisplay"]): boolean {
  if (
    typeof rd !== "object" ||
    rd === null ||
    !("type" in rd) ||
    (rd as { type?: string }).type !== "task_execution"
  ) {
    return false;
  }
  const status = (rd as { status?: string }).status;
  return status === "completed" || status === "failed" || status === "cancelled";
}

/**
 * Whether a tool_group should be force-expanded (not collapsed in compact mode).
 * Exported so MainContent can determine which callIds get their label absorbed
 * by the compact header.
 */
export function isForceExpandGroup(
  item: HistoryItem,
  embeddedShellFocused: boolean,
  activeShellPtyId: number | undefined,
): boolean {
  if (item.type !== "tool_group") return false;

  if (item.isUserInitiated) return true;

  const tools = item.tools;

  if (tools.some((t) => t.status === ToolCallStatus.Confirming)) return true;
  if (tools.some((t) => t.status === ToolCallStatus.Error)) return true;
  if (tools.some((t) => isAgentWithPendingConfirmation(t.resultDisplay))) return true;
  if (tools.some((t) => isTerminalSubagent(t.resultDisplay))) return true;

  if (
    embeddedShellFocused &&
    activeShellPtyId !== undefined &&
    tools.some((t) => t.ptyId === activeShellPtyId && t.status === ToolCallStatus.Executing)
  ) {
    return true;
  }

  return false;
}

function isHiddenInCompactMode(item: HistoryItem): boolean {
  return (
    item.type === "gemini_thought" ||
    item.type === "gemini_thought_content" ||
    item.type === "tool_use_summary"
  );
}

/**
 * Returns true if toggling compact mode would visually change the output.
 * When false, refreshStatic can be skipped on Ctrl+O.
 */
export function compactToggleHasVisualEffect(history: readonly HistoryItem[]): boolean {
  for (const item of history) {
    if (
      item.type === "tool_group" ||
      item.type === "gemini_thought" ||
      item.type === "gemini_thought_content"
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Merge consecutive tool_group history items for compact mode display.
 * Tool_groups separated only by hidden items (thoughts, summaries) are
 * treated as consecutive because nothing is visible between them.
 */
export function mergeCompactToolGroups(
  items: HistoryItem[],
  embeddedShellFocused: boolean = false,
  activeShellPtyId: number | undefined = undefined,
  absorbedCallIds: ReadonlySet<string> = new Set(),
): HistoryItem[] {
  const result: HistoryItem[] = [];
  let i = 0;

  while (i < items.length) {
    const item = items[i];

    // Drop tool_use_summary items whose callIds are all absorbed by a compact header.
    if (item.type === "tool_use_summary") {
      const allAbsorbed =
        item.precedingToolUseIds.length > 0 &&
        item.precedingToolUseIds.every((id) => absorbedCallIds.has(id));
      if (allAbsorbed) {
        i++;
        continue;
      }
      result.push(item);
      i++;
      continue;
    }

    // Pass through non-mergeable items unchanged.
    if (
      item.type !== "tool_group" ||
      isForceExpandGroup(item, embeddedShellFocused, activeShellPtyId)
    ) {
      result.push(item);
      i++;
      continue;
    }

    // item is a mergeable tool_group — look ahead for more.
    const mergeableGroups: HistoryItem[] = [item];
    let lastMergedIdx = i;
    let j = i + 1;

    while (j < items.length) {
      const next = items[j];

      if (isHiddenInCompactMode(next)) {
        j++;
        continue;
      }

      if (
        next.type === "tool_group" &&
        !isForceExpandGroup(next, embeddedShellFocused, activeShellPtyId)
      ) {
        mergeableGroups.push(next);
        lastMergedIdx = j;
        j++;
        continue;
      }

      break;
    }

    if (mergeableGroups.length === 1) {
      result.push(item);
      i++;
      continue;
    }

    const mergedTools = mergeableGroups.flatMap((g) => (g.type === "tool_group" ? g.tools : []));
    const mergedGroup: HistoryItem = {
      type: "tool_group",
      tools: mergedTools,
      id: mergeableGroups[0].id,
    };

    result.push(mergedGroup);
    i = lastMergedIdx + 1;
  }

  return result;
}
