<div align="center">

# @lacspace/humanize

**Turn machine values into human-readable text — bytes, durations, relative time, ordinals, plurals, compact numbers & lists.**

[![npm version](https://img.shields.io/npm/v/@lacspace/humanize?color=%2316a34a&label=npm)](https://www.npmjs.com/package/@lacspace/humanize)
[![minzipped](https://img.shields.io/bundlephobia/minzip/@lacspace/humanize?label=minzip)](https://bundlephobia.com/package/@lacspace/humanize)
[![types](https://img.shields.io/badge/types-included-blue)](https://www.npmjs.com/package/@lacspace/humanize)
[![license](https://img.shields.io/npm/l/@lacspace/humanize?color=green)](https://github.com/lacspace/npm-packages/blob/main/LICENSE)

</div>

> All the little "make it readable" helpers you reach for on every UI — instead of installing `pretty-bytes` + `ms` + `humanize-duration` + a pluralize lib, get them as one tiny, typed, dependency-free package.

> **New in 1.1.0** — `numberToWords` / `numberToOrdinalWords`, Roman numerals (`toRoman` / `fromRoman`), SI units (`metric` / `si`, `unit`, `distance`, `weight`, `temperature`), extra text helpers (`truncateMiddle`, `initials`, `slugcase`), plus optional locale hooks on `ordinal` (custom suffixes) and `plural` (custom rule). Fully additive — every existing output is unchanged.

- 💾 `bytes` / `parseBytes` — `1536 → "1.5 KB"` (and IEC KiB)
- ⏱️ `duration` — `90061000 → "1d 1h"` (or long form)
- 🕒 `relativeTime` — `"3 hours ago"` / `"in 2 days"`
- 🔢 `ordinal`, `compact` (`1.2M`), `number` (grouping)
- ✍️ `pluralize`, `list` (`"a, b and c"`), `truncate`, `titleCase`
- 🔤 `numberToWords` (`1234 → "one thousand…"`), `numberToOrdinalWords` (`21 → "twenty-first"`)
- 🏛️ `toRoman` / `fromRoman` (1–3999)
- 📏 `metric` / `si` (`1500 → "1.5k"`), `unit`, `distance`, `weight`, `temperature`
- ✂️ `truncateMiddle`, `initials`, `slugcase`

## Install

```bash
npm install @lacspace/humanize      # or pnpm add / yarn add / bun add
```

## Use

```ts
import { bytes, duration, relativeTime, compact, ordinal, pluralize, list } from "@lacspace/humanize";

bytes(1536);                       // "1.5 KB"
duration(90061000);                // "1d 1h"
relativeTime(Date.now() - 3.6e6);  // "1 hour ago"
compact(1234567);                  // "1.2M"
ordinal(21);                       // "21st"
pluralize(3, "city");              // "3 cities"
list(["red", "green", "blue"]);    // "red, green and blue"
```

```ts
import { numberToWords, numberToOrdinalWords, toRoman, fromRoman, metric, unit, distance, temperature, truncateMiddle, initials, slugcase } from "@lacspace/humanize";

numberToWords(1234);               // "one thousand two hundred thirty-four"
numberToOrdinalWords(21);          // "twenty-first"
toRoman(2024);                     // "MMXXIV"
fromRoman("MMXXIV");               // 2024
metric(1500);                      // "1.5k"  (lowercase SI prefix; compact() gives "1.5K")
unit(3, "meter");                  // "3 meters"
distance(1500);                    // "1.5 km"
temperature(20);                   // "20°C"
truncateMiddle("/very/long/path/file.txt", 20); // "/very/long…/file.txt"
initials("John Fitzgerald Kennedy", { max: 3 }); // "JFK"
slugcase("Café del Mar");          // "cafe-del-mar"

// Locale hooks (English output unchanged by default):
ordinal(1, { suffixes: { one: "er", other: "e" } }); // "1er"
plural("ka", 2, undefined, { rule: (w) => `${w}-pl` }); // "ka-pl"
```

## API

| Group | Functions |
| --- | --- |
| Size | `bytes`, `parseBytes` |
| Time | `duration`, `relativeTime` |
| Numbers | `ordinal`, `compact`, `number`, `numberToWords`, `numberToOrdinalWords` |
| Roman | `toRoman`, `fromRoman` |
| Units | `metric` / `si`, `unit`, `distance`, `weight`, `temperature` |
| Words | `pluralize`, `plural`, `list`, `truncate`, `titleCase` |
| Text | `truncateMiddle`, `initials`, `slugcase` |

Options let you switch to IEC units, long durations, more precision, Oxford commas and custom separators. `ordinal` and `plural` also take an optional locale/options object (custom ordinal suffixes; a custom plural rule) without changing the default English output.

`numberToWords` names magnitudes up to ~10³⁶ (decillions); integers beyond `Number.MAX_SAFE_INTEGER` may already be imprecise as JS numbers. `toRoman`/`fromRoman` cover 1–3999.

## Licensing

This package is **free** under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms. Use it in personal and commercial projects at no cost; just keep the notice.

Not every Lacspace package is free. We also offer **Commercial**, **Client-specific** and **Private** packages under separate terms — see the **[Lacspace Licence Centre](https://lacspace.com/licenses)**.

<!-- LACSPACE-DEV-PLATFORM -->

---

## The Lacspace Developer Platform

`@lacspace/humanize` is part of **80+ zero-dependency, isomorphic TypeScript packages** — one standard library for the modern web. Explore the ecosystem:

- 📦 **This package, documented** — https://developer.lacspace.com/packages/humanize
- 🗂️ **All 80+ packages** — https://developer.lacspace.com/packages
- 🧭 **Developer handbook** — guides & runnable recipes — https://developer.lacspace.com/handbook
- 🧪 **Live playground** — run any package in your browser — https://developer.lacspace.com/playground
- 🖥️ **Finished app templates** — https://templates.lacspace.com
- 🚀 **Scaffold a full app** — `npm create lacspace-app@latest`

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — a permissive, free-to-use licence.

