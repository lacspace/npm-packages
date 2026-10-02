# @lacspace/newscard

**Branded news image posts — headline, quote, stat, breaking banner and carousels — bilingual, with correct Devanagari shaping.** A deterministic SVG layout engine (pure, testable) plus a renderer to PNG/WebP via `@resvg/resvg-js` (HarfBuzz shaping, embedded fonts). One brand theme in, publish-ready cards out — no LLM, no per-post design work.

```bash
npm i @lacspace/newscard   # @resvg/resvg-js comes with it (ships prebuilt binaries)
```

```ts
import { renderCard, buildSvg } from "@lacspace/newscard";

const theme = {
  bg: "#0b1f3a", fg: "#ffffff", accent: "#e63946",
  fontFamily: "Mukta", fontFamilyNe: "Noto Sans Devanagari",
  fontFiles: ["/fonts/Mukta-Bold.ttf", "/fonts/NotoSansDevanagari-Bold.ttf"], // embedded for shaping
  footer: "WeNepal", logo: "data:image/svg+xml;base64,…",
};

const png = await renderCard({
  size: "portrait",             // 1080×1350 (also square, og 1200×630, story 1080×1920)
  type: "breaking",             // headline | quote | stat | breaking
  theme,
  lang: "both",                 // en | ne | both (Nepali first)
  kicker: { en: "Breaking", ne: "ताजा खबर" },
  headline: { en: "Budget passed", ne: "बजेट पारित भयो" },
});                             // → PNG bytes (Uint8Array); { format: "webp" } needs sharp

const svg = buildSvg(spec);     // pure — the SVG string, for tests or your own rasterizer
```

## Why

Designing every post by hand (or asking an LLM to emit SVG each time) is slow and burns tokens. `newscard` encodes the house style once and stamps out correct, on-brand cards deterministically — including correct Nepali conjuncts/matras, which naive SVG→PNG paths get wrong.

## API

### `buildSvg(spec)` → `string`  (pure)
No native code — fully testable. The SVG carries the brand background/accent, an accent bar + kicker (or a breaking banner), the headline/quote/stat, an attribution line, and the logo + footer. Devanagari text automatically uses `fontFamilyNe`.

### `renderCard(spec, { format?, quality? })` → `Promise<Uint8Array>`  (Node)
Rasterizes via `@resvg/resvg-js`. `format: "png"` (default) or `"webp"` (needs `sharp`). Pass `theme.fontFiles` so the renderer embeds the exact fonts and shapes Devanagari correctly — otherwise it falls back to system fonts.

### `renderCarousel(carousel, options?)` → `Promise<Uint8Array[]>`
Renders each slide with the shared theme/size and adds `n/total` page numbers (disable with `pageNumbers: false`).

### Sizes & types
Sizes: `portrait` 1080×1350 · `square` 1080×1080 · `og` 1200×630 · `story` 1080×1920 (or pass `{ width, height }`). Types: `headline`, `quote`, `stat`, `breaking`.

### `imagePrompt(request)` — safety-gated AI image helper
Turns a concept into a prompt for an image model and **always** labels the result `"AI illustration"`. It **refuses** to help produce a photoreal image, or an image of a named real public figure / specific real event — a newsroom must never pass synthetic imagery off as a real photo. Returns `{ prompt, negativePrompt, label }` or `{ refused, reason }` (use `isRefusal`). The image model itself is yours; this only writes the (safe) prompt.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
