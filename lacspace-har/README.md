# lacspace-har

**Read a browser `.har` export offline.** Point it at a HAR file your browser saved and get a clean performance report: **totals**, the **slowest** and **largest** requests, **third-party** and **MIME** breakdowns, **cache** and **compression** wins, and flagged **issues** — plus an **ASCII / HTML waterfall**, a **before → after diff**, a **budget CI gate**, **filters**, savings‑quantified **recommendations**, HAR‑derived **web‑vitals estimates**, one‑command **redaction**, and **CSV/JSON export**. Everything runs locally — nothing is uploaded. **Zero dependencies.**

```bash
npx lacspace-har session.har
```

## Get a HAR file

In any Chromium browser or Firefox: open **DevTools → Network**, reload the page, then right-click the request list → **“Save all as HAR”**. Feed that file to `lacspace-har`.

## Install

```bash
npm i -g lacspace-har     # then: lacspace-har session.har
# or, no install:
npx lacspace-har session.har
```

## What you get

```
◆ lacspace-har — offline HAR analysis
  shop.example.com/

Totals
  9 requests · 1.9 MB transferred · 2.0 MB uncompressed
  1.31 s total request time · DOMContentLoaded 812 ms · load 1.74 s

Slowest requests  (top 9)
  200     540 ms  img.assetcdn.net/banners/hero-4k.png ↗
  ...

Estimates  (HAR-derived, not field metrics)
  TTFB 242 ms · download 701 ms · LCP-candidate 1.14 s · 2 render-blocking

Recommendations  (6, by impact)
  → Shrink image (1.7 MB) — resize and/or use WebP/AVIF [save ~1.5 MB]
       img.assetcdn.net/banners/hero-4k.png
  → Compress script (139 KB uncompressed) with gzip/brotli [save ~100 KB]
       cdn.thirdparty.io/bundle.min.js
  ...

Issues  (5)
  ▲ Uncompressed script (139 KB) — enable gzip/brotli   cdn.thirdparty.io/bundle.min.js
  ...
```

## New in 0.2 — the highlights

### Waterfall (ASCII + shareable HTML)

```bash
lacspace-har session.har --waterfall --width 60     # time-positioned bars in the terminal
lacspace-har session.har --format html -o report.html   # a standalone visual waterfall
```

Each request is a bar positioned by its start time and split into timing **phases** (blocked / dns / connect / ssl / send / **wait (TTFB)** / receive) with per-phase colors. The HTML report is fully self-contained — no scripts, no external assets — so you can open or send it to anyone.

```
Waterfall  (5 requests · span 1.14s)
  200 example.com/               ░▒▒▓▓███████████···················· 320ms
  200 cdn.other.com/app.js       ·············░▒▒▓▓██████··········· 240ms
  200 img.cdn.net/hero.png       ······················░▒▒▓▓████████ 540ms
  ░ blocked  ▒ dns  ▒ connect  ▓ ssl  ▓ send  █ wait (TTFB)  █ receive
```

### Diff two HARs — prove an optimization worked

```bash
lacspace-har diff before.har after.har
lacspace-har diff before.har after.har --json      # machine-readable deltas
```

```
◆ lacspace-har diff — before → after
Totals
  requests         5 → 4       ▼ −1        (-20%)
  transfer         1.0 MB → 265 KB   ▼ −784 KB   (-74.8%)
  request time     1.28 s → 700 ms   ▼ −580 ms   (-45.3%)
Faster  (3)
  ▼ −110 ms  cdn.other.com/app.js
Added  (1)   +  186 KB  img.cdn.net/hero.webp
Removed  (2) −  801 KB  img.cdn.net/hero.png
```

Requests are matched by URL; you get per-metric deltas, per-type/domain deltas, and what was **added / removed / slower / faster**.

### Budgets — a CI gate

```bash
lacspace-har session.har --budget "js<300kb,images<500kb,requests<50,thirdparty<20,total<2mb"
```

Exits **non-zero** when any budget is exceeded, printing exactly which one:

