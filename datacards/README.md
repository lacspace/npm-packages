# @lacspace/datacards

**Automatic data posts from official Nepal sources — forex, gold, fuel, weather, air quality, NEPSE — as finished bilingual cards with caption, alt text, hashtags and a video plan. No AI tokens.**

```bash
npm i @lacspace/datacards @lacspace/newscard sharp
```

```ts
import { datacard, worthPosting, toMontage } from "@lacspace/datacards";
import { renderCard } from "@lacspace/newscard";

const theme = { bg: "#0b1f3a", fg: "#fff", accent: "#c8102e", fontFamily: "Mukta", footer: "wenepal.com" };

const card = await datacard("forex", { theme, size: "portrait", lang: "both", history: last30UsdSells });
// card.spec     → newscard CardSpec (type "table", BS + AD dated, deltas coloured, sparkline)
// card.caption  → { en: "NRB forex for 2 October 2026: US dollar up at Rs 154.41 (sell), +0.77 …", ne: "…" }
// card.alt, card.hashtags, card.facts, card.snapshot

if (worthPosting(card.snapshot, yesterdaySnapshot).post) {
  const png = await renderCard(card.spec);          // 1080×1350 PNG, correct Devanagari shaping
}
```

## Sources (official only, bring-your-own-fetch)

| kind | source | notes |
|---|---|---|
| `forex` | Nepal Rastra Bank `api/forex/v1/rates` | buy/sell per currency, Δ vs previous published day |
| `gold` | FENEGOSIDA dashboard API | hallmark / tejabi gold + silver per tola & 10 g, Δ vs yesterday |
| `fuel` | Nepal Oil Corporation home page | petrol / diesel / kerosene / LPG / ATF; pass `previousFuel` for Δ |
| `weather` | DHM Meteorological Forecasting Division `mfd/api/weather` | city min/max, rain %, condition (en+ne), sunrise/sunset; latest three-day bulletin flagged **special** on warning words → card switches to a breaking alert |
| `aqi` | Department of Environment `pollution.gov.np/gss/api` | station PM2.5 → AQI (EPA 2024 breakpoints), category en/ne, 24-h hourly history |
| `nepse` | **injected** via `nepseFromJson()` | NEPSE's endpoints need a session token; normalise whatever official JSON you have |

Every snapshot carries `source`, `url`, `fetchedAt`; every card prints a source line.

## Cards

`forexCard` · `goldCard` · `fuelCard` · `weatherCard` · `aqiCard` · `nepseCard` · `cardFor(snapshot)` — each returns a `DataCard`:

- `spec` — a `@lacspace/newscard` spec (type `table`, or `breaking` for weather alerts) with Bikram Sambat + AD date line, coloured deltas, weather glyphs, optional `history` sparkline.
- `caption.en / caption.ne` — one-sentence post copy with Nepali numerals and लाख/करोड wording.
- `alt` — accessibility text listing the figures.
- `hashtags`, `facts` — for the conductor / `@lacspace/hookwriter`.

`toMontage(cards, { images, fontFile, output, sting, audio, lang })` turns rendered cards into a `@lacspace/montage` timeline (sting → Ken Burns stills → crossfades → kinetic captions) for a 10–15 s video variant.

`worthPosting(snapshot, previous)` gates repeats: new NRB day, changed gold/fuel prices, new DHM issue or special bulletin, AQI category change, new trading day.

`describe()` returns the command schema for an AI conductor.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
