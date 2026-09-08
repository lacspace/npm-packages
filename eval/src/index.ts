/**
 * @lacspace/eval
 *
 * A tiny, zero-dependency, **keyless** toolkit for evaluating LLM outputs.
 *
 * Two layers:
 *  1. **Deterministic scorers** — pure functions that return a normalised
 *     `Score` (`contains`, `matchesRegex`, `matchesSchema`, `levenshteinSimilarity`,
 *     `cosineSimilarityScore`, `keywordCoverage`, `jsonPathEquals`, …).
 *  2. **LLM-as-judge** — `judge()` builds a grading prompt and calls a judge
 *     model **you inject**; nothing is bundled and no key is required.
 *
 * Compose scorers with `scoreAll` / `weighted` / `allOf` / `anyOf`, and run
 * suites with `runEval`. Everything is deterministic and offline unless you
 * inject an embedder or judge.
 *
 * ```ts
 * import { contains, lengthWithin, scoreAll, judge, runEval } from "@lacspace/eval";
 *
 * const r = await scoreAll(output, [
 *   (o) => contains(o, "invoice"),
 *   (o) => lengthWithin(o, { max: 500 }),
 * ]);
 *
 * // LLM-as-judge with an injected model (keyless — you wrap your own provider):
 * const g = await judge({ output, criteria: "Is it polite and correct?", judge: myModel });
 * ```
 *
 * Zero dependencies · keyless · isomorphic (Node ≥18, browser, edge) · fully typed.
 */

export type {
  Score,
  Scorer,
  EvalResult,
  EvalCase,
  CaseResult,
  EvalReport,
  EmbedFn,
  JudgeFn,
  JudgeOptions,
  JsonSchema,
} from "./types";

export {
  contains,
  notContains,
  matchesRegex,
  exactMatch,
  jsonValid,
  matchesSchema,
  levenshteinSimilarity,
  cosineSimilarityScore,
  keywordCoverage,
  lengthWithin,
  jsonPathEquals,
  type StringScorerOptions,
  type ExactMatchOptions,
  type SimilarityOptions,
  type CosineOptions,
  type KeywordCoverageOptions,
  type LengthWithinOptions,
} from "./scorers";

export {
  scoreAll,
  weighted,
  allOf,
  anyOf,
  type WeightedScorer,
} from "./aggregate";

export {
  judge,
  judgeScorer,
  buildJudgePrompt,
  parseJudgeReply,
} from "./judge";

export {
  runEval,
  type RunEvalOptions,
} from "./batch";
