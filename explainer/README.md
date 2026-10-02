# @lacspace/explainer

**An article in, an explainer out — slides, carousel, video script, FAQ — with no LLM.** English or Nepali. Built on TextRank (`@lacspace/extractive`) and `@lacspace/keyphrase`; figures are shown exactly as written, never recomputed. An optional LLM "polish" can smooth voiceover lines behind a facts lock.

```bash
npm i @lacspace/explainer
```

```ts
import { explain, polish } from "@lacspace/explainer";

const ex = explain(articleText, { brand: "WeNepal", slides: 8, scenes: 5 });
ex.category    // "economy" (lexicon vote; override with your own categories)
ex.slides      // [{ kind: "title" | "what" | "why" | "numbers" | "who" | "background" | "next" | "cta", heading, body, bullets?, stat? }]
ex.carousel    // newscard CarouselSpec.slides — renderCarousel({ theme, slides: ex.carousel })
ex.script      // { scenes: [{ n, heading, voiceover, onScreen, durationSec, visualQueries, overlay }], totalSec, words }
ex.faq         // [{ q: "के भयो?", a }, { q: "यो किन महत्त्वपूर्ण छ?", a }, …]
ex.hashtags, ex.facts, ex.warnings
```

## How the structure is chosen

| slide | rule |
|---|---|
| **title** | your `title`, else the lead sentence (≤ 120 chars), else the shortest high-ranked sentence |
| **what** | the lead; if the title already is the lead, the next sentence in reading order |
| **why** | highest-ranked unused sentence with a causal/impact marker (because, due to, impact, risk … / कारण, ले गर्दा, असर, प्रभाव, जोखिम …) |
| **numbers** | the first amount → percentage → number claim, shown as written with its currency token (`रु. ५० अर्ब`); stat label = its sentence minus the figure; up to 4 figure sentences as bullets |
| **who** | entities (Latin Title-Case + gazetteer; Nepali names after role words — गभर्नर, मन्त्री, कप्तान, डा. … — or gazetteer first + last name pairs) |
| **background** | sentence with a past marker (earlier, last year, in 2024 … / गत, अघि, विगत …) |
| **next** | sentence with a future marker (will, scheduled, from Monday … / हुनेछ, आगामी, लागू हुने …) |
| **cta** | "Follow {brand} …" in the article's language |

Slides beyond `slides` are dropped by priority (title, what, why, numbers, next, cta, who, background). Missing why/next produce `warnings` so an editor can add a line.

## Video script

Scene 1 always speaks the lead; then one scene per content slide (de-duplicated). Each voiceover is trimmed to ≤ 30 words at a clause boundary; duration follows word count (ne ≈ 125 wpm, en ≈ 160 wpm, 4 s minimum, capped by `sceneSeconds × 1.6`). `visualQueries` are English stock-footage searches (Latin entities + category fallbacks such as "stock market display board", "monsoon clouds mountains") for `@lacspace/stockmedia`; `overlay` hints `@lacspace/motiongfx` (stinger on scene 1, stat on the numbers scene, lower-third on the who scene). Feed voiceovers to `@lacspace/tts`.

## Optional polish

`polish(ex, llm)` asks your injected `llm(prompt)` to rewrite each voiceover in ≤ 25 conversational words. A rewrite is kept only if it is non-trivial and every digit in it already appears in the deterministic line; failures and invented figures fall back silently.

`describe()` returns the command schema for an AI conductor.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
