// Symbol used by Effect's FiberFailure to store the Cause structure.
const EFFECT_FIBER_CAUSE = Symbol.for("effect/Runtime/FiberFailure/Cause");

function extractEffectCause(error: unknown): unknown {
  if (typeof error !== "object" || error === null) return undefined;
  const cause = (error as Record<symbol, unknown>)[EFFECT_FIBER_CAUSE];
  if (!cause || typeof cause !== "object") return undefined;
  // Effect Cause can be Fail { error } | Die { defect } | ...
  const tag = (cause as Record<string, unknown>)["_tag"];
  if (tag === "Fail") {
    const inner = (cause as Record<string, unknown>)["error"];
    // inner is UnknownException — its .error or .cause holds the original thrown value
    if (inner && typeof inner === "object") {
      return (
        (inner as Record<string, unknown>)["error"] ??
        (inner as Record<string, unknown>)["cause"] ??
        inner
      );
    }
  }
  if (tag === "Die") {
    return (cause as Record<string, unknown>)["defect"];
  }
  return undefined;
}

export function traverseErrorChain(error: unknown): string[] {
  const messages: string[] = [];
  let current: unknown = error;
  let depth = 0;

  while (current && depth < 6) {
    // Unwrap Effect FiberFailureImpl before extracting the message so we get
    // the original thrown value rather than the generic UnknownException text.
    const effectInner = extractEffectCause(current);
    if (effectInner !== undefined) {
      current = effectInner;
      depth += 1;
      continue;
    }

    if (current instanceof Error) {
      messages.push(current.message);
      current = "cause" in current ? current.cause : undefined;
      depth += 1;
      continue;
    }
    if (typeof current === "object" && current !== null && "message" in current) {
      const message = (current as { message?: unknown }).message;
      if (typeof message === "string") {
        messages.push(message);
      }
      current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
      depth += 1;
      continue;
    }
    break;
  }

  return messages.filter((message, index) => messages.indexOf(message) === index);
}

export function formatErrorChain(error: unknown): string {
  const messages = traverseErrorChain(error);
  return messages.length > 0 ? messages.join(": ") : String(error);
}
