# @lacspace/thumbgen

**Thumbnail variants from a headline and a licensed photo — five layouts, urgency and category colouring, Devanagari-correct, with a rationale per variant for A/B picking.** Sizes: YouTube 1280×720, Open Graph 1200×630, square 1080×1080, story 1080×1920.

```bash
npm i @lacspace/thumbgen sharp
```

```ts
import { thumbnails, composeThumbs } from "@lacspace/thumbgen";

const variants = await thumbnails({
  theme: { bg: "#0b1f3a", fg: "#fff", accent: "#c8102e", fontFamily: "Mukta", logo: "logo.png" },
  size: "youtube",
  headline: { en: "NEPSE closes at a record high", ne: "नेप्से रेकर्ड उचाइमा बन्द" },
  kicker: { en: "Economy", ne: "अर्थतन्त्र" },
  image: "cover.jpg", credit: "Photo: Pexels / Name",
  stat: "+12.5%", attribution: "NRB governor", urgency: "normal", lang: "ne",
});
// → [{ layout: "split" | "fullbleed" | "band" | "badge" | "quote", image: PNG bytes, fontSize, lines, rationale, plan }]
```

## Layouts

- **split** — headline on brand colour (left 55 %), photo cover-cropped on the right with a soft fade into the colour. Safest YouTube default.
- **fullbleed** — photo full frame under a dark scrim; headline bottom-left; breaking adds a full-width accent banner with the kicker.
- **band** — typographic: big headline, accent band with the kicker at the bottom, optional rounded photo tile. Works without a photo.
- **badge** — a giant number (`stat`) above the headline — for forex/NEPSE/weather data stories.
- **quote** — big accent quote mark, headline as the quote, attribution, optional round portrait tile.

Only layouts whose inputs exist are produced (no image → no split/fullbleed; no `stat` → no badge). The headline auto-fits: the largest size that wraps into ≤ 3–4 whole-word lines (never inside a Devanagari word), down to a minimum, then ellipsis.

`composeThumbs(spec)` is pure (returns newscard `CardPlan`s) and `renderThumb` / `thumbnails` render via `@lacspace/newscard`'s sharp/Pango path (correct conjunct shaping). Feed `rationale` + `layout` to `@lacspace/postbandit` to learn which layout wins per category.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
