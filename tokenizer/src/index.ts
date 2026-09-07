/**
 * @lacspace/tokenizer
 *
 * A fast, zero-dependency, isomorphic token **estimator**, LLM cost calculator
 * and context-budget manager. No 3 MB tiktoken/wasm download — just a tuned
 * heuristic that lands within roughly ±10–15% of the real GPT / Claude / Gemini
 * tokenizers on ordinary English and code.
 *
 * ⚠️ **It is an estimate, not exact billing.** For real cost accounting, read
 * the token counts returned in the provider's API `usage` response.
 *
 * ```ts
 * import { countTokens, estimateCost, fitToBudget } from "@lacspace/tokenizer";
 *
 * countTokens("The quick brown fox.", "gpt-4o");       // ~6
 * estimateCost({ model: "gpt-4o", inputTokens: 1000, outputTokens: 500 }).usd;
 * fitToBudget(longText, 2000, { strategy: "middle" }); // { text, tokens, truncated }
 * ```
 *
 * Zero dependencies · isomorphic (Node ≥18, browser, edge) · fully typed.
 */

export { countTokens, countMessageTokens, type ChatMessage } from "./count.js";

export {
  MODELS,
  MODEL_ALIASES,
  DEFAULT_MODEL,
  modelInfo,
  modelFamily,
  type ModelInfo,
  type ModelId,
  type ModelFamily,
} from "./models.js";

export {
  estimateCost,
  type EstimateCostInput,
  type CostEstimate,
  type CostBreakdown,
} from "./cost.js";

export {
  fitToBudget,
  budgetMessages,
  willFit,
  splitByTokens,
  type TruncateStrategy,
  type FitToBudgetOptions,
  type FitToBudgetResult,
  type BudgetMessagesOptions,
} from "./budget.js";