```
Budget  (FAIL)
  ✗ js > 300 KB — is 176 KB
  ✔ requests < 50 — is 5
```

Keys: `js`, `css`, `images`, `fonts`, `document`, `xhr`, `other`, `total` (size, e.g. `<300kb`, `<2mb`), and `requests`, `thirdparty` (counts). `thirdparty` counts third-party **requests**.

### Filter / query — focus the whole report on a subset

```bash
lacspace-har session.har --filter "domain=cdn.x,type=image,status>=400,size>100kb,url~=/api/"
```

Clauses are **AND**-combined and applied before analysis, so totals, breakdowns, the waterfall and recommendations all reflect just the matching requests. Fields: `domain`, `type`, `status`, `size`, `url`, `method`. Operators: `=`, `!=`, `~=` (contains), `>`, `<`, `>=`, `<=`. Sizes accept `b`/`kb`/`mb`/`gb`.

### Redact — make a HAR safe to share

```bash
lacspace-har redact session.har -o safe.har        # to a file
lacspace-har redact session.har > safe.har          # or stdout
lacspace-har redact session.har --keep-bodies -o safe.har
```

Strips cookies, `Authorization` / auth headers, auth-looking query tokens (`token`, `access_token`, `api_key`, `sig`, `password`, …) and — unless `--keep-bodies` — request/response bodies. The input file is never modified.

### Export the per-request table

```bash
lacspace-har session.har --export requests.csv     # or requests.json
```

Dumps every request (method, status, type, domain, third-party, bytes, ms, start/end offsets, cache hit, url) alongside the normal report.

## Full options

| Option | Meaning |
| --- | --- |
| `-t, --top <n>` | How many slowest/largest requests to list (default `10`) |
| `-b, --by <what>` | Breakdown: `domain` (default), `type`, or `status` |
| `-f, --format <fmt>` | `terminal` (default), `json`, `html`, `waterfall` |
| `--json` / `--html` / `--waterfall` | Shorthands for the matching `--format` |
| `--filter <query>` | Keep only matching requests (see above) |
| `--budget <spec>` | CI gate; non-zero exit if exceeded (see above) |
| `--export <file>` | Also dump the per-request table (`.csv` or `.json`) |
| `--width <n>` | Waterfall track width in characters (default `40`) |
| `--no-color` | Disable ANSI colors |
| `-o, --out <file>` | Write the main output to a file |
| `-h, --help` / `-v, --version` | Help / version |

Subcommands: `lacspace-har diff <before> <after>` and `lacspace-har redact <file>` (both honor `-o`, `--json`/`--keep-bodies`, `--no-color`).

Exits non-zero with a clear message when a file can’t be read, isn’t a valid HAR, or a budget fails.

## What it measures

- **Totals** — request count, total **transfer** bytes (`response._transferSize` when the tool recorded it, else `bodySize + headersSize`), total **content** (uncompressed) bytes, summed request time, and page `DOMContentLoaded` / `load` timings.
- **Slowest / Largest** — top N by time and by transfer bytes.
- **Breakdowns** — by MIME/type, by **domain** (first- vs third-party), and by **status bucket**.
- **Where the time went** — timing phases summed across requests.
- **Wins & waste** — redirects, errors, cache hits, and **bytes saved by compression**.
- **Estimates (HAR-derived)** — TTFB (document `wait`), total download time (sum of `receive`), an **LCP candidate** (largest image/document/CSS finish time), and a count of likely **render-blocking** first-party CSS/JS. **These are derived from the HAR, not field metrics** — directional hints only.
- **Recommendations** — compressible text (gzip estimate), oversized images (with a target), render-blocking resources, and missing cache headers — each with an estimated **KB/ms saving**, sorted by impact.
- **Issues** — heuristic flags (large uncompressed text, oversized images, too many third parties, missing cache headers).

## Library

Everything the CLI does is exported as pure, typed functions.

