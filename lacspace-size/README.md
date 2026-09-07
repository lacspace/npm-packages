# lacspace-size

**Measure build-output & bundle size as raw + gzip + brotli**, enforce **size budgets** in CI, and **diff against a saved baseline** to catch regressions in a PR. Zero runtime dependencies: compression is Node's built-in `node:zlib`, and the glob/dir-walk plus human-size math are hand-written, so it runs anywhere Node 20+ does.

```bash
npx lacspace-size dist
# ◆ lacspace-size  4 files · metric: gzip
#   File                     Raw       Gzip     Brotli       %
#   dist/vendor.js         182 kB     58 kB      49 kB    62.1%
#   dist/app.js             71 kB     22 kB      19 kB    23.6%
#   …
#   TOTAL                  310 kB     93 kB      78 kB     100%
```

It's the local, offline complement to [`lacspace-har`](https://developer.lacspace.com/tools/har) (network waterfalls) and [`lacspace-inspect`](https://developer.lacspace.com/tools/inspect) (live sites): point it at the files you actually ship.

## Why it exists

- **Free & keyless** — no account, no API key, no upload. Your bundles never leave the machine.
- **Zero dependencies** — only `node:fs`, `node:path`, `node:zlib`. Small, auditable, fast to install.
- **CI-native** — `--max`/`--budget` exit non-zero on breach; `--baseline`/`--max-increase` fail a PR that grows the bundle. No telemetry, ever.
- **Both a CLI and a typed library** — dual ESM + CJS with full `.d.ts`.

## Install

```bash
# one-off, no install
npx lacspace-size dist

# or globally
npm i -g lacspace-size

# or as a library
npm i lacspace-size
```

## CLI

```
lacspace-size [paths...] [options]
```

Paths may be **files**, **directories** (walked recursively) or **globs** (`src/**/*.js`). With no paths it measures `dist/` if present, else the current directory. By default `node_modules`, dotfiles and `.map` source maps are skipped.

| Flag | Description |
| --- | --- |
| `-m, --metric <raw\|gzip\|brotli>` | Metric used for %, budgets and diffs (default `gzip`) |
| `--top <n>` | Show only the *n* largest files |
| `--no-brotli` | Skip the slower brotli pass |
| `--no-gzip` | Skip the gzip pass |
| `--gzip-level <0-9>` | zlib gzip level (default `9`) |
| `--brotli-quality <0-11>` | brotli quality (default `11`) |
| `--binary` | Use KiB/MiB (1024) instead of kB/MB (1000) |
| `--json` | Machine-readable JSON to stdout |
| `-f, --format <md>` | Markdown report (great for PR comments) |
| `--max <size>` | Global budget on the **total** (e.g. `500kb`) |
| `-b, --budget <pat:size>` | Per-pattern budget, repeatable (e.g. `"*.js:200kb"`) |
| `-c, --config <file>` | Load `metric` / `max` / `budgets` from a JSON file |
| `--save-baseline <file>` | Write a JSON snapshot of this run |
| `--baseline <file>` | Compare this run to a saved snapshot |
| `--max-increase <size\|%>` | Fail if the total grew past this (e.g. `5kb` or `10%`) |
| `--include-maps` | Include `.map` source maps |
| `--include-hidden` | Include dotfiles / dot-directories |
| `--include-node-modules` | Descend into `node_modules` |
| `-h, --help` | Show help |
| `-v, --version` | Print the version |

**Sizes** accept `b`, decimal `kb`/`mb`/`gb` (×1000) and binary `kib`/`mib`/`gib` (×1024); a bare `k`/`m`/`g` is treated as binary. Data goes to **stdout**, human chrome and errors to **stderr**, so `--json`/`-f md` pipe cleanly. Respects `NO_COLOR`.

### Examples

Analyze a build directory, brotli metric, top 15:

```bash
npx lacspace-size dist --metric brotli --top 15
```

Enforce budgets in CI (exits non-zero if any is breached):

```bash
npx lacspace-size "dist/**/*.js" --max 500kb --budget "*.css:50kb"
#   Budgets · metric: gzip
#   ✓ **                 412 kB ≤ 500 kB (23 files)
#   ✗ *.css               61 kB > 50 kB over by 11 kB
# → exit 1
```

Save a baseline on `main`, then fail a PR that regresses by >5%:

```bash
# on main
npx lacspace-size dist --save-baseline .size.json

# in the PR
npx lacspace-size dist --baseline .size.json --max-increase 5%
#   Change vs baseline · metric: gzip
#   ▲ total +7.2 kB (+7.71%)  93 kB → 100 kB
#     ▲ dist/app.js     +6.1 kB
#     ＋ dist/new.js     +1.1 kB
# → exit 1
```

