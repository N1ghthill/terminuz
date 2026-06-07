/**
 * Utilities for safe progressive commits of streaming markdown text to Static.
 *
 * Strategy (mirrors Qwen Code's findLastSafeSplitPoint):
 * Scan backwards for the last `\n\n` that is NOT inside a fenced code block.
 * Text before that point is safe to commit; text after stays pending.
 * Returns `content.length` when no safe split is found (keep everything pending).
 */

function isIndexInsideCodeBlock(content: string, index: number): boolean {
  let fenceCount = 0;
  let pos = 0;
  while (pos < index) {
    const fenceIdx = content.indexOf("```", pos);
    if (fenceIdx === -1 || fenceIdx >= index) break;
    fenceCount++;
    pos = fenceIdx + 3;
  }
  return fenceCount % 2 !== 0;
}

/**
 * Returns the index of the first character AFTER the last safe split point
 * (i.e., the `\n\n` boundary not inside a code block), or `content.length`
 * if no safe split exists.
 *
 * Usage:
 *   const split = findLastSafeSplitPoint(text);
 *   if (split < text.length) {
 *     commitToStatic(text.substring(0, split));
 *     keepAsPending(text.substring(split));
 *   }
 */
export function findLastSafeSplitPoint(content: string): number {
  let searchEnd = content.length;
  while (searchEnd > 0) {
    const nnIdx = content.lastIndexOf("\n\n", searchEnd - 1);
    if (nnIdx === -1) break;
    // Only split if there's content AFTER the \n\n (don't commit trailing whitespace)
    if (nnIdx + 2 < content.length && !isIndexInsideCodeBlock(content, nnIdx)) {
      return nnIdx + 2;
    }
    searchEnd = nnIdx;
  }
  return content.length;
}
