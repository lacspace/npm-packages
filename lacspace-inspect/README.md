# lacspace-inspect

**One-command website audit.** Point it at a URL and get a clean, graded report on **SEO & meta**, **Open Graph / Twitter**, **JSON-LD structured data**, **content & accessibility** (one `<h1>`, heading order, image `alt`), **links** (internal / external / broken), **static performance signals**, **security** (HTTPS, mixed content, response security headers) and **crawlability** (robots.txt + sitemap) — plus a light **tech-stack** sniff. Every category is scored, everything rolls up to an overall **grade A–F**, and there's a **CI gate** that fails your build below a minimum grade. No API keys. Built on the [lacspace-scraper](https://www.npmjs.com/package/lacspace-scraper) engine.

```bash
npx lacspace-inspect https://example.com
```

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
| `--json` | Output the structured `Report` as JSON (to stdout, or a file with `-o`) |
| `-m, --min-grade <A-D>` | Exit non-zero if the overall grade is below this (CI gate) |
| `-o, --out <file>` | Write the report to a file (JSON with `--json`, otherwise plain text) |
| `-v, --verbose` | List passing checks too, not just problems |
| `-V, --version` | Print the version |
| `-h, --help` | Show help |

## What each category checks

| Category | Checks |
| --- | --- |
| **SEO & Meta** | `<title>` present + length 10–60, meta description present + length 50–160, canonical link, robots `noindex`, `<html lang>`, mobile viewport, charset, favicon |
| **Social** | Open Graph completeness (`og:title/description/image/url/type`), Twitter card |
| **Structured Data** | JSON-LD present, parses as valid JSON, declares an `@type` |
| **Content & Accessibility** | exactly one `<h1>`, heading hierarchy has no skipped levels, images missing `alt` (count + %) |
| **Links** | internal vs external counts; with `--links`, live broken/redirected link status |
| **Performance (static)** | HTML byte size, number of external scripts / stylesheets, render-blocking resources in `<head>`, inline script/style counts |
| **Security** | served over HTTPS, mixed content (http:// subresources on an https page), response security headers (CSP, X-Content-Type-Options, X-Frame-Options / `frame-ancestors`, HSTS, Referrer-Policy) |
| **Crawlability** | robots.txt reachable, this URL allowed, sitemap.xml reachable / declared |
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
| `analyzeHtml(html, ctx)` | `Report` — **pure**, no network; `ctx = { url, headers?, status? }` |
| `gradeOf(score)` | `"A" \| "B" \| "C" \| "D" \| "F"` |
| `formatReport(report, verbose?)` | `string` — the terminal report |
| `scoreFindings`, `makeCategory`, `overallScore` | scoring primitives |
| pure check fns | `seoChecks`, `socialChecks`, `structuredChecks`, `contentChecks`, `linkChecks`, `performanceChecks`, `securityChecks`, `detectTech` |
| types | `Report`, `Category`, `Finding`, `Grade`, `AnalyzeContext`, `InspectOptions`, `LinkStatus` |

`InspectOptions`: `{ checkLinks?, timeout?, userAgent?, maxLinks?, concurrency? }`.

## How it works

`inspectUrl` fetches the page once (capturing its response headers for the security checks), then `analyzeHtml` parses the HTML with the zero-dependency lacspace-scraper parser and runs every HTML-derivable check. The network-only categories — crawlability (robots.txt + sitemap) and, with `--links`, the broken-link scan — are added afterwards and the report is re-scored.

## Honest limitations

- **Performance signals are static heuristics** — HTML size, script/stylesheet counts, render-blocking tags. This is **not** a Lighthouse/real-browser runtime audit; there are no Core Web Vitals, no JS execution, no layout timing.
- It inspects the **server-rendered HTML**. Content injected purely client-side (heavy SPA hydration) may not be visible to the checks.
- Grades are **opinionated defaults** (weights and thresholds baked in) — a great tool for catching regressions and obvious gaps, a starting point rather than the last word.
- The `--links` scan is **bounded and polite** (capped count, small concurrency) — it is a sanity check, not an exhaustive crawler.

## Please audit responsibly

It fetches the page and, with `--links`, a bounded set of its links. Respect each site's Terms and robots policy, and keep volumes modest.

## Licence

Free under the **[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0)**. Part of the [Lacspace developer platform](https://developer.lacspace.com).
