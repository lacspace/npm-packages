# @lacspace/trends

**Trending topics and hashtags for a region — from official/public sources only, with story-relevance gating so you never trend-jack.** Merges Google Trends daily RSS, YouTube `mostPopular` (optional key) and Wikipedia pageviews across scripts, scores them (multi-source terms rank up), scores each against your story, and builds per-platform hashtag sets with limits and a shadow-ban filter.

```bash
npm i @lacspace/trends
```

```ts
import { trends, hashtagsFor } from "@lacspace/trends";

const { trends: list, sources, warnings } = await trends({
  geo: "NP",
  youtubeApiKey: process.env.YOUTUBE_API_KEY,   // optional
  relevanceTo: "NEPSE index rose as investors returned", // optional: gate to your story
  minRelevance: 0.3,
});
// list → [{ term, score, sources:["google","wikipedia"], volume, links, relevance }]

hashtagsFor(list.map((t) => t.term), "instagram"); // ["#Dashain", "#NEPSE", …] capped at 30
```

## Why

Picking trending topics/hashtags by hand misses the window; asking an LLM "what's trending" invents or hallucinates. `trends` pulls only **real, official/public signals**, merges them deterministically, and — crucially — scores each trend's relevance to *your* story so you ride only topics you can legitimately cover.

## Sources (official/public only)

- **Google Trends** daily trending-searches RSS for a `geo` (with approx traffic + news links).
- **YouTube Data API** `videos.list chart=mostPopular regionCode` — optional, needs an API key.
- **Wikipedia pageviews** top articles (free REST API, no key; `ne.wikipedia` or `en.wikipedia`).

Each source is bring-your-own-`fetch`; a failing source becomes a `warnings` entry, never a thrown error.

## API

- **`trends(options)`** → `{ trends, sources, warnings }`. Options: `geo`, `sources`, `youtubeApiKey`, `wikipediaProject`, `relevanceTo` (+ `minRelevance`), `fetch`, `signal`.
- **`mergeTrends(raw[])`** → merges raw trends across scripts (Dashain ≡ दशैं) and boosts multi-source agreement.
- **`relevanceTo(trends, story, { min? })`** → attaches a 0–1 `relevance` (token overlap via `@lacspace/keyphrase` + `@lacspace/translit`), optionally filtering.
- **`hashtagsFor(terms, platform, { banned?, max?, extra? })`** → camel-cased, de-duplicated hashtags within the platform limit (IG 30, X 3, TikTok 6…), dropping banned/shadow-ban-prone tags.
- **Source fns** `googleTrendsDaily`, `youtubeMostPopular`, `wikipediaTop` and `parseGoogleTrendsRss` are exported.
- **`describe()`** → machine-readable command schema for an AI "conductor".

Merging is **exact-key** (after cross-script romanization) so it never fuses two genuinely different topics; differently-phrased mentions stay separate by design.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
