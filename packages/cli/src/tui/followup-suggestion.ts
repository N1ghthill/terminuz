import type { DeepCodeRuntime } from "../runtime.js";
import type { Session } from "@deepcode/shared";

/**
 * Generates a follow-up suggestion after a model turn completes.
 * Uses a lightweight completion call (max 20 tokens) — cheap and fast.
 * Returns null on any error so callers silently ignore failures.
 */
export async function generateFollowupSuggestion(
  runtime: DeepCodeRuntime,
  session: Session,
  lastOutput: string,
  signal?: AbortSignal,
): Promise<string | null> {
  if (!lastOutput.trim()) return null;

  try {
    const provider = runtime.providers.get(session.provider);
    const model = session.model;
    if (!model) return null;

    const snippet = lastOutput.trim().slice(-300);
    const prompt =
      `[Task: suggest ONE concise follow-up question or action the user might ask next, in under 10 words. Return ONLY the suggestion text, no explanation, no quotes, no punctuation at the end.]\n\nAssistant just said:\n${snippet}\n\nFollow-up suggestion:`;

    const suggestion = await provider.complete(prompt, {
      model,
      maxTokens: 20,
      temperature: 0.7,
      signal,
    });

    const clean = suggestion.trim().replace(/^["']|["']$/g, "").replace(/[.!?]$/, "").split("\n")[0]!.trim();
    if (!clean || clean.length < 3 || clean.length > 80) return null;
    return clean;
  } catch {
    return null;
  }
}
