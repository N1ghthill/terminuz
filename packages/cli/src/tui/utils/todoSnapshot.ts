import type { TodoItem } from "../ui/components/TodoDisplay.js";
import type { HistoryItem, HistoryItemWithoutId, IndividualToolCallDisplay } from "../ui/types.js";

type HistoryLikeItem = HistoryItem | HistoryItemWithoutId;

export const STICKY_TODO_MAX_VISIBLE_ITEMS = 5;
const MIN_HISTORY_ITEMS_AFTER_TODO_BEFORE_STICKY = 2;
const STICKY_TODO_ROWS_PER_VISIBLE_ITEM = 5;

const STATUS_PRIORITY: Record<TodoItem["status"], number> = {
  in_progress: 0,
  pending: 1,
  completed: 2,
};

function extractTodosFromResultDisplay(resultDisplay: unknown): TodoItem[] | null {
  if (!resultDisplay) return null;

  if (typeof resultDisplay === "object") {
    const candidate = resultDisplay as Record<string, unknown>;
    if (candidate["type"] === "todo_list" && Array.isArray(candidate["todos"])) {
      return candidate["todos"] as TodoItem[];
    }
  }

  if (typeof resultDisplay === "string") {
    try {
      const parsed = JSON.parse(resultDisplay) as Record<string, unknown>;
      if (parsed["type"] === "todo_list" && Array.isArray(parsed["todos"])) {
        return parsed["todos"] as TodoItem[];
      }
    } catch {
      return null;
    }
  }

  return null;
}

function findLatestTodoSnapshot(
  items: readonly HistoryLikeItem[],
): { itemIndex: number; todos: TodoItem[] | null } | undefined {
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i];
    if (item.type !== "tool_group") continue;
    for (let j = item.tools.length - 1; j >= 0; j--) {
      const tool = item.tools[j] as IndividualToolCallDisplay;
      const todos = extractTodosFromResultDisplay(tool.resultDisplay);
      if (todos) return { itemIndex: i, todos: todos.length > 0 ? todos : null };
    }
  }
  return undefined;
}

export function getStickyTodos(
  history: readonly HistoryItem[],
  pendingHistoryItems: readonly HistoryItemWithoutId[],
): TodoItem[] | null {
  if (findLatestTodoSnapshot(pendingHistoryItems) !== undefined) return null;

  const snap = findLatestTodoSnapshot(history);
  if (!snap || !snap.todos) return null;

  const itemsAfter = history.length - snap.itemIndex - 1;
  if (itemsAfter < MIN_HISTORY_ITEMS_AFTER_TODO_BEFORE_STICKY) return null;

  if (snap.todos.every((t) => t.status === "completed")) return null;

  return snap.todos;
}

export function getOrderedStickyTodos(todos: readonly TodoItem[]): TodoItem[] {
  return todos
    .map((todo, index) => ({ todo, index }))
    .sort(
      (a, b) =>
        STATUS_PRIORITY[a.todo.status] - STATUS_PRIORITY[b.todo.status] || a.index - b.index,
    )
    .map(({ todo }) => todo);
}

export function getStickyTodosRenderKey(todos: readonly TodoItem[] | null): string {
  if (!todos) return "null";
  return JSON.stringify(todos.map((t) => [t.id, t.content, t.status]));
}

export function getStickyTodoMaxVisibleItems(terminalHeight: number): number {
  if (!Number.isFinite(terminalHeight) || terminalHeight <= 0) {
    return STICKY_TODO_MAX_VISIBLE_ITEMS;
  }
  return Math.max(
    1,
    Math.min(
      STICKY_TODO_MAX_VISIBLE_ITEMS,
      Math.floor(terminalHeight / STICKY_TODO_ROWS_PER_VISIBLE_ITEM),
    ),
  );
}
