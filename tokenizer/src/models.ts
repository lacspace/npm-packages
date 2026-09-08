/**
 * Model pricing + context-window table and lookup helpers.
 *
 * Prices are USD **per 1,000,000 tokens** and reflect published list prices at
 * the time of writing. They drift — always confirm against the provider's
 * current pricing page before relying on a number for real billing.
 */

export interface ModelInfo {
  /** USD per 1M input (prompt) tokens. */
  input: number;
  /** USD per 1M output (completion) tokens. */
  output: number;
  /** Maximum context window in tokens. */
  contextWindow: number;
  /** Tokenizer family used for estimation scaling. */
  family: ModelFamily;
}

export type ModelFamily = "gpt" | "claude" | "gemini";

/**
 * Common models → pricing & context window.
 * Keys are the canonical model ids; see {@link MODEL_ALIASES} for shorthands.
 */
export const MODELS = {
  "gpt-4o": { input: 2.5, output: 10, contextWindow: 128_000, family: "gpt" },
  "gpt-4o-mini": { input: 0.15, output: 0.6, contextWindow: 128_000, family: "gpt" },
  o1: { input: 15, output: 60, contextWindow: 200_000, family: "gpt" },
  "o1-mini": { input: 1.1, output: 4.4, contextWindow: 128_000, family: "gpt" },
  "gpt-4-turbo": { input: 10, output: 30, contextWindow: 128_000, family: "gpt" },
  "gpt-3.5-turbo": { input: 0.5, output: 1.5, contextWindow: 16_385, family: "gpt" },
  // Newer OpenAI models (added in 1.1.0). Prices are list prices at time of
  // writing and drift — confirm against the provider before real billing.
  "gpt-4.1": { input: 2, output: 8, contextWindow: 1_000_000, family: "gpt" },
  "gpt-4.1-mini": { input: 0.4, output: 1.6, contextWindow: 1_000_000, family: "gpt" },
  "gpt-4.1-nano": { input: 0.1, output: 0.4, contextWindow: 1_000_000, family: "gpt" },
  o3: { input: 2, output: 8, contextWindow: 200_000, family: "gpt" },
  "o3-mini": { input: 1.1, output: 4.4, contextWindow: 200_000, family: "gpt" },
  "o4-mini": { input: 1.1, output: 4.4, contextWindow: 200_000, family: "gpt" },
  "claude-3-5-sonnet": { input: 3, output: 15, contextWindow: 200_000, family: "claude" },
  "claude-3-5-haiku": { input: 0.8, output: 4, contextWindow: 200_000, family: "claude" },
  "claude-3-opus": { input: 15, output: 75, contextWindow: 200_000, family: "claude" },
  // Newer Anthropic models (added in 1.1.0).
  "claude-3-7-sonnet": { input: 3, output: 15, contextWindow: 200_000, family: "claude" },
  "claude-sonnet-4": { input: 3, output: 15, contextWindow: 200_000, family: "claude" },
  "claude-opus-4": { input: 15, output: 75, contextWindow: 200_000, family: "claude" },
  "gemini-1.5-pro": { input: 1.25, output: 5, contextWindow: 2_000_000, family: "gemini" },
  "gemini-1.5-flash": { input: 0.075, output: 0.3, contextWindow: 1_000_000, family: "gemini" },
  "gemini-2.0-flash": { input: 0.1, output: 0.4, contextWindow: 1_000_000, family: "gemini" },
  // Newer Google models (added in 1.1.0).
  "gemini-2.0-flash-lite": { input: 0.075, output: 0.3, contextWindow: 1_000_000, family: "gemini" },
  "gemini-2.5-pro": { input: 1.25, output: 10, contextWindow: 1_000_000, family: "gemini" },
  "gemini-2.5-flash": { input: 0.3, output: 2.5, contextWindow: 1_000_000, family: "gemini" },
} satisfies Record<string, ModelInfo>;

/** A canonical model id present in {@link MODELS}. */
export type ModelId = keyof typeof MODELS;

/** The default model used when none is supplied. */
export const DEFAULT_MODEL: ModelId = "gpt-4o";

/**
 * Aliases and dated/versioned ids → canonical keys in {@link MODELS}.
 * Lets `modelInfo("gpt-4o-2024-08-06")` or `modelInfo("sonnet")` resolve.
 */
