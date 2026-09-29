# @lacspace/keyphrase

**Stop asking the model to tag things.** Extract keyphrases, tags, hashtags, named entities and category votes from text with a zero-dependency RAKE + TF-IDF engine — built-in English and Nepali stopwords, Devanagari-aware, deterministic. Do the ~15–20% of an LLM's output that is really just extraction, for free.

```bash
npm i @lacspace/keyphrase
```

```ts
import { keyphrase } from "@lacspace/keyphrase";

const r = keyphrase(articleText, {
  gazetteer: ["Nepal Rastra Bank", "नेपाल राष्ट्र बैंक"],
  categories: { economy: ["rate", "inflation", "bank"], sports: ["match", "goal"] },
});

r.tags;       // ["policy interest rate", "central bank", ...]
r.hashtags;   // ["#PolicyInterestRate", "#CentralBank", ...]
r.entities;   // [{ text: "Nepal Rastra Bank", count: 2 }, ...]
r.categories; // [{ category: "economy", score: 4 }]
r.language;   // "en" | "ne" (auto-detected)
```

- **RAKE keyphrases** — candidate phrases split at stopwords/punctuation, scored by word degree/frequency; `topK`, `maxWords`, dedupe, gazetteer boost.
- **Hashtags** — CamelCase for Latin, Devanagari kept whole (matras preserved), punctuation stripped, 2–30 chars.
- **Entities** — Latin Title-Case runs plus every gazetteer term (including Devanagari, which has no case).
- **Category votes** — pass `{ category: [terms] }` and get a ranked vote by term hits.
- **Bilingual** — ships `ENGLISH_STOPWORDS` and `NEPALI_STOPWORDS`; auto-detects language, or force it; add your own with `extraStopwords` or replace with `stopwords`.

Deterministic and isomorphic. You bring domain stopwords/gazetteers; it brings the engine. Exports `toHashtag` and the two stopword lists too.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
