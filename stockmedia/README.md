# @lacspace/stockmedia

**Find free-licence b-roll and photos for a story — one API over Pexels + Pixabay, with licence and attribution attached.** Searches the two official stock APIs, normalizes both to one asset shape, carries the licence and a one-line credit per asset, and filters by orientation / resolution / duration / safe-search. **Never scrapes** news sites, social media or image search — only the official APIs. Deterministic, zero third-party dependencies, bring-your-own-fetch.

```bash
npm i @lacspace/stockmedia
```

```ts
import { createStockMedia } from "@lacspace/stockmedia";

const stock = createStockMedia({
  pexelsKey: process.env.PEXELS_API_KEY,     // string | comma-list | string[] (pooled)
  pixabayKey: process.env.PIXABAY_API_KEY,
});

const { assets, warnings } = await stock.search("himalaya sunrise", {
  type: "video",          // "photo" | "video" | "both"
  orientation: "portrait", // for a 9:16 reel
  minWidth: 1080,
  minDuration: 5,
  maxDuration: 20,
  newsSafeOnly: true,      // drop shots that look like identifiable people/brands
});

for (const a of assets) {
  console.log(a.downloadUrl, "—", a.attributionText, `(${a.licence})`);
  // "Video by Reel Co on Pexels (Pexels License)"
}
const bytes = await stock.download(assets[0]); // Uint8Array, via your fetch
```

## Why

Picking cover video/photos by hand or by LLM is slow and burns tokens. This does it deterministically: one keyword search returns ranked, licence-clean assets ready to drop into a render — with the credit line already written.

## API

### `createStockMedia(options)` → client
- **`pexelsKey` / `pixabayKey`** — one key, a comma-list, or an array. **Pooled** round-robin, and a key that returns `429` is parked briefly. Falls back to `PEXELS_API_KEY` / `PIXABAY_API_KEY` env vars.
- **`fetch`** — a fetch implementation (defaults to global `fetch`; inject one to test or to run on older Node).
- **`cacheTtlMs`** — cache identical searches (default 10 min; `0` disables).

### `client.search(query, options?)` → `{ query, assets, providers, warnings }`
Each **`StockAsset`**: `{ id, provider, type, width, height, duration?, orientation, thumb, files[], downloadUrl, author, authorUrl, sourceUrl, licence, attributionText, tags, safeForNews }`.
- **Filters**: `type`, `provider`, `orientation`, `minWidth`, `minHeight`, `minDuration`, `maxDuration`, `safeSearch` (Pixabay native; Pexels has no explicit flag), `newsSafeOnly`, `perPage`, `page`.
- A failed provider (missing key, rate limit) becomes a `warnings` entry — the other provider's results still come back.

### `safeForNews` — a heuristic, not a guarantee
`true` when nothing in the tags/description suggests an **identifiable person** or a **brand/logo**. The stock APIs expose no face or logo detection, so this is a conservative tag check: landscapes/abstract/objects pass; portraits/crowds/logos don't. **Always have an editor confirm** a shot that could show a real person or brand before publishing it with a news story.

### `client.download(asset)` → `Uint8Array`  ·  `client.pickRendition(asset, minWidth)`
`download` fetches the asset bytes via your `fetch` (bring your own storage). `pickRendition` returns the smallest rendition that still meets a minimum width — don't pull a 4K clip for a 1080-wide reel.

### Licences
Respect each provider's terms. **Pexels License** and **Pixabay Content License** both allow free commercial use without attribution, but crediting the author is good practice and expected by newsrooms — `attributionText` gives you a ready one-liner, and `author` / `sourceUrl` let you build a fuller credit.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
