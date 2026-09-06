# lacspace-inspect

**One-command website audit.** Point it at a URL and get a clean, graded report on **SEO & meta**, **Open Graph / Twitter**, **JSON-LD structured data**, **content & accessibility** (one `<h1>`, heading order, image `alt`), **links** (internal / external / broken), **performance** (size, render-blocking, response time, compression, image dimensions/lazy-loading), **security** (HTTPS, mixed content, http→https redirect, response security headers) and **crawlability** (robots.txt + sitemap) — plus a light **tech-stack** sniff. Every category is scored, everything rolls up to an overall **grade A–F**, and there's a **CI gate** that fails your build below a minimum grade. No API keys. Built on the [lacspace-scraper](https://www.npmjs.com/package/lacspace-scraper) engine.

```bash
npx lacspace-inspect https://example.com
```

**New in 0.2** — every warning/failure now comes with a **concrete fix**; audit a **whole site** with `--crawl` (per-page leaderboard + site-wide duplicate titles/descriptions + broken internal links); set **performance budgets** (`--budget`); **diff against a baseline** to fail CI on regressions; **batch** many URLs (`--input`); and export **Markdown** (`-f md`, perfect for a PR comment) or a **standalone HTML** report (`-f html`).

## Install

```bash
npm i -g lacspace-inspect      # then: lacspace-inspect <url>
# or, no install:
npx lacspace-inspect <url>
```

## Sample report

```text
◆ lacspace-inspect — website audit

  https://example.com/
    C   71/100   ██████████████░░░░░░
  HTTP 200 · HTTPS · 1 KB

  C  SEO & Meta  ██████████████░░░░░░ 70
     ✗ Missing meta description
     ▲ No canonical link
     ▲ No charset meta
     + 5 passing checks

  F  Social / Open Graph  ███░░░░░░░░░░░░░░░░░ 17
     ✗ No Open Graph tags — links won't preview nicely
     ▲ No twitter:card meta

  A  Content & Accessibility  ████████████████████ 100
     ℹ No <img> elements on the page
     + 2 passing checks

  C  Security  ██████████████░░░░░░ 72
     ▲ Missing Content-Security-Policy header
     ▲ Missing X-Content-Type-Options header
     ... + 3 more

  D  Crawlability  █████████████░░░░░░░ 67
     ▲ No robots.txt found
     ▲ No sitemap.xml found or it is empty

  2 failing · 11 warning · overall grade C
```

## Usage

```bash
# Audit a page (https:// is assumed if you omit the scheme)
lacspace-inspect example.com

# Also check every link's HTTP status (broken / redirected), and show passing checks
lacspace-inspect https://example.com --links --verbose

# Structured JSON for your own tooling
lacspace-inspect https://example.com --json -o report.json

# CI gate: fail the build if the site scores below grade B
lacspace-inspect https://example.com --min-grade B

# A Markdown report (great as a PR comment) or a standalone HTML report
lacspace-inspect https://example.com -f md   -o report.md
lacspace-inspect https://example.com -f html -o report.html

# Performance budgets — fails (non-zero) if any is exceeded
lacspace-inspect https://example.com --budget "html<100kb,scripts<10,images<20,requests<50"

# Baseline / regression gate: save today, fail tomorrow if anything got worse
lacspace-inspect https://example.com --save-baseline base.json
lacspace-inspect https://example.com --baseline base.json

# Crawl-audit a whole site: leaderboard + site-wide issues, gate on the average grade
lacspace-inspect https://example.com --crawl --depth 2 --max 25 --min-grade B

# Batch: audit every URL in a file and print a leaderboard
lacspace-inspect --input urls.txt
```

### Sample Markdown report (`-f md`)

