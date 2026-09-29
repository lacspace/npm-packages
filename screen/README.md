# @lacspace/screen

**Don't pay a model to read what a word list can judge.** A cheap, deterministic lexical screener that scores text against your own weighted term lexicons — multi-language, with negation and proximity windows and an optional named-entity gazetteer — and returns a **clear / review / block** decision. Send only the ambiguous middle to an expensive LLM; let obviously-clean and obviously-flagged text skip it entirely.

Zero dependencies, isomorphic, and every decision comes with an auditable "held because" trail.

```bash
npm i @lacspace/screen
```

## Use

```ts
import { createScreen } from "@lacspace/screen";

const screen = createScreen({
  dimensions: {
    death:    { terms: ["died", "killed", "मृत्यु"] },
    court:    { terms: ["court", "verdict", "अदालत"] },
    minor:    { terms: ["child", "minor", "बालबालिका"], forceReview: true },
    election: { terms: ["election", "vote", "निर्वाचन"], forceReview: true },
    hate:     { terms: ["<your slur list>"], weight: 3, forceBlock: true },
  },
  negations: ["no", "not", "denied", "-न", "-नन्"],  // "-x" = suffix, for Nepali verb negation
  gazetteer: ["Sher Bahadur Deuba", "काठमाडौं"],
  thresholds: { clear: 0, review: 1, block: 5 },
});

const r = screen(storyText);
r.decision;  // "clear" | "review" | "block"
r.scores;    // { death: 1, court: 2, ... }
r.hits;      // [{ dim, term, pos, weight, negated }]
r.reasons;   // ["total score 3 ≥ review 1", "minor: force-review hit"]

if (r.decision === "review") await askTheModel(storyText);  // only the uncertain ones
```

## Why

Running an LLM sensitivity/moderation pass on every candidate item is where token budgets die — most items are plainly fine or plainly blocked. `screen` triages first: in real newsroom use only the ambiguous fraction needs the model, cutting those calls by the large majority. Because it's deterministic and returns its reasons, the result is safe to log and defend.

## Features

- **Weighted dimensions** — each dimension has its own term list and `weight`; the total score drives the decision.
- **`forceReview` / `forceBlock`** — a single hit on a sensitive dimension (minors, elections) can force at least `review`, or `block` outright, regardless of score.
- **Negation** — a nearby negator marks a hit `negated` and drops it from the score. Whole words, `prefix*` patterns, and `-suffix` patterns (for languages where negation is a verb suffix, e.g. Nepali `-न`, `-नन्`).
- **Proximity window** — negation only counts within `contextWindow` tokens of the hit.
- **Gazetteer** — a named-person/place hit adds a boost, so "X died" scores higher than "someone died".
- **Multi-language** — Latin terms match whole words case-insensitively; Devanagari and other non-Latin terms match as substrings, positioned to the nearest token.
- **Auditable** — `hits` and `reasons` explain every decision.

## API

```ts
createScreen(config: ScreenConfig): Screen           // reusable, compiles matchers once
screenText(text: string, config: ScreenConfig): ScreenResult  // one-shot

interface ScreenConfig {
  dimensions: Record<string, { terms: string[]; weight?: number; forceReview?: boolean; forceBlock?: boolean }>;
  negations?: string[];         // "word" | "prefix*" | "-suffix"
  contextWindow?: number;       // default 4
  gazetteer?: string[];
  gazetteerBoost?: number;      // default 0.5
  thresholds?: { clear?: number; review?: number; block?: number };
}

interface ScreenResult {
  decision: "clear" | "review" | "block";
  score: number;
  scores: Record<string, number>;
  hits: { dim: string; term: string; pos: number; weight: number; negated: boolean }[];
  entity: boolean;
  reasons: string[];
}
```

You bring the lexicons — `screen` never ships opinions about what is sensitive, only the engine that applies yours.

## Licence

[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
