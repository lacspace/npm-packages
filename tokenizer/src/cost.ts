/**
 * Cost estimation from the model pricing table.
 */

import { modelInfo } from "./models.js";

export interface EstimateCostInput {
  /** Model id / alias. */
  model: string;
  /** Number of input (prompt) tokens. */
  inputTokens: number;
  /** Number of output (completion) tokens. Defaults to 0. */
  outputTokens?: number;
}

export interface CostBreakdown {
  /** USD attributed to input tokens. */
  input: number;
  /** USD attributed to output tokens. */
  output: number;
  /** Input tokens counted. */
  inputTokens: number;
  /** Output tokens counted. */
  outputTokens: number;
  /** Resolved USD-per-1M input price used. */
  inputPricePerM: number;
  /** Resolved USD-per-1M output price used. */
  outputPricePerM: number;
}

export interface CostEstimate {
  /** Total estimated cost in USD. */
  usd: number;
  breakdown: CostBreakdown;
}

/**
 * Estimate the USD cost of a request from token counts and the model's list
 * price. The `usd` total is rounded to 6 decimal places; `breakdown` keeps the
 * per-side detail. Unknown models resolve via {@link modelInfo}'s fallback.
 */
export function estimateCost(input: EstimateCostInput): CostEstimate {
  const info = modelInfo(input.model);
  const inTok = Math.max(0, input.inputTokens || 0);
  const outTok = Math.max(0, input.outputTokens || 0);

  const inputUsd = (inTok / 1_000_000) * info.input;
  const outputUsd = (outTok / 1_000_000) * info.output;

  return {
    usd: round6(inputUsd + outputUsd),
    breakdown: {
      input: round6(inputUsd),
      output: round6(outputUsd),
      inputTokens: inTok,
      outputTokens: outTok,
      inputPricePerM: info.input,
      outputPricePerM: info.output,
    },
  };
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}
