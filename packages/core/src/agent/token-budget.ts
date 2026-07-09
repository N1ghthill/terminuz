/** Rough cost estimate used when no pricing data is available ($USD per 1k tokens). */
const ESTIMATE_INPUT_PER_1K = 0.003;
const ESTIMATE_OUTPUT_PER_1K = 0.012;

export type BudgetKind = "inputTokens" | "outputTokens" | "cost";

export type BudgetStatus =
  | { status: "ok" }
  | { status: "warning"; kind: BudgetKind; used: number; limit: number; fraction: number }
  | { status: "exceeded"; kind: BudgetKind; used: number; limit: number };

export interface TokenBudgetConfig {
  maxInputTokens?: number;
  maxOutputTokens?: number;
  maxCostUsd?: number;
  warnAtFraction: number;
}

export class SessionBudget {
  private inputTokens = 0;
  private outputTokens = 0;
  private costUsd = 0;
  private readonly warned = new Set<BudgetKind>();

  constructor(private readonly config: TokenBudgetConfig) {}

  add(inputTokens: number, outputTokens: number): void {
    this.inputTokens += inputTokens;
    this.outputTokens += outputTokens;
    this.costUsd +=
      (inputTokens / 1000) * ESTIMATE_INPUT_PER_1K + (outputTokens / 1000) * ESTIMATE_OUTPUT_PER_1K;
  }

  get totals(): { inputTokens: number; outputTokens: number; costUsd: number } {
    return {
      inputTokens: this.inputTokens,
      outputTokens: this.outputTokens,
      costUsd: this.costUsd,
    };
  }

  /** Returns the first exceeded limit, or the first limit approaching its threshold, or ok. */
  check(): BudgetStatus {
    const checks: Array<{ kind: BudgetKind; used: number; limit: number | undefined }> = [
      { kind: "inputTokens", used: this.inputTokens, limit: this.config.maxInputTokens },
      { kind: "outputTokens", used: this.outputTokens, limit: this.config.maxOutputTokens },
      { kind: "cost", used: this.costUsd, limit: this.config.maxCostUsd },
    ];

    for (const { kind, used, limit } of checks) {
      if (limit === undefined) continue;
      if (used >= limit) {
        return { status: "exceeded", kind, used, limit };
      }
    }

    for (const { kind, used, limit } of checks) {
      if (limit === undefined) continue;
      const fraction = used / limit;
      if (fraction >= this.config.warnAtFraction && !this.warned.has(kind)) {
        this.warned.add(kind);
        return { status: "warning", kind, used, limit, fraction };
      }
    }

    return { status: "ok" };
  }

  isExceeded(): boolean {
    return this.check().status === "exceeded";
  }
}