export const MODEL_ALIASES: Record<string, ModelId> = {
  // OpenAI shorthands
  gpt4o: "gpt-4o",
  "gpt-4o-2024-05-13": "gpt-4o",
  "gpt-4o-2024-08-06": "gpt-4o",
  "gpt-4o-mini-2024-07-18": "gpt-4o-mini",
  "chatgpt-4o-latest": "gpt-4o",
  "o1-preview": "o1",
  "o1-2024-12-17": "o1",
  "gpt-4-turbo-2024-04-09": "gpt-4-turbo",
  "gpt-4-turbo-preview": "gpt-4-turbo",
  "gpt-4-0125-preview": "gpt-4-turbo",
  "gpt-4": "gpt-4-turbo",
  "gpt-3.5": "gpt-3.5-turbo",
  "gpt-3.5-turbo-0125": "gpt-3.5-turbo",
  "gpt-4.1-2025-04-14": "gpt-4.1",
  "gpt-4.1-mini-2025-04-14": "gpt-4.1-mini",
  "gpt-4.1-nano-2025-04-14": "gpt-4.1-nano",
  "gpt-4o-2024-11-20": "gpt-4o",
  "o3-2025-04-16": "o3",
  "o3-mini-2025-01-31": "o3-mini",
  "o4-mini-2025-04-16": "o4-mini",
  // Anthropic shorthands
  sonnet: "claude-3-5-sonnet",
  "claude-3.5-sonnet": "claude-3-5-sonnet",
  "claude-3-5-sonnet-latest": "claude-3-5-sonnet",
  "claude-3-5-sonnet-20240620": "claude-3-5-sonnet",
  "claude-3-5-sonnet-20241022": "claude-3-5-sonnet",
  haiku: "claude-3-5-haiku",
  "claude-3.5-haiku": "claude-3-5-haiku",
  "claude-3-5-haiku-latest": "claude-3-5-haiku",
  "claude-3-5-haiku-20241022": "claude-3-5-haiku",
  opus: "claude-3-opus",
  "claude-3-opus-latest": "claude-3-opus",
  "claude-3-opus-20240229": "claude-3-opus",
  "claude-3.7-sonnet": "claude-3-7-sonnet",
  "claude-3-7-sonnet-latest": "claude-3-7-sonnet",
  "claude-3-7-sonnet-20250219": "claude-3-7-sonnet",
  "sonnet-4": "claude-sonnet-4",
  "claude-sonnet-4-0": "claude-sonnet-4",
  "claude-sonnet-4-20250514": "claude-sonnet-4",
  "opus-4": "claude-opus-4",
  "claude-opus-4-0": "claude-opus-4",
  "claude-opus-4-20250514": "claude-opus-4",
  // Google shorthands
  "gemini-pro": "gemini-1.5-pro",
  "gemini-1.5-pro-latest": "gemini-1.5-pro",
  "gemini-flash": "gemini-1.5-flash",
  "gemini-1.5-flash-latest": "gemini-1.5-flash",
  "gemini-2.0-flash-exp": "gemini-2.0-flash",
  "gemini-2.0-flash-lite-preview": "gemini-2.0-flash-lite",
  "gemini-2.5-pro-latest": "gemini-2.5-pro",
  "gemini-2.5-pro-preview": "gemini-2.5-pro",
  "gemini-2.5-flash-latest": "gemini-2.5-flash",
  "gemini-2.5-flash-preview": "gemini-2.5-flash",
};

/**
 * Resolve a model name (canonical id, alias, or dated variant) to its
 * {@link ModelInfo}. Falls back to a best-effort family guess, and finally to
 * the default model, so it never throws.
 */
export function modelInfo(model?: string): ModelInfo {
  if (!model) return MODELS[DEFAULT_MODEL];
  const key = model.trim();

  // Exact canonical match.
  if (key in MODELS) return MODELS[key as ModelId];

  // Known alias.
  const lower = key.toLowerCase();
  const aliased = MODEL_ALIASES[lower] ?? MODEL_ALIASES[key];
  if (aliased) return MODELS[aliased];

  // Fuzzy: does the id start with / contain a known canonical id?
  for (const id of Object.keys(MODELS) as ModelId[]) {
    if (lower.startsWith(id) || lower.includes(id)) return MODELS[id];
  }

  // Family guess by keyword → the family's cheapest common member as a proxy.
  if (lower.includes("claude")) return MODELS["claude-3-5-sonnet"];
  if (lower.includes("gemini")) return MODELS["gemini-1.5-flash"];
  if (lower.includes("gpt") || lower.startsWith("o1") || lower.startsWith("o3")) {
    return MODELS["gpt-4o"];
  }

  // Unknown → default.
  return MODELS[DEFAULT_MODEL];
}

/** The tokenizer family for a model name (for count scaling). */
export function modelFamily(model?: string): ModelFamily {
  return modelInfo(model).family;
}
