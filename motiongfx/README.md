# @lacspace/motiongfx

**Animated news motion graphics as pure ffmpeg filters** — lower-thirds, breaking stingers, a scrolling ticker, a brand sting and auto-shorts — coloured by category and urgency, eased with time expressions, safe-area aware per platform, Devanagari-ready through your font. Drop the filters into a `@lacspace/montage` chain (single build or per cut in `buildMultiCut`).

```bash
npm i @lacspace/motiongfx
```

```ts
import { lowerThird, stinger, ticker, brandSting, shortsFromLandscape } from "@lacspace/motiongfx";

const brand = { primary: "#C8102E", secondary: "#0B1F3A", fontFile: "/fonts/Mukta-Bold.ttf", logo: "logo.png" };

lowerThird({ title: "सुरेशकुमार महतो", subtitle: "केन्द्र प्रमुख", start: 2, end: 6, category: "economy", animation: "slide" }, brand, "landscape");
// → ["drawbox=…band slides in…", "drawbox=…accent tab…", "drawtext=…title…", "drawtext=…subtitle…"]

stinger({ label: "ताजा खबर", start: 0, urgency: "breaking", style: "bar" }, brand, "reels");   // drops in, holds 2.5 s, lifts out
ticker({ items: ["NEPSE +12.5", "USD 154.41", "Kathmandu 27°C"], start: 0, end: 30, label: "LIVE" }, brand, "landscape");
brandSting({ logo: "logo.png", output: "sting.mp4", tagline: "WeNepal", duration: 1.6 }, brand);  // { args, duration } — render once, reuse as a clip
shortsFromLandscape("x1", "vout", { placement: "top" });  // { filter, picture } — 16:9 → 9:16 with blurred dimmed fill, captions go under the picture
```

## Pieces

| function | what you get |
|---|---|
| `lowerThird(o, brand, preset)` | accent tab + translucent band + title/subtitle; `animation: "slide" \| "wipe" \| "pop"`; eased in/out; `position` top/bottom; sized by the short side so it suits 16:9 and 9:16 |
| `stinger(o, brand, preset)` | `"bar"` (drops from above the safe top), `"flash"` (white flash then band), `"corner"` (blinking badge); default urgency `breaking` → brand primary |
| `ticker(o, brand, preset)` | right-to-left scroll along the bottom safe edge, items joined by " • ", optional coloured label block |
| `brandSting(o, brand)` | complete ffmpeg `args` for a 1–2 s sting: brand colour + logo eased zoom/fade (+ tagline) |
| `shortsFromLandscape(in, out, o)` | filter chain that fits the landscape picture by width over a blurred, dimmed copy; returns the picture rect so captions can be placed below |
| `accentFor(category, brand, urgency)` / `CATEGORY_COLORS` | conventional category colours (economy green, sports blue, weather teal, politics red …); breaking always uses `brand.primary` |

Everything returns strings/arrays — nothing runs. Use `montage`'s `runMontage`, or append the filters to your own graph. `describe()` returns the command schema for an AI conductor.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
