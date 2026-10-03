# @lacspace/extractive

**Give an AI writer a compact brief, not the whole article — so it spends a fraction of the tokens.** Deterministic extractive summarization (TextRank), key-facts extraction (numbers, money, percentages, dates, named entities), headline candidates and key phrases/hashtags — for **English and Nepali** (sentence splitting on the danda `।`, decimal-safe). No LLM.

```bash
npm i @lacspace/extractive
```

```ts
import { brief, summarize, keyFacts } from "@lacspace/extractive";

const b = brief(longArticle);
// → {
//   summary: "…3–4 central sentences…",
//   headlineCandidates: ["…", "…"],
//   keyphrases: ["policy rate", "inflation", …],
//   hashtags: ["#policyrate", …],
//   keyFacts: { numbers, amounts, percentages, dates, entities },
//   sentenceCount: 18
// }
// Feed `b` to your writer instead of the full text — same facts, tiny prompt.

summarize(article, { maxSentences: 3 }).summary;   // extractive summary
keyFacts(article).percentages;                      // the hard figures to preserve
```

## Why

Sending whole articles to an LLM for every post is the biggest token sink in a newsroom pipeline. `extractive` does the reading deterministically and hands the model a short, fact-anchored brief — the model only writes, it doesn't ingest.

## API

- **`summarize(text, { maxSentences?, ratio?, lang? })`** → `{ summary, sentences, ranked }` — TextRank picks the most central sentences and returns them in original order. `ranked` is every sentence with its 0–1 score.
- **`keyFacts(text)`** → `{ numbers, amounts, percentages, dates, entities }` — the figures and names a rewrite must not change (via `@lacspace/factcheck-lite` + `@lacspace/keyphrase`).
- **`headlineCandidates(text, { max? })`** → `string[]` — the lead plus the shortest high-ranked sentences, trailing terminators stripped.
- **`brief(text, options?)`** → the bundle above, ready for a writer prompt.
- **`splitSentences(text)`** / **`tokenize(sentence)`** / **`textrank(tokenSets)`** — the building blocks, exported.
- **`describe()`** → a machine-readable capability + JSON-Schema command descriptor, so an AI "conductor" can pick options and drive the package without generating content.

All deterministic and Devanagari-aware. Reuses `@lacspace/keyphrase`, `@lacspace/factcheck-lite` and `@lacspace/trend-detect` (stopwords) rather than duplicating them.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.

## No third-party names (1.1.0)

`scrubSources(text, { outlets?, keep? })` → `{ text, removed, remaining, clean }` strips credit lines (`Source:`, `Photo:`, `स्रोत:`, `तस्बिर:` …), datelines like `(Reuters) -`, and attribution phrases (`according to the Kathmandu Post`, `कान्तिपुरका अनुसार`, `… अनलाइनखबरले जनाएको छ`) for ~150 Nepali and international outlets and stock libraries, keeping the facts. Names it can't remove safely are listed in `remaining` so a validator can hold the post; `mentionsOutlet(text)` is the quick gate. Run it on the writer's input and again on the final copy.
