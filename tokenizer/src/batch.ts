/**
 * Batch token counting & cost estimation (added in 1.1.0).
 *
 * Estimate a whole list of prompts in one call — useful for embeddings jobs,
 * bulk classification, RAG ingestion and dataset cost previews.
 */

import { countTokens } from "./count.js";
import { estimateCost, type CostEstimate } from "./cost.js";

export interface BatchCount {
  /** Estimated tokens for each input, in order. */
  tokens: number[];
  /** Sum of all per-item token estimates. */
  total: number;
  /** The largest single-item estimate (0 for an empty batch). */
  max: number;
  /** Number of inputs measured. */
  count: number;
}

/**
 * Estimate tokens for each string in `texts`. Returns the per-item counts plus
 * the total, max and count. An empty array yields all-zero totals.
 */
export function countBatch(texts: string[], model?: string): BatchCount {
  const tokens = texts.map((t) => countTokens(t, model));
  let total = 0;
  let max = 0;
  for (const n of tokens) {
    total += n;
    if (n > max) max = n;
  }
  return { tokens, total, max, count: texts.length };
}

export interface BatchCostEstimateOptions {
  /** Output tokens to assume per item (defaults to 0 — input-only). */
  outputTokensEach?: number;
}

export interface BatchCostEstimate {
  /** Total estimated USD across the whole batch. */
  usd: number;
  /** Summed input tokens counted from the texts. */
  totalInputTokens: number;
  /** Summed assumed output tokens. */
  totalOutputTokens: number;
  /** Number of items. */
  count: number;
  /** Per-item cost estimates, in order. */
  items: CostEstimate[];
}

/**
 * Estimate the USD cost of running `texts` through `model`. Input tokens are
 * counted from each string; `outputTokensEach` (default 0) is assumed per item.
 */
export function estimateBatchCost(
  texts: string[],
  model: string,
  options: BatchCostEstimateOptions = {},
): BatchCostEstimate {
  const outEach = Math.max(0, options.outputTokensEach || 0);
  const items = texts.map((t) =>
    estimateCost({
      model,
      inputTokens: countTokens(t, model),
      outputTokens: outEach,
    }),
  );

  let usd = 0;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  for (const it of items) {
    usd += it.usd;
    totalInputTokens += it.breakdown.inputTokens;
    totalOutputTokens += it.breakdown.outputTokens;
  }

  return {
    usd: Math.round(usd * 1e6) / 1e6,
    totalInputTokens,
    totalOutputTokens,
    count: texts.length,
    items,
  };
}
