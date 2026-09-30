# @lacspace/trend-detect

**Rank your writer queue by what's actually rising.** Burst / trending-topic detection over your own stream of items — score every entity and term by how far its recent frequency departs from a rolling baseline (z-score + growth), per category, English and Nepali. No platform scraping, no network: it works only on the data you already ingested. Deterministic, zero-dependency.

```bash
npm i @lacspace/trend-detect
```

```ts
import { detectTrends } from "@lacspace/trend-detect";

const trends = detectTrends(items, {
  windowHours: 24,     // the "recent" burst window
  baselineHours: 168,  // the 7-day baseline it's compared against
  minCount: 3,
  topK: 20,
});
// items: { text, at, category?, terms?, id? }[]
// → [{ term: "flood", recent: 12, baseline: 1.2, z: 6.4, growth: 5.5, score: 34.1, category, items:[...] }, ...]
```

## What it does

- **Burst score** — for each term, the recent-window count is compared to its per-window counts across the baseline as a z-score, then combined with raw growth (`recent / (baseline+1)`) and volume, so a topic that jumps from nothing to twelve mentions outranks one that ticks along steadily.
- **Per category** — pass `category` on items and trends are computed within each bucket, so a sports burst doesn't drown a politics one.
- **Bilingual** — auto-detects English vs Nepali and applies the matching stopwords (built-in `EN_STOP` / `NE_STOP`, extendable); n-grams up to `maxWords` don't cross a stopword.
- **Bring your own terms** — pass pre-extracted `terms` per item (e.g. from `@lacspace/keyphrase`) to skip tokenizing, and a `gazetteer` to always track named entities.

Feed it your ingested headlines and it tells you what to write next — from your own feeds only, no scraping of any platform.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
