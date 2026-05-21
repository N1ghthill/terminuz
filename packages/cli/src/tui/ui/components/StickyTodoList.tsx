import type React from "react";
import { memo, useMemo } from "react";
import { Box, Text } from "ink";
import { theme } from "../semantic-colors.js";
import {
  getOrderedStickyTodos,
  getStickyTodosRenderKey,
  STICKY_TODO_MAX_VISIBLE_ITEMS,
} from "../../utils/todoSnapshot.js";
import type { TodoItem } from "./TodoDisplay.js";

interface StickyTodoListProps {
  todos: TodoItem[];
  width: number;
  maxVisibleItems?: number;
}

const STATUS_ICONS = {
  pending: "○",
  in_progress: "◐",
  completed: "●",
} as const;

function clamp(value: number): number {
  if (!Number.isFinite(value)) return STICKY_TODO_MAX_VISIBLE_ITEMS;
  return Math.max(1, Math.min(STICKY_TODO_MAX_VISIBLE_ITEMS, Math.floor(value)));
}

const StickyTodoListComponent: React.FC<StickyTodoListProps> = ({
  todos,
  width,
  maxVisibleItems = STICKY_TODO_MAX_VISIBLE_ITEMS,
}) => {
  const ordered = useMemo(() => getOrderedStickyTodos(todos), [todos]);
  const numberById = useMemo(
    () => new Map(todos.map((todo, i) => [todo.id, `${i + 1}.`] as const)),
    [todos],
  );

  if (todos.length === 0) return null;

  const visibleCount = clamp(maxVisibleItems);
  const visible = ordered.slice(0, visibleCount);
  const hidden = ordered.length - visible.length;

  const numColWidth =
    Math.max(...visible.map((t, i) => (numberById.get(t.id) ?? `${i + 1}.`).length)) + 1;
  // 6 = 2 (icon) + 2 (border) + 2 (paddingX)
  const contentColWidth = Math.max(1, width - numColWidth - 6);

  return (
    <Box
      marginX={2}
      width={width}
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.border.default}
      paddingX={1}
    >
      <Text color={theme.text.secondary} bold>
        Tarefas em andamento
      </Text>
      {visible.map((todo, i) => {
        const num = numberById.get(todo.id) ?? `${i + 1}.`;
        const color =
          todo.status === "in_progress" ? theme.status.success : theme.text.primary;
        return (
          <Box key={todo.id} flexDirection="row" height={1}>
            <Box width={numColWidth}>
              <Text color={theme.text.secondary}>{num}</Text>
            </Box>
            <Box width={2}>
              <Text color={color}>{STATUS_ICONS[todo.status]}</Text>
            </Box>
            <Box width={contentColWidth}>
              <Text
                color={color}
                strikethrough={todo.status === "completed"}
                wrap="truncate-end"
              >
                {todo.content}
              </Text>
            </Box>
          </Box>
        );
      })}
      {hidden > 0 && (
        <Box flexDirection="row" height={1}>
          <Box width={numColWidth} />
          <Box width={2} />
          <Box width={contentColWidth}>
            <Text color={theme.text.secondary} wrap="truncate-end">
              ... e mais {hidden}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
};

export const StickyTodoList = memo(
  StickyTodoListComponent,
  (prev, next) =>
    prev.width === next.width &&
    prev.maxVisibleItems === next.maxVisibleItems &&
    getStickyTodosRenderKey(prev.todos) === getStickyTodosRenderKey(next.todos),
);
