// DeepSeek DSML (DeepSeek Model Language) tool call format parser.
// Some DeepSeek models output tool calls as DSML in the content stream
// instead of using the standard OpenAI-compatible tool_calls delta field.
//
// Format example:
//   <｜｜DSML｜｜tool_calls>
//   <｜｜DSML｜｜invoke name="read_file">
//   <｜｜DSML｜｜parameter name="path" string="true">/path/to/file</｜｜DSML｜｜parameter>
//   </｜｜DSML｜｜invoke>
//   </｜｜DSML｜｜tool_calls>

const FF = "｜｜"; // ｜｜ (fullwidth vertical lines U+FF5C)
export const DSML_OPEN_TAG = `<${FF}DSML${FF}tool_calls>`;
const DSML_CLOSE_TAG = `</${FF}DSML${FF}tool_calls>`;

export interface DSMLParseResult {
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>;
  remainder: string;
}

export function parseDSMLToolCalls(content: string): DSMLParseResult | null {
  const startIdx = content.indexOf(DSML_OPEN_TAG);
  if (startIdx === -1) return null;

  const endIdx = content.indexOf(DSML_CLOSE_TAG, startIdx);
  if (endIdx === -1) return null; // block not yet complete

  const remainder = (
    content.slice(0, startIdx) + content.slice(endIdx + DSML_CLOSE_TAG.length)
  ).trim();
  const block = content.slice(startIdx + DSML_OPEN_TAG.length, endIdx);

  const toolCalls: DSMLParseResult["toolCalls"] = [];

  const invokeRe = new RegExp(
    `<${FF}DSML${FF}invoke name="([^"]+)">(.*?)<\\/${FF}DSML${FF}invoke>`,
    "gis",
  );

  let invokeMatch: RegExpExecArray | null;
  while ((invokeMatch = invokeRe.exec(block)) !== null) {
    const toolName = invokeMatch[1]!;
    const paramBlock = invokeMatch[2]!;
    const args: Record<string, unknown> = {};

    const paramRe = new RegExp(
      `<${FF}DSML${FF}parameter name="([^"]+)"([^>]*)>(.*?)<\\/${FF}DSML${FF}parameter>`,
      "gis",
    );

    let paramMatch: RegExpExecArray | null;
    while ((paramMatch = paramRe.exec(paramBlock)) !== null) {
      const paramName = paramMatch[1]!;
      const paramAttrs = paramMatch[2]!;
      const rawValue = paramMatch[3]!.trim();
      args[paramName] = coerceDSMLParam(rawValue, paramAttrs);
    }

    toolCalls.push({ name: toolName, arguments: args });
  }

  return { toolCalls, remainder };
}

function coerceDSMLParam(value: string, attrs: string): unknown {
  if (/\bstring="true"/i.test(attrs)) return value;
  if (/\bnumber="true"/i.test(attrs)) {
    const n = Number(value);
    return Number.isNaN(n) ? value : n;
  }
  if (/\bboolean="true"/i.test(attrs)) {
    return value.toLowerCase() === "true";
  }
  // Try JSON for objects/arrays, fall back to raw string.
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}
