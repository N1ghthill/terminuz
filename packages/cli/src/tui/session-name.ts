import type { Session } from "@terminuz/shared";
import type { TerminuzRuntime } from "../runtime.js";

/**
 * Generates a short (~5 word) descriptive name for a session based on its
 * first user message. Called once after the first turn and stored in
 * session.metadata.name. Returns null on any error.
 */
export async function generateSessionName(
  runtime: TerminuzRuntime,
  session: Session,
  signal?: AbortSignal,
): Promise<string | null> {
  const firstUser = session.messages.find((m) => m.role === "user");
  if (!firstUser?.content.trim()) return null;

  try {
    const snippet = firstUser.content.trim().slice(0, 200);
    const prompt = `Generate a concise 3-5 word title for a coding session that started with this user message. Return ONLY the title, no quotes, no punctuation at the end.\n\nUser message: ${snippet}\n\nTitle:`;

    const name = await runtime.agent.completeUtility({
      session,
      prompt,
      maxTokens: 15,
      temperature: 0.4,
      signal,
    });

    const clean = name
      .trim()
      .replace(/^["']|["']$/g, "")
      .replace(/[.!?]$/, "")
      .split("\n")[0]!
      .trim();
    if (!clean || clean.length < 3 || clean.length > 60) return null;
    return clean;
  } catch {
    return null;
  }
}
