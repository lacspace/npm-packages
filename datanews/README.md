# @lacspace/datanews

Writes routine data stories in **English and Nepali** from structured numbers, with no AI. It covers gold and silver prices, Nepal Rastra Bank forex rates, the NEPSE market close, Department of Hydrology and Meteorology forecasts, and fuel prices. Each story is a complete pack: headline, deck, summary, 3–5 body paragraphs, 3 bullets, tags, category and the key numbers. These stories make up a large share of a newsroom's output, and none of them needs an LLM call.

```ts
import { render, renderBoth } from "@lacspace/datanews";

render("gold_silver", {
  gold: { perTola: 294800, prev: 293300 },
  silver: { perTola: 4425, prev: 4400 },
}, { lang: "en", date: "2026-10-04" }).headline;
// Gold rises Rs 1,500 to Rs 294,800 per tola; silver at Rs 4,425

render("gold_silver", { gold: { perTola: 294800, prev: 293300 } }, { lang: "ne" }).headline;
// सुनको भाउ तोलामा १,५०० रुपैयाँले बढेर २,९४,८०० रुपैयाँ पुग्यो

const { en, ne } = renderBoth("nepse_close", {
  index: 2683, change: -12.4, changePct: -0.46, turnover: 4123456789, volume: 9876543,
  gainers: [{ symbol: "SBLD89", pct: 8.8 }], losers: [{ symbol: "SINDU", pct: -8.55 }],
}, { date: "2026-10-04" });
en.headline; // NEPSE falls 12.4 points to 2,683 as turnover crosses Rs 4 billion
ne.headline; // नेप्से १२.४ अंकले घटेर २,६८३ मा, कारोबार ४ अर्ब नाघ्यो
en.body;     // ["The Nepal Stock Exchange (NEPSE) index fell 12.4 points, or 0.46%, to close at 2,683 on 4 October 2026.", ...]
```

## Kinds

| Kind | Input | Attribution (default) |
|---|---|---|
| `gold_silver` | `{ gold: { perTola, prev? }, silver: { perTola, prev? }, unit?: "tola" \| "10g" }` | none; pass `source` |
| `forex_nrb` | `{ rates: [{ code, buy, sell, unit?, prevSell? }] }` | Nepal Rastra Bank |
| `nepse_close` | `{ index, change?, changePct?, turnover?, volume?, transactions?, gainers?, losers? }` | none |
| `weather_dhm` | `{ regions: [{ name, forecast }], warnings? }` (text as a string or `{ en, ne }`) | Department of Hydrology and Meteorology |
| `fuel_price` | `{ petrol?, diesel?, kerosene?, lpg?, prev?: {...} }` | Nepal Oil Corporation |

`forex_nrb` lists up to five currencies. The Indian rupee always comes first and the US dollar second; the rest are the biggest movers by selling rate, or the major currencies when no previous rates are given.

## Rules it keeps

- **Numbers:** every number in the text comes from your input. Totals are only converted (e.g. to billion, crore or arba), never invented.
- **Missing fields:** a missing field drops its sentence. The text never says "N/A". If nothing usable is left, it throws `DataNewsError`.
- **No editorialising:** no invented causes, quotes or judgement words, and no media outlets named.
- **Phrasing:** rotates with a seed taken from `date` (or pass `seed`), so consecutive days don't read the same.
- **Nepali:** reads as native Nepali, not a translation. It uses Devanagari numerals with lakh grouping (२,९४,८००) and करोड/अर्ब for large sums. English uses international grouping and million/billion.

## Options

- **`lang`:** `"en"` (the default) or `"ne"`.
- **`date`:** an ISO date or `Date`. It seeds the phrasing and appears in English text as "4 October 2026".
- **`dateLabel`:** a pre-formatted date per language, e.g. `{ ne: "असोज १८" }` for Bikram Sambat. Nepali text omits the date unless you pass one.
- **`seed`:** fixes the phrasing.
- **`source`:** overrides the attribution, as a string or `{ en, ne }`.
- **`category`:** overrides the category.

## Helpers

- **`formatNumber(n, lang, decimals?)`:** 294,800 / २,९४,८००
- **`formatBigMoney(n, lang)`:** Rs 4.12 billion / ४.१२ अर्ब रुपैयाँ
- **`toDevanagari(s)`**
- **`KINDS`**
- **`describe()`**

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