Analyze a single bundle (adds a gzip-vs-raw ratio):

```bash
npx lacspace-size bundle.js
#   gzip is 31.4% of raw (68.6% saved)
```

Markdown report for a PR comment:

```bash
npx lacspace-size dist -f md > size-report.md
```

Machine-readable JSON for a custom gate:

```bash
npx lacspace-size dist --json | jq '.total.gzip, .budgetsPass'
```

### Config file

Commit your size policy instead of long flag chains (`--config size.json`):

```json
{
  "metric": "gzip",
  "max": "500kb",
  "budgets": { "*.js": "200kb", "*.css": "50kb" }
}
```

## Library API

```ts
import { analyze, evaluateBudgets, parseBudgetSpec, formatSize } from "lacspace-size";

const result = analyze(["dist"]);
console.log(result.total.files, formatSize(result.total.gzip));

const budgets = ["*.js:200kb", "*.css:50kb"].map(parseBudgetSpec);
const pass = evaluateBudgets(budgets, result.files, "gzip").every((b) => b.ok);
```

| Export | Signature | Purpose |
| --- | --- | --- |
| `analyze` | `(inputs: string[], opts?) => AnalyzeResult` | Resolve inputs, measure every file, roll up totals + by-extension |
| `measureBuffer` | `(buf, opts?) => Sizes` | raw/gzip/brotli of an in-memory buffer |
| `measureFile` | `(path, reportPath, opts?) => FileMeasure` | Read + measure a file |
| `resolveInputs` | `(inputs, cwd, opts?) => string[]` | Expand files/dirs/globs to a file list |
| `walkDir` / `matchGlob` / `globToRegExp` | — | The hand-written walk + glob engine |
| `rollupByExtension` / `sumTotals` / `extOf` / `pick` | — | Aggregation helpers |
| `parseBudgetSpec` | `(spec: string) => Budget` | Parse `"*.js:200kb"` |
| `evaluateBudgets` | `(budgets, files, metric) => BudgetResult[]` | Sum per pattern, compute pass/fail |
| `budgetsPass` | `(results) => boolean` | The CI exit-code decision |
| `buildBaseline` / `saveBaseline` / `loadBaseline` | — | Snapshot a run to/from JSON |
| `diffBaseline` | `(current, baseline, metric) => DiffResult` | added/removed/grew/shrank + total delta + % |
| `exceedsMaxIncrease` | `(diff, threshold) => boolean` | Regression gate |
| `parseMaxIncrease` | `(input: string) => IncreaseThreshold` | Parse `"5kb"` / `"10%"` |
| `parseSize` / `formatSize` / `formatDelta` | — | Human-size parse & format (decimal + binary) |
| `buildJsonReport` / `toMarkdown` | — | Render the JSON / Markdown reports |
| `parseConfig` / `loadConfig` | — | Read a JSON config file |

Types exported: `Metric`, `AnalyzeOptions`, `AnalyzeResult`, `Totals`, `ExtRollup`, `Sizes`, `FileMeasure`, `MeasureOptions`, `WalkOptions`, `Budget`, `BudgetResult`, `Baseline`, `DiffResult`, `FileDelta`, `DeltaStatus`, `IncreaseThreshold`, `SizeConfig`, `ReportContext`, `FormatSizeOptions`.

## How the numbers are computed

- **raw** = the file's byte length on disk.
- **gzip** = `zlib.gzipSync(buf, { level })`, default level 9.
- **brotli** = `zlib.brotliCompressSync(buf, …)` at quality 11 with a size hint.

Each file is compressed **independently**, exactly as most static hosts/CDNs serve it. Numbers therefore match "what a browser downloads per file", not a single tarball of the whole directory.

## Limitations

- Files are measured **individually** — this is transfer size per asset, not a combined archive size, and it does not model HTTP/2 dictionary sharing across responses.
- It measures **bytes on disk**; it does not parse JS to attribute size to individual modules or dependencies (use it alongside a bundler's stats output for that).
- gzip/brotli here are Node's `zlib`; a CDN using a different encoder or level may differ by a few bytes.
- Budget globs match on path (and basename for slash-less patterns); they are not full `.gitignore` semantics.
- Everything is synchronous and local — great for CI, but for tens of thousands of files the brotli pass dominates (use `--no-brotli` to skip it).

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Free to use, keyless, offline.
