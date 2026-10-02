# @lacspace/postplan

**Pick the right post format for each story and platform — so Facebook gets a natural mix, not all videos.** Rule-based and deterministic: it weighs platform fit, what the story can actually produce, a breaking-news nudge, and a "don't repeat the last few" penalty. An optional cheap AI tie-break runs **only** when two formats are nearly tied.

```bash
npm i @lacspace/postplan
```

```ts
import { planPosts } from "@lacspace/postplan";

const plan = await planPosts(
  { hasVideo: true, imageCount: 3, hasStat: true, isBreaking: false },
  {
    platforms: ["facebook", "instagram", "tiktok", "x"],
    recent: { facebook: ["video", "video", "video"] }, // last 3 FB posts were videos
  },
);
// → [
//   { platform: "facebook",  format: "image",    reasons: [...], alternatives: [...] }, // mix penalty pushed it off video
//   { platform: "instagram", format: "carousel", ... },
//   { platform: "tiktok",    format: "video",    ... },
//   { platform: "x",         format: "image",    ... },
// ]
```

## Why

Deciding format-per-platform by hand (or by LLM for every story) is repetitive and burns tokens — and left to a naive rule it floods Facebook with videos. `postplan` makes the call deterministically and only spends a token or two on genuinely close decisions.

## API

### `planPosts(features, context, options?)` → `Promise<PlatformPlan[]>`
- **`features`** — `{ hasVideo?, imageCount?, hasStat?, hasQuote?, isBreaking?, textLength?, category? }`. Impossible formats are excluded (no video without an asset; a carousel needs ≥ 2 images, or a stat + quote).
- **`context`** — `{ platforms, recent? }`. `recent[platform]` is the last few formats posted there; repeats get a **mix penalty** so the feed stays varied.
- **`options`** — `tieThreshold` (default 0.1), `mixWindow` (default 5), and **`llm`** — an injected `(prompt) => Promise<string>` tie-break that is called **only** when the top two scores are within `tieThreshold`. Without it, selection is fully deterministic; if it throws, `planPosts` falls back to the deterministic pick.

Each **`PlatformPlan`**: `{ platform, format, score, alternatives, reasons, aiTieBreak? }` — `reasons` explains the decision, `alternatives` are the runners-up with scores.

### Platform affinities
Baked-in format affinities per platform (TikTok/YouTube lean video, X/Threads lean text/image, Instagram leans carousel/video, **Facebook is deliberately balanced** so it receives a healthy mix). Breaking news nudges toward fast formats (image, or video if ready) and away from carousels.

### `tieBreakPrompt(platform, features, candidates)` → `string`
The compact prompt used for the AI tie-break, exported so you can inspect or reuse it. It asks for a one-word answer to keep the call cheap.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
