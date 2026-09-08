/**
 * Convenience cost helpers that combine counting + pricing, and compare the
 * cost of the same workload across models (added in 1.1.0).
 */

import { countTokens } from "./count.js";
import { estimateCost, type CostEstimate } from "./cost.js";
import { MODELS } from "./models.js";

export interface EstimatePromptCostOptions {
  /** Output (completion) tokens to assume. Defaults to 0. */
  outputTokens?: number;
}

/**
 * Count `text` for `model` and price it in one call — a shortcut for
 * `estimateCost({ model, inputTokens: countTokens(text, model), ... })`.
 * The counted input tokens are available on `result.breakdown.inputTokens`.
 */
export function estimatePromptCost(
  text: string,
  model: string,
  options: EstimatePromptCostOptions = {},
): CostEstimate {
  return estimateCost({
    model,
    inputTokens: countTokens(text, model),
    outputTokens: options.outputTokens ?? 0,
  });
}

export interface CostTokens {
  /** Input (prompt) tokens. */
  inputTokens: number;
  /** Output (completion) tokens. Defaults to 0. */
  outputTokens?: number;
}

export interface ModelCostComparison {
  /** The model id (or alias) that was priced. */
  model: string;
  /** Total estimated USD for this model. */
  usd: number;
  /** The full cost estimate for this model. */
  estimate: CostEstimate;
}

/**
 * Price the same token counts across several models and return the results
 * sorted cheapest first. `models` defaults to every id in {@link MODELS};
 * aliases and unknown ids resolve via the usual fallback (never throw).
 */
export function compareModelCost(
  tokens: CostTokens,
  models: string[] = Object.keys(MODELS),
): ModelCostComparison[] {
  return models
    .map((model): ModelCostComparison => {
      const estimate = estimateCost({
        model,
        inputTokens: tokens.inputTokens,
        outputTokens: tokens.outputTokens ?? 0,
      });
      return { model, usd: estimate.usd, estimate };
    })
    .sort((a, b) => a.usd - b.usd);
}

/**
 * The cheapest model for the given token counts among `models` (default: all of
 * {@link MODELS}). Returns `undefined` only if `models` is empty.
 */
export function cheapestModel(
  tokens: CostTokens,
  models?: string[],
): ModelCostComparison | undefined {
  return compareModelCost(tokens, models)[0];
}
