# @lacspace/packfix

Repairs an AI-written story pack that failed validation without asking the model for the whole pack again. Give it the pack, your validator's failure messages and the sources. It fixes what it can deterministically and returns the ids of the one or two sentences that still need a model rewrite.

```ts
import { fix, replaceSentence } from "@lacspace/packfix";

const r = fix(pack, [
  "names: names not in sources or gazetteer: Provincial Traffic Police Office, Sagarmatha Sambaad",
  "plagiarism: 8-gram overlap 8.27% (limit 3%)",
  "tone: banned phrases: explosive",
], sources);

r.pack;      // explosive knock → aggressive knock; entities cleaned
r.fixed;     // ['names: "Provincial Traffic Police Office" is a descriptive phrase, not a name', 'tone: "explosive" replaced 1×', …]
r.remaining; // ['names: names not in sources or gazetteer: Sagarmatha Sambaad', 'plagiarism: …']
r.rewrite;   // [{ id: "body.2.3", reason: "names", text, detail }, { id: "body.1.0", reason: "plagiarism", … }]

// one small model call per sentence, then put it back
let p = r.pack;
for (const w of r.rewrite) p = replaceSentence(p, w.id, await rewriteOneSentence(w));
```

On WeNepal's 11 real failing packs, packfix cleared 9 of the 10 flagged names as false positives without AI. The rewrite for every plagiarism case came down to 1–2 sentences.

## What it does

**Names.** For each name the validator flagged, it gives one of four verdicts:
- **`not-a-name`:** a Title Case phrase made only of common English words, e.g. "Provincial Traffic Police Office", "Climate Resilient Future", or a headline fragment. Any word the pack or sources use in lower case also counts as common. Nothing is changed.
- **`in-source`:** the name is in the sources. That includes sources in another script, matched by transliteration, e.g. "Gandak" ↔ गण्डक, using `@lacspace/translit`.
- **`respelled`:** a near-miss of a source spelling (Adhikary → Adhikari). It is replaced everywhere: text, entities and tags.
- **`unbacked`:** not in the sources. It is removed from `entities`, and every sentence that mentions it goes into `rewrite`.

Limitation: an invented name made only of common words ("Himalayan Water Summit") counts as a phrase. Pass your gazetteer as `knownNames` and extra vocabulary as `commonWords` to tune it.

**Plagiarism.**
- **Method:** your rule (lowercase, punctuation stripped, 8-word shingles), applied to body paragraphs against same-language sources.
- **Output:** `overlap` ranks the sentences by shared shingles, and `overlap.rewrite` is the smallest set whose rewrite brings the overlap under the limit.
- **Accuracy:** if your sources are truncated, the percentage reads lower than your validator's, but the ranking still holds.

**Tone.** It neutralises listed judgement words, with context guards:
- explosive → aggressive or rapid, but "explosive device" is kept;
- massive → major, huge → large, shocking → unexpected, slams → criticises, dramatic → sharp or notable;
- historic → notable, but "historic site" is kept.

A few Nepali fillers are also handled. A question headline is returned as `rewrite: [{ id: "headline" }]`.

Failures it doesn't own (`lengths`, `numbers`, …) are passed through in `remaining`, untouched.

## Sentence ids

`headline`, `deck`, `summary.N`, `body.P.N` (paragraph, sentence) and `bullets.N`.
- `sentences(pack)` lists them.
- `replaceSentence(pack, id, text)` writes one back and returns a new pack; the input is never mutated.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
