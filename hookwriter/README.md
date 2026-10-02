# @lacspace/hookwriter

**Platform-ready copy from facts — hooks, titles, captions, CTAs and descriptions, in many styles, English and Nepali.** Deterministic: it fills templates with **only the facts you pass** (never invents a claim), trims to each platform's character limit, and drops sensational phrasing. AI is optional — only to fill slots.

```bash
npm i @lacspace/hookwriter
```

```ts
import { generate, compose } from "@lacspace/hookwriter";

const facts = {
  topic: "the rate cut",
  headline: "Nepal Rastra Bank cuts the policy rate",
  place: "Nepal", number: "4.5%",
  hashtags: ["NRB", "economy", "Nepal"],
};

generate(facts, { type: "hook", platform: "instagram", lang: "both" });
// → [{ style:"breaking", lang:"ne", text:"ताजा खबर: …" }, { style:"number", lang:"en", text:"4.5% …" }, …]

compose(facts, { platform: "instagram", lang: "en" }).text;
// → hook + caption + CTA + #NRB #economy #Nepal, fitted to 2200 chars
```

## Why

A newsroom needs a caption/title for every post on every platform — doing that with an LLM each time is slow, costly, and risks drift or hype. `hookwriter` stamps out on-brand, factual copy deterministically, and leaves the LLM only the occasional slot to fill.

## API

- **`generate(facts, { type, platform, lang?, styles?, max? })`** → `Variant[]` — many variants of one copy `type` (`hook` | `title` | `caption` | `cta` | `description`), each `{ style, lang, text, length }`. A template whose slots aren't all present in `facts` is **skipped** — nothing is fabricated — and anything sensational is dropped. Output is trimmed to the platform's limit.
- **`compose(facts, { platform, lang?, style?, cta?, maxHashtags? })`** → `{ hook, caption, hashtags, text }` — a full post assembled from the parts, hashtags capped per platform (30 on Instagram), fitted to the caption limit.
- **`slotTemplates(type, lang)`** → the raw templates with their `{slots}`, so an LLM can fill the slots itself (the only place AI is needed).
- **`describe()`** → machine-readable capabilities + JSON-Schema commands + the lists of `types`, `styles` and `platforms`, so an AI "conductor" drives it by choosing options.
- **`PLATFORMS` / `limitFor` / `fitText`** — the platform limits and the word-boundary trimmer, exported.

**Styles:** `plain`, `question`, `number`, `whatItMeans`, `contrast`, `curiosity`, `breaking`, `howto`, `quote`, `list`. **Platforms:** YouTube, Instagram, TikTok, Facebook, X, Threads, LinkedIn, Telegram. Pair it with `@lacspace/extractive` (facts/headlines) upstream.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
