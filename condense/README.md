# @lacspace/condense

**Feed the LLM a fraction of the words.** Turn several articles about the same story into one short, deduplicated, token-budgeted digest that keeps the numbers, quotes and named entities — so a model only has to rewrite what matters instead of re-reading six full sources. Purely extractive, deterministic, and zero external dependencies.

Built for newsrooms, RAG context assembly, and anywhere you're paying per token to summarise overlapping documents.

```bash
npm i @lacspace/condense
```

## Use

```ts
import { condense } from "@lacspace/condense";

const digest = condense(
  [
    { text: kathmanduPostArticle, label: "Kathmandu Post" },
    { text: himalayanTimesArticle, label: "Himalayan Times" },
    { text: onlineKhabarArticle, label: "Online Khabar" },
  ],
  { tokenBudget: 1500, gazetteer: ["Nepal Rastra Bank", "नेपाल राष्ट्र बैंक"] },
);

digest.text;
// [S1 Kathmandu Post]
// Nepal's central bank cut the policy rate to 5.5 percent on Sunday. The governor said "inflation is easing".
//
// [S2 Himalayan Times]
// Analysts welcomed the decision.
//
// [S3 Online Khabar]
// Traders expect loans to get cheaper.

digest.tokens;      // ≤ tokenBudget
digest.droppedDup;  // near-duplicate sentences removed across sources
```

Then hand `digest.text` to your model. On a typical 6-source cluster this is ~50% of the input tokens of feeding the trimmed sources directly, with the facts preserved.

## What it does

- **Ranks sentences** by BM25 centrality across the whole cluster (via `@lacspace/rerank`).
- **Always keeps** each source's lede, any sentence with a number/currency/percentage, any quoted sentence, and any sentence naming a gazetteer entity — these are tagged in `reasons`.
- **Drops near-duplicates** (3-gram Jaccard) so five outlets saying the same figure appear once.
- **Groups per source** under a header line in the original source order, in each source's original reading order — so your prompt can still credit "according to S2".
- **Respects a token budget** (`@lacspace/tokenizer`) and a `maxSentencesPerSource` cap so one long article can't crowd out the rest.
- **Devanagari-aware**: splits on `।` and `॥`, detects `०-९` digits and `रु`/`नेरु` amounts, never splits a quote.
- **Deterministic**: identical input always yields identical output, so results are cacheable.

## API

```ts
condense(sources: CondenseSource[], options?: CondenseOptions): CondenseResult
```

```ts
interface CondenseSource { text: string; label?: string; url?: string; publishedAt?: string | Date; }

interface CondenseOptions {
  tokenBudget?: number;            // default 1500
  maxSentencesPerSource?: number;  // default 8
  dedupeThreshold?: number;        // 3-gram Jaccard ≥ this → drop as duplicate. default 0.8
  keepLede?: boolean;              // default true
  gazetteer?: string[];            // entities to always keep + boost (pass en and ne forms)
  model?: string;                  // token-counter model hint
  countTokens?: (text: string) => number;  // override token counting
  header?: (s: { idx: number; label: string; url?: string }) => string;
}

interface CondensedSentence { text: string; sourceIdx: number; start: number; end: number; score: number; reasons: string[]; }
interface CondenseResult {
  text: string;                    // grouped digest
  sources: { idx; label; url?; sentences: CondensedSentence[] }[];
  sentences: CondensedSentence[];  // flat, in output order
  tokens: number; droppedDup: number; totalSentences: number;
}
```

Every kept sentence carries `sourceIdx` and the `{start, end}` char offsets in that source's original text — so an editor view or a plagiarism check can trace each line back to where it came from. `condense` never rewrites text; publishing generated prose is the model's job.

Also exported: `splitSentences(text)` — the Devanagari-aware sentence splitter with offsets, useful on its own.

## Licence

[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