```markdown
## ◆ lacspace-inspect — `D` 68/100

**URL:** https://example.com/
**Audited:** 2026-09-06T17:32:06Z · HTTP 200 · HTTPS · 1 KB · 109 ms

> **2 failing · 14 warning** — overall grade `D`

| Category | Grade | Score |
| --- | :---: | ---: |
| SEO & Meta | `D` | 69 |
| Social / Open Graph | `F` | 17 |
| Structured Data | `F` | 50 |
| Content & Accessibility | `B` | 88 |
| Security | `C` | 70 |

### SEO & Meta `D` — 69/100

- ✗ Missing meta description
  - **Fix:** Add a 50–160 char summary: `<meta name="description" content="One clear sentence about this page.">`.
- ▲ No canonical link
  - **Fix:** Declare the preferred URL: `<link rel="canonical" href="https://example.com/this-page">`.
- ▲ No apple-touch-icon (iOS home-screen icon)
  - **Fix:** Add an iOS home-screen icon: `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` (180×180 PNG).
```

### CI example (GitHub Actions)

```yaml
- name: SEO / quality gate
  run: npx lacspace-inspect https://your-site.com --min-grade B
```

The command exits **non-zero** when the overall grade is below your minimum, so a regression (a dropped `<title>`, broken Open Graph, a new broken link, a missing security header) fails the pipeline.

## Options

| Option | Meaning |
| --- | --- |
| `--links` | Also check each link's HTTP status with a bounded, polite pool; reports broken (≥ 400 / unreachable) and redirected links |
| `--crawl` | Audit a **whole site** — crawl it, print a per-page grade leaderboard, and find site-wide problems |
| `--depth <n>` | Crawl depth from the seed (with `--crawl`, default `2`) |
| `--max <n>` | Max pages to audit (with `--crawl`, default `20`) |
| `-i, --input <file>` | **Batch** — audit every URL in the file (one per line, `#` comments allowed) and print a leaderboard |
| `--budget "<rules>"` | Fail (non-zero) if a **performance budget** is exceeded, e.g. `"html<100kb,scripts<10,images<20,requests<50"` |
| `--save-baseline <file>` | Write the report JSON to reuse later as a baseline |
| `--baseline <file>` | Compare this run to a saved baseline and **fail on any regression** |
| `-f, --format <fmt>` | Output format: `text` (default), `md`, `html`, or `json` |
| `--json` | Shorthand for `-f json` |
| `-m, --min-grade <A-D>` | Exit non-zero if the overall grade — the **site average** with `--crawl` — is below this (CI gate) |
| `-o, --out <file>` | Write the output to a file (format follows `-f` / `--json`) |
| `-v, --verbose` | List passing checks too, not just problems |
| `-V, --version` | Print the version |
| `-h, --help` | Show help |

Every `warn`/`fail` finding carries a concrete **`fix`** — a one-line "change this" with a tiny tag/code example — shown in every format (terminal, Markdown, HTML) and included in `--json`.

## Crawl-audit a whole site

```bash
lacspace-inspect https://example.com --crawl --depth 2 --max 30
```

`--crawl` discovers pages with the lacspace-scraper crawler (same-origin, bounded by `--depth`/`--max`), audits each one, and prints:

- a **leaderboard** of every page by grade + score, and a **site average**;
- the **most common issues** across the site (which fix will move the needle most);
- **site-wide problems** a single-page audit can't see — **duplicate `<title>`** and **duplicate meta descriptions** across pages, and **broken internal links** (internal links that resolve to HTTP ≥ 400, including off-crawl targets which are probed separately).

With `--min-grade`, the gate runs against the **site-average** grade. Add `-f md` for a shareable site report, or `-f json` for the full `SiteReport`.

## Performance budgets

```bash
lacspace-inspect https://example.com --budget "html<100kb,scripts<10,images<20,requests<50,responsetime<600ms"
```

Budgets are reported as their **own category** and the command exits **non-zero** when any is exceeded. Metrics: `html` (bytes — accepts `b`/`kb`/`mb`), `scripts`, `stylesheets`, `images`, `links`, `requests` (an estimate = external scripts + stylesheets + images), and `responsetime` (ms/s). Budgets never change your letter grade — they're a separate pass/fail gate.

