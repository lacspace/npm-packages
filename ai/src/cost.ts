/**
 * Usage + cost accounting helpers.
 *
 * `usage` from a {@link ChatResponse} is passed through verbatim per call; these
 * pure helpers let you sum it across a run and turn it into an estimated dollar
 * cost using pricing *you* supply (nothing is bundled — prices change, and this
 * package stays provider-agnostic and keyless).
 */

import type { Usage } from "./types.js";

/** Per-token pricing, expressed per 1,000,000 tokens (the usual vendor unit). */
export interface Pricing {
  /** USD per 1,000,000 input (prompt) tokens. */
  inputPer1M: number;
  /** USD per 1,000,000 output (completion) tokens. */
  outputPer1M: number;
}

/** Estimate the USD cost of a single {@link Usage} under `pricing`. */
export function estimateCost(
  usage: Usage | undefined,
  pricing: Pricing,
): number {
  if (!usage) return 0;
  const input = ((usage.inputTokens ?? 0) / 1_000_000) * pricing.inputPer1M;
  const output = ((usage.outputTokens ?? 0) / 1_000_000) * pricing.outputPer1M;
  return input + output;
}

/** Add any number of {@link Usage} values (skipping `undefined`) into one. */
export function sumUsage(...usages: (Usage | undefined)[]): Usage {
  let inputTokens = 0;
  let outputTokens = 0;
  for (const u of usages) {
    if (!u) continue;
    inputTokens += u.inputTokens ?? 0;
    outputTokens += u.outputTokens ?? 0;
  }
  return { inputTokens, outputTokens };
}

/**
 * A small running accumulator for token usage across many calls — handy for a
 * chat loop, an agent step counter, or a per-request budget.
 *
 * ```ts
 * const tracker = new UsageTracker();
 * const res = await chat(opts);
 * tracker.add(res.usage);
 * console.log(tracker.total, tracker.cost({ inputPer1M: 0.15, outputPer1M: 0.6 }));
 * ```
 */
export class UsageTracker {
  inputTokens = 0;
  outputTokens = 0;
  /** How many times {@link add} was called. */
  calls = 0;

  /** Fold one call's usage in. `undefined` still counts as a call. */
  add(usage: Usage | undefined): this {
    if (usage) {
      this.inputTokens += usage.inputTokens ?? 0;
      this.outputTokens += usage.outputTokens ?? 0;
    }
    this.calls += 1;
    return this;
  }

  /** The summed usage so far. */
  get total(): Usage {
    return { inputTokens: this.inputTokens, outputTokens: this.outputTokens };
  }

  /** Estimated USD cost of the accumulated usage under `pricing`. */
  cost(pricing: Pricing): number {
    return estimateCost(this.total, pricing);
  }

  /** Zero the accumulator. */
  reset(): this {
    this.inputTokens = 0;
    this.outputTokens = 0;
    this.calls = 0;
    return this;
  }
}
