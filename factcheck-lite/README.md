# @lacspace/factcheck-lite

**Catch fabricated numbers before you publish, without an LLM round.** Extract every number, amount, percentage, date and named entity from a generated article, then verify each one appears in — or is derivable from — the source material. What doesn't check out comes back as a list to fix. Bilingual (English + Nepali/Devanagari), deterministic.

```bash
npm i @lacspace/factcheck-lite
```

```ts
import { verify, extractClaims } from "@lacspace/factcheck-lite";

const result = verify(generatedArticle, sourceTexts, { numberTolerance: 0 });
result.ok;          // false if any figure is unsupported
result.mismatches;  // [{ type: "percentage", value: 6.5, nearest: 5.5, note: "..." }, ...]
result.checked;     // claims checked
result.matched;     // claims supported
```

## What it checks

- **Numbers, amounts, percentages** — Latin and Devanagari digits, South-Asian scale words (हजार/लाख/करोड/अरब/खर्ब) and Western ones (thousand/lakh/crore/million/billion), currency (रु/नेरु/NPR/Rs/₹/$), and `%`/`प्रतिशत`. Everything is normalized to a canonical value, so "12 crore", "१२ करोड" and "120,000,000" all compare equal.
- **Dates** — ISO (2026-09-30), long form (September 30, 2026 / 30 Sep 2026), and **Bikram Sambat** (२०८२ साल, 2082 BS).
- **Named entities** — Title-Case names and gazetteer terms, verified against the sources including **across scripts** (a name written in Devanagari in the article is matched to its Latin spelling in the sources via `@lacspace/translit`).

```ts
extractClaims(text, { gazetteer })
// → { numbers, amounts, percentages, dates, entities }  — each with { raw, value, start, end }
```

## Why

Most "AI rewrite" rounds in a newsroom exist to fix a wrong figure the model drifted or invented. This runs first, deterministically: it tells you exactly which number, date or name in the draft isn't backed by the sources, so you correct that one thing instead of paying for another full generation. `numberTolerance` allows a relative margin (e.g. `0.01` for ±1%) when sources round differently.

`verify` never rewrites and never calls a model — it only reports. The one dependency is `@lacspace/translit`, for cross-script entity matching.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
