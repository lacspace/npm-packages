# @lacspace/translit

**Match "Ram Chandra Poudel" to "रामचन्द्र पौडेल".** Nepali ⇄ English name transliteration and cross-script fuzzy name matching, plus Devanagari-aware script-ratio analysis that ignores proper nouns and quotes. Zero dependencies, isomorphic, deterministic.

Built to clear the newsroom hold "this name isn't in the sources or gazetteer" that fires when a Nepali article spells a name the English sources wrote in Latin (or vice-versa).

```bash
npm i @lacspace/translit
```

```ts
import { matchName, transliterate, nameVariants, dominantScript } from "@lacspace/translit";

matchName("Ram Chandra Poudel", "रामचन्द्र पौडेल").match;   // true
matchName("Dr. K. P. Sharma Oli", "KP Sharma Oli").match;   // true (titles + initials)
matchName("Ram Chandra Poudel", "Sher Bahadur Deuba").match; // false

matchName("पौडेल रामचन्द्र", "Ramchandra Poudel", {
  gazetteer: ["Ram Chandra Poudel", "Sher Bahadur Deuba"],
}).canonical;                                                // "Ram Chandra Poudel"

transliterate("रामचन्द्र");            // "raamachandra"  (Devanagari → Latin)
nameVariants("Poudel");               // ["Poudel", "Paudel", ...]
```

## What it does

- **`matchName(a, b, { threshold?, gazetteer?, strictSibilants? })`** — compares two names across scripts and spellings. It romanizes Devanagari, strips honorifics/office titles, and applies a **per-token safety guard** (each token must agree on its consonant skeleton and syllable count) so two *different* people who share a surname never collapse into one — Sita Sharma ≠ Gita Sharma, Sushila ≠ Sushil, शाह Shah ≠ साह Sah under `strictSibilants: true`. Handles cross-script merge/split (रामचन्द्र ≡ "Ram Chandra"), spelling variants (Poudel/Paudel, Adhikary/Adhikari, देउवा/Deuba), and initials/abbreviations (K.P., Bdr.). Pass a `gazetteer` to get the canonical spelling back.
  - ⚠️ **Check `match`, not `score`.** A pair can score above `threshold` yet return `match: false` because it failed the safety guard (they look alike but are different people). Always branch on `result.match`.
  - `strictSibilants: true` keeps श/ष ("sh") distinct from स ("s") for callers who need साह and शाह kept apart; default is lenient (sh ≈ s, tolerant of romanization variance).
- **`transliterate(text, { from?, to? })`** — Devanagari→Latin is a solid phonetic romanization with schwa deletion (राम → raam); Latin→Devanagari is best-effort.
- **`nameVariants(name)`** — common spelling variants for search/matching.
- **`stripHonorifics` / `normalizeName` / `phoneticKey`** — the building blocks, exported.
- **`scriptRatio(text)`** — character counts by script (Devanagari / Latin / digit / other).
- **`dominantScript(text, { gazetteer?, ignoreQuotes?, ignoreNames? })`** — returns `ratio` and an **`adjustedRatio`** that excludes quoted spans and proper nouns, so an English article naming a few Nepali people isn't wrongly judged Nepali. Fixes the "Devanagari ratio 0.05 → held" false positive.

All deterministic and dependency-free. Romanization is phonetic (tuned for names), not strict IAST.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
