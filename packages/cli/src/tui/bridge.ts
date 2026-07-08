/**
 * Pure bridge logic between the DeepCode runtime and the TUI history model.
 *
 * Extracted from `AppContainer.tsx` so it can be unit-tested without rendering
 * Ink: these functions take plain data and return plain data. DeepCode-authored
 * (not ported from Qwen).
 */
import {
  createId,
  type Activity,
  type Message,
  type Session,
  type ToolCall,
} from "@deepcode/shared";
import {
  ToolCallStatus,
  type HistoryItemWithoutId,
  type IndividualToolCallDisplay,
} from "./ui/types.js";
import type { SlashCommand } from "./ui/commands/types.js";
import type { AgentResultDisplay } from "./qwen-core/index.js";

/** JSON-serialize tool arguments for a one-line description, bounded in length. */
export function safeStringify(value: unknown, maxLength = 220): string {
  try {
    const serialized = JSON.stringify(value);
    if (!serialized || serialized === "{}") return "";
    return serialized.length > maxLength ? `${serialized.slice(0, maxLength)}...` : serialized;
  } catch {
    return "";
  }
}

/**
 * Activity events are shared by the parent agent and every child session.
 * Legacy producers without session identity remain visible; identified child
 * events are excluded from the parent TUI to prevent cross-session matching.
 */
export function activityBelongsToSession(
  activity: Activity,
  sessionId: string | undefined,
): boolean {
  const activitySessionId = activity.metadata?.sessionId;
  return (
    typeof activitySessionId !== "string" ||
    sessionId === undefined ||
    activitySessionId === sessionId
  );
}

/** Build a tool-call display row (initially Executing) from a runtime ToolCall. */
export function toToolCallDisplay(call: ToolCall): IndividualToolCallDisplay {
  const serializedArgs = safeStringify(call.arguments);
  return {
    callId: call.id,
    name: call.name,
    description: serializedArgs ? `${call.name} ${serializedArgs}` : call.name,
    resultDisplay: undefined,
    status: ToolCallStatus.Executing,
    confirmationDetails: undefined,
  };
}

// Tool results beyond this many lines are truncated in Static to keep the
// scrollback readable and rendering fast. The model always has the full data.
const MAX_STATIC_RESULT_LINES = 200;

function truncateStaticResult(output: string): string {
  const lines = output.split("\n");
  if (lines.length <= MAX_STATIC_RESULT_LINES) return output;
  const truncated = lines.slice(0, MAX_STATIC_RESULT_LINES).join("\n");
  const extra = lines.length - MAX_STATIC_RESULT_LINES;
  return `${truncated}\n… +${extra} linhas`;
}

function isSubagentActivity(metadata: Record<string, unknown>): boolean {
  return metadata["activityKind"] === "subagent";
}

function taskPromptFromMetadata(metadata: Record<string, unknown>): string {
  const args = metadata["args"];
  if (typeof args !== "object" || args === null) return "";
  const prompt = (args as Record<string, unknown>)["prompt"];
  return typeof prompt === "string" ? prompt : "";
}

function taskTypeFromMetadata(metadata: Record<string, unknown>): string {
  const args = metadata["args"];
  if (typeof args !== "object" || args === null) return "subagent";
  const subagentType = (args as Record<string, unknown>)["subagent_type"];
  return typeof subagentType === "string" && subagentType.trim() ? subagentType.trim() : "subagent";
}

function createLiveSubagentDisplay(metadata: Record<string, unknown>): AgentResultDisplay {
  const prompt = taskPromptFromMetadata(metadata);
  return {
    type: "task_execution",
    subagentName: taskTypeFromMetadata(metadata),
    taskDescription: prompt || "Subagent task",
    taskPrompt: prompt,
    status: "running",
  };
}

function isLiveSubagentDisplay(tool: IndividualToolCallDisplay): boolean {
  const resultDisplay = tool.resultDisplay;
  return (
    typeof resultDisplay === "object" &&
    resultDisplay !== null &&
    "type" in resultDisplay &&
    (resultDisplay as AgentResultDisplay).type === "task_execution"
  );
}

/**
 * Map the messages produced by an agent turn into TUI history items: assistant
 * text becomes `gemini` items, tool calls become a `tool_group`, and `tool`
 * messages patch the matching tool's result by call id.
 *
 * `options.aborted` marks any tool that never reported a result as Canceled
 * (rather than the default Success) — used when a turn is interrupted.
 *
 * `options.skipAssistantText` omits the `gemini` item from assistant messages —
 * used when the streaming path already committed the text progressively to Static.
 */
export function mapMessagesToHistoryItems(
  messages: Message[],
  options: { aborted?: boolean; skipAssistantText?: boolean } = {},
): HistoryItemWithoutId[] {
  const items: HistoryItemWithoutId[] = [];
  const toolByCallId = new Map<string, IndividualToolCallDisplay>();

  for (const message of messages) {
    if (message.role === "user") {
      continue;
    }

    if (message.role === "assistant") {
      const text = message.content?.trim();
      if (text && !options.skipAssistantText) {
        items.push({ type: "gemini", text });
      }

      if (message.toolCalls?.length) {
        const tools = message.toolCalls.map((call) => toToolCallDisplay(call));
        for (const tool of tools) {
          toolByCallId.set(tool.callId, tool);
        }
        items.push({ type: "tool_group", tools });
      }
      continue;
    }

    if (message.role === "tool" && message.toolCallId) {
      const tool = toolByCallId.get(message.toolCallId);
      if (!tool) continue;
      const output = message.content ?? "";
      tool.resultDisplay = truncateStaticResult(output);
      tool.status = output.trimStart().startsWith("Error")
        ? ToolCallStatus.Error
        : ToolCallStatus.Success;
    }
  }

  for (const tool of toolByCallId.values()) {
    if (tool.status === ToolCallStatus.Executing || tool.status === ToolCallStatus.Pending) {
      tool.status = options.aborted ? ToolCallStatus.Canceled : ToolCallStatus.Success;
      tool.resultDisplay = tool.resultDisplay ?? (options.aborted ? "Cancelled." : "(no output)");
    }
  }

  return items;
}

