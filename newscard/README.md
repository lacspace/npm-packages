# @lacspace/newscard

**Branded news image posts — headline, quote, stat, breaking banner and carousels — bilingual, with correct Devanagari shaping.** A deterministic layout engine (pure, testable) plus a renderer to PNG/WebP via **`sharp`**, whose Pango/HarfBuzz text path shapes complex scripts correctly — conjuncts and matras (`र्ग`, `सञ्चा`, `पृथ्वी`, `दिउँसो`) come out right. One brand theme in, publish-ready cards out — no LLM, no per-post design work.

> **Why sharp, not an SVG→PNG rasterizer?** Common SVG rasterizers (incl. resvg) don't run HarfBuzz-level shaping, so Devanagari renders garbled. `newscard` lays the card out itself and draws every text run through sharp's Pango text, which shapes correctly. (newscard ≤1.0 used resvg and had this bug — fixed in 1.1.)

```bash
npm i @lacspace/newscard   # sharp comes with it; its prebuilt libvips includes Pango text
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

### `composeCard(spec)` → `CardPlan`  (pure)
No native code — fully testable. Returns a flat plan: `{ width, height, background, rects, texts, images }`, where each text run carries Pango markup (font family per script, size, color) and a `plain` string. This is the layout `renderCard` executes. (`buildSvg(spec)` is still exported for a quick SVG string / Latin-only previews, but the raster path uses `composeCard`, since SVG rasterizers mis-shape Devanagari.)

### `renderCard(spec, { format?, quality? })` → `Promise<Uint8Array>`  (Node)
Renders the plan with `sharp`. `format: "png"` (default) or `"webp"`. Pass `theme.fontFiles` (first file) so Pango uses the exact font; otherwise it resolves `theme.fontFamily` / `fontFamilyNe` via fontconfig (system fonts). Use a Devanagari-capable family (Mukta / Noto Sans Devanagari).

### `renderCarousel(carousel, options?)` → `Promise<Uint8Array[]>`
Renders each slide with the shared theme/size and adds `n/total` page numbers (disable with `pageNumbers: false`).

### Sizes & types
Sizes: `portrait` 1080×1350 · `square` 1080×1080 · `og` 1200×630 · `story` 1080×1920 (or pass `{ width, height }`). Types: `headline`, `quote`, `stat`, `breaking`.

### `imagePrompt(request)` — safety-gated AI image helper
Turns a concept into a prompt for an image model and **always** labels the result `"AI illustration"`. It **refuses** to help produce a photoreal image, or an image of a named real public figure / specific real event — a newsroom must never pass synthetic imagery off as a real photo. Returns `{ prompt, negativePrompt, label }` or `{ refused, reason }` (use `isRefusal`). The image model itself is yours; this only writes the (safe) prompt.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
