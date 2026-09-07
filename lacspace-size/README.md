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

### New in 0.2.0

- **`--breakdown`** — estimate a single file's byte composition (code / strings / comments / whitespace), surface its largest string literals & lines, do a crude bundler-banner **module split**, and emit a **treemap-friendly JSON** with `--json`.
- **`-f comment`** — a tight, GitHub-PR-comment-ready Markdown table (file · raw · gzip · brotli · **Δ vs baseline** with +/- and %) plus a Total row.
- **`--summary`** — one compact status line (`12 files · raw 1.2 MB · gzip 380 kB · budgets 2/3 · Δ +4.1 kB (+1.1%)`).
- **`--fail-over <size|%>`** — a named CI regression gate (alias of `--max-increase`).
- **Auto-discovered `.sizerc.json`** — commit your size policy and it's picked up with no `--config` flag (opt out with `--no-config`).
- All additive & backward-compatible; every 0.1.0 flag, export and output field is unchanged.

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
| `--json` | Machine-readable JSON to stdout (includes a `summary` line; `--breakdown` emits treemap JSON) |
| `--summary` | One compact status line (files · raw · gzip · budgets · Δ) |
| `-f, --format <md\|comment>` | Markdown report; `comment` = tight PR-comment table with a Δ column |
| `--breakdown` | Byte-composition breakdown of a single file (the largest match) |
| `--max <size>` | Global budget on the **total** (e.g. `500kb`) |
| `-b, --budget <pat:size>` | Per-pattern budget, repeatable (e.g. `"*.js:200kb"`) |
| `-c, --config <file>` | Load `metric` / `max` / `budgets` from a JSON file |
| `--no-config` | Ignore an auto-discovered `.sizerc.json` |
| `--save-baseline <file>` | Write a JSON snapshot of this run |
| `--baseline <file>` | Compare this run to a saved snapshot |
| `--max-increase <size\|%>` | Fail if the total grew past this (e.g. `5kb` or `10%`) |
| `--fail-over <size\|%>` | CI regression gate (alias of `--max-increase`) |
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

Markdown report for a PR comment (full report, or a tight `comment` table with a Δ column):

```bash
npx lacspace-size dist -f md > size-report.md
npx lacspace-size dist --baseline .size.json -f comment > comment.md
```

A one-line summary, ideal for a CI job's log/step name:

```bash
npx lacspace-size dist --summary
#   12 files · raw 1.2 MB · gzip 380 kB · brotli 320 kB · budgets 2/3
```

Break a single bundle down into where its bytes go — and get a treemap JSON:

```bash
npx lacspace-size dist/bundle.js --breakdown
#   Composition
#   code        ██████████████░░░░░░░░░░  58.2%  25.8 kB
#   strings     █████░░░░░░░░░░░░░░░░░░░  22.1%   9.8 kB
#   whitespace  █████░░░░░░░░░░░░░░░░░░░  18.9%   8.4 kB
#   comments    ░░░░░░░░░░░░░░░░░░░░░░░░   0.9%   384 B
npx lacspace-size dist/bundle.js --breakdown --json > treemap.json
```

Machine-readable JSON for a custom gate:

```bash
npx lacspace-size dist --json | jq '.total.gzip, .budgetsPass, .summary'
```

### Config file

Commit your size policy instead of long flag chains. Pass it with `--config size.json`, **or** drop a `.sizerc.json` in the working directory and it's discovered automatically (opt out with `--no-config`):

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
| `buildJsonReport` / `toMarkdown` | — | Render the JSON / full Markdown reports |
| `toMarkdownComment` | `(result, ctx) => string` | Tight PR-comment table with a Δ column |
| `formatSummaryLine` | `(result, ctx) => string` | The compact one-line summary |
| `parseConfig` / `loadConfig` | — | Read a JSON config file |
| `discoverConfig` | `(cwd: string) => string \| undefined` | Find a `.sizerc.json` in a directory |
| `analyzeComposition` | `(input: string \| Uint8Array, opts?) => CompositionResult` | Estimate a file's byte composition + treemap |
| `analyzeCompositionFile` | `(path: string, opts?) => CompositionResult` | Read a file and estimate its composition |

Types exported: `Metric`, `AnalyzeOptions`, `AnalyzeResult`, `Totals`, `ExtRollup`, `Sizes`, `FileMeasure`, `MeasureOptions`, `WalkOptions`, `Budget`, `BudgetResult`, `Baseline`, `DiffResult`, `FileDelta`, `DeltaStatus`, `IncreaseThreshold`, `SizeConfig`, `ReportContext`, `FormatSizeOptions`, `CompositionResult`, `CompositionOptions`, `CompositionSegment`, `SegmentKind`, `StringLiteral`, `LineSlice`, `ModuleSlice`, `TreemapNode`.

## How the numbers are computed

- **raw** = the file's byte length on disk.
- **gzip** = `zlib.gzipSync(buf, { level })`, default level 9.
- **brotli** = `zlib.brotliCompressSync(buf, …)` at quality 11 with a size hint.

Each file is compressed **independently**, exactly as most static hosts/CDNs serve it. Numbers therefore match "what a browser downloads per file", not a single tarball of the whole directory.

## Limitations

- Files are measured **individually** — this is transfer size per asset, not a combined archive size, and it does not model HTTP/2 dictionary sharing across responses.
- It measures **bytes on disk**; it does not parse JS to attribute size to individual modules or dependencies (use it alongside a bundler's stats output for that).
- `--breakdown` is an **estimate** from a tiny hand-written scanner, not a real parser: regex literals, template interpolation and non-JS syntax are handled loosely, and the module split relies on bundler banner comments (`//# sourceURL=`, esbuild `// path/to/file.js`). It's for "roughly where did my bytes go", not byte-exact attribution.
- gzip/brotli here are Node's `zlib`; a CDN using a different encoder or level may differ by a few bytes.
- Budget globs match on path (and basename for slash-less patterns); they are not full `.gitignore` semantics.
- Everything is synchronous and local — great for CI, but for tens of thousands of files the brotli pass dominates (use `--no-brotli` to skip it).

## Licence

Lacspace Free Licence v1.0 — see [LICENSE](./LICENSE). Free to use, keyless, offline.
