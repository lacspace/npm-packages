# @lacspace/marketwrap

Writes a daily stock-market wrap in **English and Nepali** from your numbers, with no AI. Most days the wrap needs no LLM at all; when you do want an LLM, give it this as a grounded draft.

```ts
import { marketWrap } from "@lacspace/marketwrap";

const w = marketWrap({
  index: { name: "NEPSE", close: 2587.25, change: -11.9, pct: -0.45 },
  breadth: { up: 95, down: 238, flat: 23 },
  turnoverRs: 4293774181,
  sectors: [{ name: "Mutual Fund", pct: 0.2 }, { name: "Trading", pct: -0.96 }],
  gainers: [{ symbol: "SBLD89", pct: 8.8 }],
  losers: [{ symbol: "SINDU", pct: -8.55 }],
});

w.en;
// NEPSE fell 11.90 points (−0.45%) to 2,587.25. Decliners led 238 to 95. Turnover Rs 4.29 arba.
// Mutual Fund was the best sector (+0.20%), Trading the weakest (−0.96%).
w.ne;
// नेप्से ११.९० अंक (−०.४५%) घटेर २,५८७.२५ मा बन्द भयो। २३८ कम्पनीको शेयरमूल्य घट्यो भने ९५ को बढ्यो र २३ को स्थिर रह्यो।
// कारोबार रकम रु ४.२९ अर्ब रह्यो। उपसमूहतर्फ म्युचुअल फन्ड (+०.२०%) सबैभन्दा राम्रो र व्यापार (−०.९६%) सबैभन्दा कमजोर रह्यो।
w.headline; // { en: "NEPSE down 11.90 points", ne: "नेप्से ११.९० अंकले घट्यो" }
w.facts;    // direction, points, pct, breadth leader, turnover, best/worst sector, top movers
```

## Options

- **`seed`**: pass the trading date (`"2026-10-04"`) to rotate between phrasings. Each sentence has 2–3 variants, chosen deterministically, so the same seed always gives the same text and different days read differently. Without a seed, every sentence uses its first (house) phrasing.
- **`parts`**: which sentences to write, in order. The default is `["index", "breadth", "turnover", "sectors"]`; add `"movers"` for the top gainer and loser.
- **`nepaliNames`**: Nepali names for indices and sectors, merged over the built-in NEPSE map (`NEPSE → नेप्से`, `Hydropower → जलविद्युत`, `Mutual Fund → म्युचुअल फन्ड` …).
- **`currency`**: `{ en: "Rs", ne: "रु" }` by default.

Edge cases have their own wording: flat days, level breadth, all sectors up and all sectors down. Every number comes from your input. The wording describes what happened and never advises or predicts.

## Helpers

`groupSouthAsian(n, decimals)` gives lakh/crore digit grouping. `signedPct(p)` gives `+0.20%` / `−0.45%`. `rupeesInWords(rs)` returns `{ en: "Rs 4.29 arba", ne: "रु ४.२९ अर्ब" }`. `toDevanagari(s)` converts digits.

Related: [`@lacspace/nepali-utils`](https://www.npmjs.com/package/@lacspace/nepali-utils) (NPR formatting, Nepal time), [`@lacspace/nepali-date`](https://www.npmjs.com/package/@lacspace/nepali-date) (BS ↔ AD), [`@lacspace/market-clock`](https://www.npmjs.com/package/@lacspace/market-clock) (NEPSE sessions).

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