## Baseline / regression gate

```bash
# once, on a known-good deploy:
lacspace-inspect https://example.com --save-baseline base.json

# later, in CI:
lacspace-inspect https://example.com --baseline base.json   # exits non-zero on any regression
```

A **regression** is anything that got *worse*: a dropped overall grade/score, a lower category score, or a finding whose status regressed (`ok → warn/fail`, `warn → fail`). Improvements are never flagged. Perfect for catching a dropped `<title>`, a broken Open Graph, a new missing security header — before it ships.

## What each category checks

| Category | Checks |
| --- | --- |
| **SEO & Meta** | `<title>` present + length 10–60, meta description present + length 50–160, canonical link, **canonical host www/non-www consistency**, robots `noindex`, `<html lang>`, mobile viewport, charset + **charset within the first 1024 bytes**, favicon, **apple-touch-icon**, **hreflang** alternates |
| **Social** | Open Graph completeness (`og:title/description/image/url/type`), Twitter card |
| **Structured Data** | JSON-LD present, parses as valid JSON, declares an `@type` |
| **Content & Accessibility** | exactly one `<h1>`, heading hierarchy has no skipped levels, images missing `alt` (count + %), **thin-content word count**, **duplicate `id` check** |
| **Links** | internal vs external counts; with `--links`, live broken/redirected link status |
| **Performance** | HTML byte size, number of external scripts / stylesheets, render-blocking resources in `<head>`, inline script/style counts, **response time**, **gzip/brotli compression**, **image `width`/`height` set**, **`loading="lazy"`** on image-heavy pages |
| **Security** | served over HTTPS, mixed content (http:// subresources on an https page), **http→https redirect**, external `target="_blank"` links with **`rel="noopener"`**, response security headers (CSP, X-Content-Type-Options, X-Frame-Options / `frame-ancestors`, HSTS, Referrer-Policy) |
| **Crawlability** | robots.txt reachable, this URL allowed, sitemap.xml reachable / declared |
| **Budgets** | (with `--budget`) each rule graded pass/fail; never affects the letter grade |
| **Tech Stack** | light detection of WordPress, Next.js, Shopify, React, Vue, etc. — informational, not graded |

## Grading

Each check is a finding — **ok** (1 point), **warn** (½), **fail** (0); `info` findings are shown but never graded. A category's score is the weighted average of its findings; the overall score is the weighted average of the graded categories. Letters: **A** ≥ 90, **B** ≥ 80, **C** ≥ 70, **D** ≥ 60, **F** below.

## Library

```ts
import { inspectUrl, analyzeHtml, gradeOf, formatReport } from "lacspace-inspect";

// Network: fetch + analyze + crawlability (+ live links with { checkLinks: true })
const report = await inspectUrl("https://example.com", { checkLinks: true });
console.log(formatReport(report));
console.log(report.grade, report.score, report.categories);

// Pure: analyze an HTML string you already have — no network
const r = analyzeHtml('<title>Hello</title><h1>Hi</h1>', { url: "https://example.com" });
console.log(r.score, gradeOf(r.score));
```

CommonJS works too: `const { inspectUrl } = require("lacspace-inspect");`

### API

| Export | Signature |
| --- | --- |
| `inspectUrl(url, opts?)` | `Promise<Report>` — fetch + analyze + crawlability (+ broken links with `opts.checkLinks`) |
| `crawlSite(seed, opts?)` | `Promise<SiteReport>` — crawl + audit every page, roll up to a site report |
| `analyzeHtml(html, ctx)` | `Report` — **pure**, no network; `ctx = { url, headers?, status?, responseTimeMs?, contentEncoding?, httpsRedirect? }` |
| `auditPage(html, ctx)` | `PageAudit` — **pure**; a `Report` plus normalized internal/external links + title/desc |
| `analyzeSite(seed, pages, extraStatus?)` | `SiteReport` — **pure** roll-up (leaderboard, duplicates, broken internal links) |
| `parseBudget(spec)` / `evaluateBudget(report, budgets)` | **pure** — parse `"scripts<10,html<100kb"` → rules → a graded `budget` category |
| `diffReports(baseline, current, tolerance?)` | `Regression[]` — **pure** regression diff |
| `formatMarkdown` / `formatHtml` | `string` — **pure** report renderers (`-f md` / `-f html`) |
| `formatSiteReport` / `formatSiteMarkdown` / `formatLeaderboard` / `formatRegressions` | **pure** renderers for crawl/batch/baseline output |
| `attachFixes(findings)` / `fixFor(id)` / `FIXES` | the fix-suggestion engine |
| `gradeOf(score)` | `"A" \| "B" \| "C" \| "D" \| "F"` |
| `formatReport(report, verbose?)` | `string` — the terminal report |
| `scoreFindings`, `makeCategory`, `overallScore` | scoring primitives |
| pure check fns | `seoChecks`, `socialChecks`, `structuredChecks`, `contentChecks`, `linkChecks`, `performanceChecks`, `securityChecks`, `detectTech`, `seoExtraChecks`, `contentExtraChecks`, `performanceExtraChecks`, `securityExtraChecks` |
| types | `Report`, `Category`, `Finding`, `Grade`, `AnalyzeContext`, `InspectOptions`, `CrawlOptions`, `LinkStatus`, `PageAudit`, `SiteReport`, `Budget`, `Regression` |

`InspectOptions`: `{ checkLinks?, timeout?, userAgent?, maxLinks?, concurrency?, probeHttpsRedirect? }`.
`CrawlOptions` extends it with `{ depth?, max?, sameOrigin?, onProgress? }`.

Every function marked **pure** runs with no network — feed it an HTML string (or fixture reports) and unit-test it directly. `Finding` now carries an optional `fix?: string` populated for `warn`/`fail` findings.

## How it works

`inspectUrl` fetches the page once (capturing its response headers for the security checks), then `analyzeHtml` parses the HTML with the zero-dependency lacspace-scraper parser and runs every HTML-derivable check. The network-only categories — crawlability (robots.txt + sitemap) and, with `--links`, the broken-link scan — are added afterwards and the report is re-scored.

## Honest limitations

- **Performance signals are mostly static heuristics** — HTML size, script/stylesheet counts, render-blocking tags, image dimensions. The two live signals (**response time** and **compression**) are a single measurement, not a percentile. This is **not** a Lighthouse/real-browser runtime audit; there are no Core Web Vitals, no JS execution, no layout timing.
- **Compression detection** reads the response `content-encoding` header. A server that transparently strips that header can be misreported; treat it as a hint.
- The **http→https redirect** check is a best-effort single probe of the `http://` origin; a network hiccup shows as info ("not probed"), not a failure. Disable it with `probeHttpsRedirect: false`.
- **`--crawl` is heavy and two-pass**: it discovers URLs with the crawler, then re-fetches each to grade it (so it can capture headers + timing). Keep `--depth`/`--max` modest. Broken-internal-link detection covers links to crawled pages plus a bounded probe of off-crawl internal targets — it is not an exhaustive link crawl.
- It inspects the **server-rendered HTML**. Content injected purely client-side (heavy SPA hydration) may not be visible to the checks — thin-content and image checks can read low on an SPA.
- **Fix suggestions are static, generic templates** keyed by check — accurate guidance, but not tailored to your exact markup.
- Grades are **opinionated defaults** (weights and thresholds baked in) — a great tool for catching regressions and obvious gaps, a starting point rather than the last word.
- The `--links` scan is **bounded and polite** (capped count, small concurrency) — it is a sanity check, not an exhaustive crawler.

## Please audit responsibly

It fetches the page and, with `--links`, a bounded set of its links. Respect each site's Terms and robots policy, and keep volumes modest.

## Licence

Free under the **[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0)**. Part of the [Lacspace developer platform](https://developer.lacspace.com).