```ts
import {
  parseHar, analyzeHar, formatReport,
  toWaterfall, toHtml, diffHars, budgetCheck,
  filterEntries, recommend, estimateVitals, redactHar, exportRequests,
} from "lacspace-har";
import { readFileSync } from "node:fs";

const har = parseHar(readFileSync("session.har", "utf8"));   // throws HarParseError
const report = analyzeHar(har, { top: 10 });
report.vitals = estimateVitals(har);

console.log(toWaterfall(har, { width: 60 }));                 // ASCII waterfall
console.log(formatReport(report, "type", { recommendations: recommend(har) }));

const html = toHtml(report, har);                             // standalone HTML string
const diff = diffHars(parseHar(before), parseHar(after));     // before → after deltas
const gate = budgetCheck(report, "js<300kb,requests<50");     // { pass, items }
const onlyImages = filterEntries(har, "type=image,size>100kb");
const safe = redactHar(har);                                  // cookies/auth/bodies stripped
const csv = exportRequests(har, "csv");
```

CommonJS works too: `const { parseHar, diffHars } = require("lacspace-har");`

### API

| Export | Signature |
| --- | --- |
| `parseHar` | `(text: string) => Har` — parse + validate; throws `HarParseError` |
| `analyzeHar` | `(har: Har, opts?: { top?: number; primaryUrl?: string }) => HarReport` |
| `formatReport` | `(report: HarReport, by?: "type" \| "domain" \| "status", opts?: FormatOptions) => string` |
| `buildTimeline` | `(har: Har, primaryUrl?: string) => Timeline` |
| `toWaterfall` | `(input: Har \| Timeline, opts?: WaterfallOptions) => string` |
| `toHtml` | `(report: HarReport, har: Har, opts?: HtmlOptions) => string` |
| `diffHars` / `formatDiff` | `(before: Har, after: Har, opts?: DiffOptions) => HarDiff` · `(diff, opts?) => string` |
| `budgetCheck` | `(report: HarReport, budget: string \| BudgetRule[]) => BudgetResult` |
| `filterEntries` | `(har: Har, filter: string \| FilterRule[]) => Har` |
| `recommend` | `(har: Har, opts?: RecommendOptions) => Recommendation[]` |
| `estimateVitals` | `(har: Har, primaryUrl?: string) => VitalsEstimate` |
| `redactHar` | `(har: Har, opts?: RedactOptions) => Har` |
| `exportRequests` / `summarize` | `(har: Har, format: "csv" \| "json", opts?) => string` · `(har, opts?) => ExportRow[]` |
| Helpers | `transferBytes`, `contentBytes`, `categoryOf`, `hostOf`, `registrableDomain`, `isCacheHit`, `fmtBytes`, `parseBudget`, `actualFor`, `parseFilter`, `parseSize`, `matchRule`, `THRESHOLDS` |

All 0.1 exports and behaviors are unchanged — 0.2 only adds.

## Limitations

- **Only as good as the HAR.** `_transferSize` and `_fromCache` are DevTools extensions — some tools omit them, so transfer bytes fall back to `bodySize + headersSize` and cache detection relies on `304`.
- **Summed, not wall-clock.** “Total request time” and the timing phases are sums across requests, not real page load duration. The **waterfall** and `buildTimeline` position requests by `startedDateTime`; when a HAR omits those, requests are laid out sequentially (positions are then approximate).
- **Estimates are derived, not measured.** TTFB / LCP-candidate / render-blocking come from the recorded timings and page markers, not the browser’s real vitals. Treat them as hints, and never confuse them with field data.
- **Recommendation savings are estimates.** The gzip figure assumes a typical text ratio (~72%); the image target is a heuristic. Measure the real thing before you celebrate.
- **Diff matches by URL.** Cache-busting hashes in filenames make a changed asset look like an add + remove.
- **First-party detection is heuristic** — the registrable domain of the first HTML document. Pass `primaryUrl` to override.

## Licence

Free under the **[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0)**. Part of the [Lacspace developer platform](https://developer.lacspace.com).
