# lacspace-har

**Read a browser `.har` export offline.** Point it at a HAR file your browser saved and get a clean performance report: waterfall **totals**, the **slowest** and **largest** requests, **third-party** and **MIME** breakdowns, **cache** and **compression** wins, and a set of **flagged issues**. Everything runs locally — nothing is uploaded. **Zero dependencies.**

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
  200     312 ms  shop.example.com/
  ...

Largest requests  (top 9)
  200     1.7 MB  img.assetcdn.net/banners/hero-4k.png ↗
  200     139 KB  cdn.thirdparty.io/bundle.min.js ↗
  ...

By domain   ↗ = third-party
  assetcdn.net  ↗ ██████████████████    1.7 MB 1×
  example.com   •  ░░░░░░░░░░░░░░░░░░   25.9 KB 6×

Wins & waste
  ✔ 1 cache hit · 85.5 KB saved by compression
  1 redirect (3xx) · 1 error (4xx/5xx)

Issues  (5)
  ▲ Uncompressed script (139 KB) — enable gzip/brotli   cdn.thirdparty.io/bundle.min.js
  ▲ Large image (1.7 MB) — resize or use WebP/AVIF      img.assetcdn.net/banners/hero-4k.png
  ...
```

## Examples

```bash
# Default report (domain breakdown)
lacspace-har session.har

# Show the top 20 slowest/largest, break down by MIME type
lacspace-har session.har --top 20 --by type

# Break down by status code (2xx / 3xx / 4xx / 5xx)
lacspace-har session.har --by status

# Machine-readable report to a file
lacspace-har session.har --json -o report.json
```

## What it measures

- **Totals** — request count, total **transfer** bytes (`response._transferSize` when the tool recorded it, else `bodySize + headersSize`), total **content** (uncompressed) bytes, summed request time, and page `DOMContentLoaded` / `load` timings from `log.pages`.
- **Slowest / Largest** — the top N requests by time and by transfer bytes, with method, status, ms and bytes.
- **Breakdowns** — by **MIME/type** category (`document` / `script` / `css` / `image` / `font` / `xhr-fetch` / `other`), by **domain** with a first-party vs third-party split (first party = the same registrable domain as the main document), and by **status bucket**.
- **Where the time went** — timing phases (`blocked` / `dns` / `connect` / `ssl` / `send` / `wait` / `receive`) summed across all requests.
- **Wins & waste** — redirects (3xx), errors (4xx/5xx), cache hits (`_fromCache` or `304`), and **bytes saved by compression** (text assets where uncompressed size > transfer size).
- **Issues** — heuristic flags: large uncompressed text assets, oversized images, too many third-party domains, and cacheable assets served without `Cache-Control`/`Expires`.

## Options

| Option | Meaning |
| --- | --- |
| `-t, --top <n>` | How many slowest/largest requests to list (default `10`) |
| `-b, --by <what>` | Which breakdown to print: `domain` (default), `type`, or `status` |
| `--json` | Emit the structured `HarReport` as JSON instead of the terminal report |
| `-o, --out <file>` | Write the output (report text, or JSON with `--json`) to a file |
| `-h, --help` | Show help |
| `-v, --version` | Print version |

Exits non-zero with a clear message when the file can’t be read or isn’t a valid HAR.

## Library

Everything the CLI does is exported as pure, typed functions.

```ts
import { parseHar, analyzeHar, formatReport } from "lacspace-har";
import { readFileSync } from "node:fs";

const har = parseHar(readFileSync("session.har", "utf8")); // throws HarParseError if not a HAR
const report = analyzeHar(har, { top: 10 });

console.log(report.totals.transferBytes, "bytes over the wire");
console.log(report.largest[0]);          // biggest request
console.log(report.wins.compressionSavedBytes);
console.log(formatReport(report, "type")); // the terminal report as a string
```

CommonJS works too:

```js
const { parseHar, analyzeHar } = require("lacspace-har");
```

### API

| Export | Signature |
| --- | --- |
| `parseHar` | `(text: string) => Har` — parse + validate; throws `HarParseError` |
| `analyzeHar` | `(har: Har, opts?: { top?: number; primaryUrl?: string }) => HarReport` |
| `formatReport` | `(report: HarReport, by?: "type" \| "domain" \| "status") => string` |
| Helpers | `transferBytes`, `contentBytes`, `categoryOf`, `hostOf`, `registrableDomain`, `isCacheHit`, `fmtBytes`, `THRESHOLDS` |
| Types | `Har`, `HarEntry`, `HarReport`, `RequestSummary`, `TypeBreakdown`, `DomainBreakdown`, `StatusBucket`, `TimingPhases`, `Issue`, `ResourceCategory`, `AnalyzeOptions` |

## How it works

A HAR file is just JSON — a `log.entries[]` array of request/response records that your browser writes out. `lacspace-har` reads that array and adds it up: it never makes a network request and never opens the pages again, so the numbers reflect exactly the session your browser captured.

## Limitations

- **Only as good as the HAR.** Fields like `_transferSize` and `_fromCache` are DevTools extensions — some tools omit them, in which case transfer bytes fall back to `bodySize + headersSize` and cache detection relies on `304`.
- **Summed, not wall-clock.** “Total request time” and the timing phases are sums across requests, not the real page load duration (requests overlap). Use the `load` / `DOMContentLoaded` markers for wall-clock.
- **First-party detection is heuristic** — the registrable domain of the first HTML document. Pass `primaryUrl` to the library to override.
- **Issue thresholds are opinionated** (see `THRESHOLDS`); treat flags as hints, not verdicts.

## Licence

Free under the **[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0)**. Part of the [Lacspace developer platform](https://developer.lacspace.com).
