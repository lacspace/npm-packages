/**
 * Core type vocabulary for `@lacspace/eval`.
 *
 * Everything here is dependency-free and duck-typed: LLM judges and embedding
 * models are supplied to the library as plain functions, so the package works
 * standalone and needs nothing installed (or online) to run its tests.
 */

/**
 * The result of applying a single scorer to an output.
 *
 * `score` is always normalised to the `0..1` range (1 = perfect), regardless of
 * the scorer, so heterogeneous scorers can be averaged and weighted together.
 */
export interface Score {
  /** Human-readable name of the check, e.g. `"contains"`, `"cosine"`, `"judge"`. */
  name: string;
  /** Normalised quality in `[0, 1]`, where `1` is best. */
  score: number;
  /** Whether this check is considered a pass (usually `score >= threshold`). */
  passed: boolean;
  /** Optional diagnostic payload (matched terms, distances, rationale, errors…). */
  details?: Record<string, unknown>;
}

/**
 * A thunk that scores an output. Deterministic scorers are exposed in their
 * "eager" form (`contains(output, substr)`), but for {@link scoreAll},
 * {@link runEval} and the combinators you pass a `Scorer` — a closure that
 * receives the output and produces a {@link Score}.
 *
 * ```ts
 * const scorers: Scorer[] = [
 *   (o) => contains(o, "hello"),
 *   (o) => lengthWithin(o, { max: 200 }),
 * ];
 * ```
 *
 * A scorer may be async (e.g. one that calls an injected embedder or judge).
 */
export type Scorer = (output: string) => Score | Promise<Score>;

/** The aggregated outcome of running several scorers against one output. */
export interface EvalResult {
  /** The output that was scored. */
  output: string;
  /** Every individual {@link Score}, in scorer order. */
  scores: Score[];
  /** Aggregate quality in `[0, 1]` (mean of `scores`, or weighted mean). */
  score: number;
  /** `true` when every scorer passed. */
  passed: boolean;
}

/** One case in a batch evaluation. */
export interface EvalCase {
  /** Optional label for reporting. */
  name?: string;
  /** Optional input/prompt that produced `output` (carried into the report). */
  input?: string;
  /** The model output under test. */
  output: string;
  /** Scorers to apply to `output`. */
  scorers: Scorer[];
  /** Optional gold/reference answer (carried into the report for context). */
  expected?: string;
}

/** An {@link EvalResult} enriched with the {@link EvalCase} it came from. */
export interface CaseResult extends EvalResult {
  /** The case label, if any. */
  name?: string;
  /** The case input, if any. */
  input?: string;
  /** The case reference answer, if any. */
  expected?: string;
}

/** The outcome of {@link runEval} over many cases. */
export interface EvalReport {
  /** Per-case results, in input order. */
  results: CaseResult[];
  /** Fraction of cases that passed, in `[0, 1]`. */
  passRate: number;
  /** Mean aggregate score across cases, in `[0, 1]`. */
  averageScore: number;
  /** `true` when every case passed. */
  passed: boolean;
}

/**
 * An **injected** embedding function. Give it a batch of strings, get back one
 * vector per string. Matches the shape exposed by `@lacspace/embeddings` /
 * `@lacspace/vector` and typical provider SDKs, so cosine scoring can use real
 * embeddings without this package depending on any of them.
 */
export type EmbedFn = (texts: string[]) => Promise<number[][]>;

/**
 * An **injected** LLM judge. Give it a fully-rendered grading prompt, get back
 * the model's raw text reply. This package never bundles a model or key — you
 * pass a function that wraps whatever provider you use.
 */
export type JudgeFn = (prompt: string) => Promise<string>;

/** Options for {@link judge} — LLM-as-judge grading. */
export interface JudgeOptions {
  /** The model output to grade. */
  output: string;
  /** What "good" means for this task, in plain language. */
  criteria: string;
  /** The injected judge model (see {@link JudgeFn}). Required — no built-in model. */
  judge: JudgeFn;
  /** Optional detailed rubric appended to the grading prompt. */
  rubric?: string;
  /** Maximum points on the grading scale. Default `10`. */
  scale?: number;
  /** Optional original input/prompt, given to the judge for context. */
  input?: string;
  /** Optional reference/gold answer, given to the judge for context. */
  reference?: string;
  /** Pass threshold on the normalised `0..1` score. Default `0.6`. */
  threshold?: number;
  /** Name for the produced {@link Score}. Default `"judge"`. */
  name?: string;
}

/**
 * A tiny JSON-Schema-like shape used by {@link matchesSchema}. It is a small,
 * dependency-free subset — enough to validate the kind of structured JSON LLMs
 * are asked to return — not a full Draft-2020 validator.
 */
export interface JsonSchema {
  /** Expected JSON type. */
  type?: "string" | "number" | "integer" | "boolean" | "null" | "array" | "object";
  /** Allowed literal values (any type). */
  enum?: unknown[];
  /** Object property schemas. */
  properties?: Record<string, JsonSchema>;
  /** Required object property names. */
  required?: string[];
  /** Reject unknown object keys when `false`. Default allows them. */
  additionalProperties?: boolean;
  /** Schema applied to every array item. */
  items?: JsonSchema;
  /** Minimum array length. */
  minItems?: number;
  /** Maximum array length. */
  maxItems?: number;
  /** Minimum string length. */
  minLength?: number;
  /** Maximum string length. */
  maxLength?: number;
  /** Regex the string must match (as a source string). */
  pattern?: string;
  /** Inclusive numeric lower bound. */
  minimum?: number;
  /** Inclusive numeric upper bound. */
  maximum?: number;
}