/**
 * Fold a runtime `activity` event into the live tool-call list. `tool_call`
 * appends an executing entry; `tool_result`/`tool_error` resolve the oldest
 * still-executing entry with the same tool name (activities carry no call id,
 * so name + order is the best correlation). Returns `prev` unchanged when the
 * activity is not a tool activity.
 */
export function reduceToolActivity(
  prev: IndividualToolCallDisplay[],
  activity: Activity,
): IndividualToolCallDisplay[] {
  const meta = activity.metadata ?? {};
  const toolName = typeof meta.tool === "string" ? meta.tool : undefined;
  if (!toolName) return prev;
  const toolCallId = typeof meta.toolCallId === "string" ? meta.toolCallId : undefined;

  if (activity.type === "tool_call") {
    const serialized = safeStringify(meta.args);
    return [
      ...prev,
      {
        callId: toolCallId ?? createId("livetool"),
        name: toolName,
        description: serialized ? `${toolName} ${serialized}` : toolName,
        resultDisplay: isSubagentActivity(meta) ? createLiveSubagentDisplay(meta) : undefined,
        status: ToolCallStatus.Executing,
        confirmationDetails: undefined,
      },
    ];
  }

  if (activity.type === "tool_result" || activity.type === "tool_error") {
    const isError = activity.type === "tool_error";
    const output = isError
      ? typeof meta.error === "string"
        ? meta.error
        : activity.message
      : typeof meta.result === "string"
        ? meta.result
        : "(no output)";
    let index =
      toolCallId !== undefined
        ? prev.findIndex(
            (tool) =>
              tool.callId === toolCallId &&
              (tool.status === ToolCallStatus.Executing || tool.status === ToolCallStatus.Pending),
          )
        : -1;
    if (index === -1) {
      index = prev.findIndex(
        (tool) => tool.name === toolName && tool.status === ToolCallStatus.Executing,
      );
    }
    if (index === -1) return prev;
    if (isSubagentActivity(meta) || isLiveSubagentDisplay(prev[index]!)) {
      return prev.filter((_, i) => i !== index);
    }
    const next = [...prev];
    next[index] = {
      ...next[index]!,
      status: isError ? ToolCallStatus.Error : ToolCallStatus.Success,
      resultDisplay: output,
    };
    return next;
  }

  return prev;
}

/**
 * Restore a persisted session's conversation into the TUI history.
 * Groups messages into turns (user → replies) so that user bubbles appear
 * before the assistant responses they prompted.
 */
export function restoreHistoryFromSession(
  session: Session,
  addItem: (item: HistoryItemWithoutId) => void,
): void {
  const turns: Array<{ user: Message; replies: Message[] }> = [];
  for (const msg of session.messages) {
    if (msg.role === "user") {
      turns.push({ user: msg, replies: [] });
    } else if (turns.length > 0) {
      turns[turns.length - 1]!.replies.push(msg);
    }
  }
  for (const turn of turns) {
    if (turn.user.content.trim()) {
      addItem({ type: "user", text: turn.user.content });
    }
    const replyItems = mapMessagesToHistoryItems(turn.replies);
    // If no gemini item was produced (e.g. tool-only turn), surface the last
    // assistant text directly so the turn is not visually empty.
    if (!replyItems.some((item) => item.type === "gemini")) {
      const lastAssistant = [...turn.replies].reverse().find((m) => m.role === "assistant");
      const finalText = lastAssistant?.content?.trim();
      if (finalText) {
        replyItems.push({ type: "gemini", text: finalText });
      }
    }
    for (const item of replyItems) {
      addItem(item);
    }
  }
}

export interface ResolvedSlashInvocation {
  command: SlashCommand;
  name: string;
  args: string;
}

/** Whether `token` matches a command's name or one of its alt names. */
function matchesSlashToken(command: SlashCommand, token: string): boolean {
  const normalizedToken = token.toLowerCase();
  if (command.name.toLowerCase() === normalizedToken) return true;
  return Boolean(command.altNames?.some((alt) => alt.toLowerCase() === normalizedToken));
}

/**
 * Resolve a raw `/command sub args` string against the command tree, walking
 * sub-commands token by token. Returns the matched command, the consumed
 * command name, and the remaining argument string — or null if nothing matched.
 */
export function resolveSlashInvocation(
  rawInput: string,
  commands: readonly SlashCommand[],
): ResolvedSlashInvocation | null {
  const body = rawInput.replace(/^\//, "").trim();
  if (!body) return null;

  const tokens = body.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return null;

  let currentLevel: readonly SlashCommand[] | undefined = commands;
  let matched: SlashCommand | undefined;
  let consumed = 0;

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]!;
    const candidate: SlashCommand | undefined = currentLevel?.find((command: SlashCommand) =>
      matchesSlashToken(command, token),
    );
    if (!candidate) {
      break;
    }

    matched = candidate;
    consumed = i + 1;
    currentLevel = candidate.subCommands;

    if (!candidate.subCommands || candidate.subCommands.length === 0) {
      break;
    }
  }

  if (!matched) return null;

  return {
    command: matched,
    name: tokens.slice(0, consumed).join(" "),
    args: tokens.slice(consumed).join(" "),
  };
}
