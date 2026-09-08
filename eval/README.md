# @lacspace/eval

[![npm](https://img.shields.io/npm/v/@lacspace/eval.svg)](https://www.npmjs.com/package/@lacspace/eval)
[![types](https://img.shields.io/badge/types-included-blue.svg)](https://www.npmjs.com/package/@lacspace/eval)
[![zero dependencies](https://img.shields.io/badge/dependencies-0-brightgreen.svg)](https://www.npmjs.com/package/@lacspace/eval)
[![isomorphic](https://img.shields.io/badge/runtime-node%20%7C%20browser%20%7C%20edge-8A2BE2.svg)](https://developer.lacspace.com/packages/eval)

A tiny, **zero-dependency**, **keyless** toolkit for evaluating LLM outputs. Two layers that snap together:

1. **Deterministic scorers** — pure functions that return a normalised `Score` in `[0, 1]`: `contains`, `matchesRegex`, `matchesSchema`, `levenshteinSimilarity`, `cosineSimilarityScore`, `keywordCoverage`, `jsonPathEquals`, and more.
2. **LLM-as-judge** — `judge()` builds a grading prompt and calls a judge model **you inject**. No model is bundled, no API key is ever required.

Everything is deterministic and offline unless *you* inject an embedder or a judge. Perfect for unit-testing and regression-testing your AI features.

## Install

```sh
npm install @lacspace/eval
```

## Quick start

```ts
import { contains, lengthWithin, matchesSchema, scoreAll, runEval, judge } from "@lacspace/eval";

// 1) Score one output with several deterministic checks
const result = await scoreAll(output, [
  (o) => contains(o, "invoice"),
  (o) => lengthWithin(o, { max: 500 }),
  (o) => matchesSchema(o, { type: "object", required: ["total"] }),
]);
result.score;   // mean of the individual scores, 0..1
result.passed;  // true only if every scorer passed

// 2) LLM-as-judge — the model is INJECTED (keyless: wrap your own provider)
const myJudge = async (prompt: string) => callMyLLM(prompt); // returns raw text
const grade = await judge({
  output,
  criteria: "Answer is polite, correct and cites the policy.",
  judge: myJudge,     // <- injected; @lacspace/eval never talks to a provider
  scale: 10,
});
grade.score;   // parsed "Score: 8/10" -> 0.8
grade.passed;  // score >= threshold (default 0.6)

// 3) Batch: run a suite and get a pass-rate report
const report = await runEval([
  { name: "refund", output: a, scorers: [(o) => contains(o, "refund")] },
  { name: "greeting", output: b, scorers: [(o) => lengthWithin(o, { max: 80 })] },
]);
report.passRate;      // fraction of cases passed
report.averageScore;  // mean aggregate score
report.passed;        // all cases passed?
```

### Semantic similarity — token-overlap by default, real embeddings when injected

```ts
import { cosineSimilarityScore } from "@lacspace/eval";

// No dependency, no network: bag-of-words cosine
cosineSimilarityScore("the cat sat", "a cat sat down");

// Inject an embedder (e.g. from @lacspace/embeddings or a provider SDK)
const embed = async (texts: string[]) => myModel.embed(texts); // number[][]
await cosineSimilarityScore(answer, reference, embed, { threshold: 0.8 });
```

## API

| Export | Signature | Purpose |
| --- | --- | --- |
| `contains` | `(output, substr, opts?) => Score` | Output includes a substring. |
| `notContains` | `(output, substr, opts?) => Score` | Output omits a substring. |
| `matchesRegex` | `(output, re, opts?) => Score` | Output matches a `RegExp`/pattern. |
| `exactMatch` | `(output, expected, opts?) => Score` | Exact string equality (trim/case opts). |
| `jsonValid` | `(output) => Score` | Output parses as JSON. |
| `matchesSchema` | `(output, schema, opts?) => Score` | JSON validates against a tiny inline schema. |
| `levenshteinSimilarity` | `(a, b, opts?) => Score` | Normalised edit-distance similarity. |
| `cosineSimilarityScore` | `(a, b, embed?, opts?) => Score \| Promise<Score>` | Token-overlap or injected-embedding cosine. |
| `keywordCoverage` | `(output, keywords, opts?) => Score` | Fraction of keywords present. |
| `lengthWithin` | `(output, { min?, max?, unit? }) => Score` | Length (chars/words) within bounds. |
| `jsonPathEquals` | `(output, path, value, opts?) => Score` | Value at a JSON path deep-equals `value`. |
| `scoreAll` | `(output, scorers) => Promise<EvalResult>` | Run scorers, average + AND them. |
| `weighted` | `(scorers, opts?) => Scorer` | Weighted-mean combinator. |
| `allOf` / `anyOf` | `(scorers, opts?) => Scorer` | Logical AND / OR combinators. |
| `judge` | `(opts: JudgeOptions) => Promise<Score>` | LLM-as-judge with an **injected** model. |
| `judgeScorer` | `(opts) => Scorer` | Curry `judge` into a `Scorer` for suites. |
| `buildJudgePrompt` / `parseJudgeReply` | — | Inspect/customise the grading prompt & parser. |
| `runEval` | `(cases, opts?) => Promise<EvalReport>` | Batch runner with pass-rate + average. |

**Types:** `Score`, `Scorer`, `EvalResult`, `EvalCase`, `CaseResult`, `EvalReport`, `JudgeOptions`, `JudgeFn`, `EmbedFn`, `JsonSchema`.

### Injected shapes (keyless, zero-dep)

```ts
type JudgeFn = (prompt: string) => Promise<string>;         // your LLM, wrapped
type EmbedFn = (texts: string[]) => Promise<number[][]>;    // your embedder, wrapped
```

## Works great with

- **[@lacspace/ai](https://developer.lacspace.com/packages/ai)** — wrap its client as the injected `judge` function for LLM-as-judge grading.
- **[@lacspace/embeddings](https://developer.lacspace.com/packages/embeddings)** / **[@lacspace/vector](https://developer.lacspace.com/packages/vector)** — supply their embed call as the injected `EmbedFn` for semantic cosine scoring.
- **[@lacspace/prompt](https://developer.lacspace.com/packages/prompt)** & **[@lacspace/json-repair](https://developer.lacspace.com/packages/json-repair)** — build the outputs you evaluate; repair loose JSON before `matchesSchema`.
- **[@lacspace/expect](https://developer.lacspace.com/packages/expect)** & **[@lacspace/snapshot](https://developer.lacspace.com/packages/snapshot)** — assert on `Score`/`EvalReport` inside your test runner.

Composition is always via **duck-typed injected functions** — none of these are hard dependencies, and nothing is required (or online) to run the tests.

## Limitations

- **No built-in model or key.** `judge` needs an injected `JudgeFn`; embedding cosine needs an injected `EmbedFn`. By design there is no provider and no key.
- **`matchesSchema` is a small JSON-Schema subset** (types, `enum`, `required`, `properties`, `items`, length/range/`pattern`, `additionalProperties`) — not a full Draft-2020 validator.
- **`cosineSimilarityScore` without an embedder is lexical**, not semantic — it is bag-of-words term-frequency overlap and won't see paraphrases. Inject an embedder for meaning.
- **LLM-as-judge is only as reliable as the judge model** and is inherently non-deterministic; the parser is tolerant (`"8/10"`, `"rating 7"`, `"85%"`, bare numbers) but can't fix a judge that refuses the format.
- **`levenshtein` is O(n·m)** — fine for sentences/short answers, not for whole documents.
- **`jsonPathEquals` supports dot/bracket paths**, not full JSONPath filters or wildcards.

## Licensing

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice. See the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/eval` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/eval
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.
