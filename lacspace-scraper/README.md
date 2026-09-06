# lacspace-scraper

**Free, open-source website scraper.** Point it at any page (or a list of sources) and pull structured data — by **CSS selectors** or **auto-detection**. Crawl a whole site, render JS-heavy pages in a real browser, and export to **JSON, NDJSON, CSV or Excel**. No API keys, robots-aware by default.

```bash
npx lacspace-scraper https://example.com --auto -f json
```

## Why it's different

- **Two ways to extract** — a precise **CSS-selector schema**, or **auto-detect** (title, meta, headings, links, images, emails, phones, tables, JSON-LD, OpenGraph, feeds, readable text).
- **Lists & cards** — `--item ".product"` yields **one record per repeating element**, not one blob per page.
- **Static or browser** — a fast zero-dependency HTTP+parser engine by default, or a **real browser** (`--browser`, via Playwright) for JavaScript-rendered sites.
- **Crawl a site** — follow links breadth-first with depth/page limits, seed from a **sitemap**, stay same-origin, include/exclude by pattern.
- **Polite by default** — respects **robots.txt**, with delay, jitter, retries, concurrency and a custom User-Agent all under your control.
- **Any format** — JSON, NDJSON, CSV or Excel; write to a file or pipe to `stdout`.
- **Library too** — a full typed API, plus a standalone zero-dependency **HTML parser + CSS-selector engine** you can use on your own.

## Install

Needs **Node 20+**. The default engine is pure Node (no browser). For `--browser` mode, install Playwright's browser once:

```bash
npx playwright install chromium   # only needed for --browser
```

## CLI

```bash
npx lacspace-scraper <url...> [options]       # scrape one or more pages
npx lacspace-scraper crawl <url> [options]    # follow links across a site
npx lacspace-scraper convert <file> [options] # JSON ↔ NDJSON ↔ CSV ↔ Excel
```

### Extraction

| Option | Meaning |
| --- | --- |
| `-s, --schema <json\|file>` | A CSS-selector schema as inline JSON or a `.json` file |
| `--field <name=sel>` | Add one field. `sel` may end `@attr` (read an attribute) and `[]` (collect all) — e.g. `--field "links=a@href[]"` |
| `--item <selector>` | Treat each match as a record (product cards, list rows, search results) |
| `--auto [list]` | Auto-detect. Bare = metadata, headings, links, images, OpenGraph, JSON-LD. Or pick: `metadata,headings,links,images,emails,phones,openGraph,jsonLd,feeds,text,tables` |

### Engine & network

| Option | Meaning |
| --- | --- |
| `--browser` | Render with a real browser (JS-heavy sites; needs `playwright-core`) |
| `--wait-for <selector>` | Browser: wait for this selector before extracting |
| `--user-agent <ua>` / `--headers <json>` | Identify your bot / send extra headers |
| `--timeout <ms>` / `--retries <n>` | Per-request timeout (15000) and retries (1) |
| `--delay <ms>` / `--jitter` | Pause between requests, optionally randomised ±40% |
| `--concurrency <n>` | Parallel requests (default 4) |
| `--proxy <url>` | Route the browser through a proxy |
| `--no-robots` | Do **not** respect robots.txt (respected by default) |

### Crawl (subcommand)

| Option | Meaning |
| --- | --- |
| `--depth <n>` | Link depth from the seed (default 2) |
| `-n, --limit <n>` | Max pages to fetch (default 50) |
| `--sitemap <url>` | Seed the crawl from a `sitemap.xml` (or sitemap index) |
| `--all-origins` | Follow off-site links (default: same origin only) |
| `--include <list>` / `--exclude <list>` | Keep / skip URLs containing these substrings |
| `--link-selector <sel>` | Which links to follow (default `a[href]`) |

### Output

| Option | Meaning |
| --- | --- |
| `-f, --format <fmt>` | `json` · `ndjson` · `csv` · `xlsx` (default `json`) |
| `-o, --out <file>` | Output file, or `-` for **stdout** (default: a host + date slug) |
| `--sheet <name>` | Excel sheet name |
| `--urls <file>` | Read URLs to scrape from a file (one per line) |

## The schema

A schema maps a field name to a **CSS selector** (shorthand for the element's text) or a full spec:

```jsonc
{
  "title":  "h1",                                   // text of the first <h1>
  "price":  { "selector": ".price", "attr": "text" },
  "image":  { "selector": "img", "attr": "@src" },  // an attribute (absolutised)
  "links":  { "selector": "a", "attr": "@href", "all": true }, // every match → array
  "body":   { "selector": "article", "attr": "html" }          // inner HTML
}
```

`attr` can be `"text"` (default), `"html"`, `"outerHtml"`, `@attribute` (or a bare attribute name). URL attributes (`href`, `src`, …) are resolved to absolute URLs against the page.

**Repeating items.** Give `--item` a container selector and the schema is applied to **each** match:

```bash
npx lacspace-scraper https://shop.site \
  --item ".product-card" \
  --field "name=h3" --field "price=.price" --field "url=a@href" \
  -f csv
```

## Recipes

```bash
# Everything a page exposes, as JSON
npx lacspace-scraper https://example.com --auto -f json

# Scrape a product grid into a spreadsheet
npx lacspace-scraper https://books.toscrape.com \
  --item "article.product_pod" --field "title=h3 a@title" --field "price=.price_color" -f xlsx

# Crawl a docs site (2 levels, 40 pages), keep title + readable text, as NDJSON
npx lacspace-scraper crawl https://docs.site --depth 2 --limit 40 --auto metadata,text -f ndjson

# Seed a crawl from the sitemap and pull metadata
npx lacspace-scraper crawl https://blog.site --sitemap https://blog.site/sitemap.xml --auto metadata -f csv

# A JavaScript-rendered app — wait for content, then extract
npx lacspace-scraper https://app.site --browser --wait-for ".loaded" --auto

# Many URLs from a file, four at a time, politely
npx lacspace-scraper --urls urls.txt --delay 500 --jitter --auto metadata -f csv

# Pipe JSON straight into jq (data on stdout, logs on stderr)
npx lacspace-scraper https://news.site --item article --field "t=h2" -f json -o - | jq '.[].t'
```

## Convert any data format

The same built-in converter reads and writes **JSON · NDJSON · CSV · Excel**, in any direction:

```bash
npx lacspace-scraper convert scrape.json -f xlsx     # JSON  → Excel
npx lacspace-scraper convert data.csv    -o data.ndjson
npx lacspace-scraper convert sheet.xlsx  -f csv      # Excel → CSV
```

## Library

```ts
import { scrape, crawl, serializeRows } from "lacspace-scraper";
import { writeFileSync } from "node:fs";

// Schema + auto, in one call
const { records, errors } = await scrape("https://example.com", {
  schema: { title: "h1", links: { selector: "a", attr: "@href", all: true } },
  auto: ["metadata"],            // also attach page metadata
});

const { data, binary } = serializeRows(records, "xlsx");
writeFileSync("out.xlsx", binary ? Buffer.from(data as Uint8Array) : data);

// Crawl a whole site
const site = await crawl("https://docs.site", { depth: 2, limit: 50, auto: ["metadata", "text"] });
```

The **HTML parser and CSS-selector engine are exported too** — use them on any HTML string, no network needed:

```ts
import { parseHTML, queryAll, applySchemaItems } from "lacspace-scraper";

const root = parseHTML(html);
const prices = queryAll(root, ".product .price").map((el) => el.attrs);
const rows = applySchemaItems(root, ".product", { name: "h3", price: ".price" });
```

| Export | Purpose |
| --- | --- |
| `scrape(urls, options)` | Scrape one/many URLs → `{ records, errors, pages, elapsedMs }` |
| `crawl(seed, options)` | Follow links across a site with the same extraction rules |
| `parseHTML` / `queryAll` / `queryOne` | Zero-dependency HTML parser + CSS-selector engine |
| `applySchema` / `applySchemaItems` / `autoExtract` | Extraction primitives over a parsed tree |
| `extractLinks` / `extractEmails` / `extractTables` / `extractJsonLd` … | Individual auto-extractors |
| `fetchPage` / `fetchRobots` / `parseRobots` / `fetchSitemap` | Fetch, robots and sitemap helpers |
| `serializeRows` / `readRows` / `convertFile` | JSON / NDJSON / CSV / Excel I/O |

Everything is fully typed (`Schema`, `FieldSpec`, `ScrapeOptions`, `CrawlOptions`, `ScrapeResult`, `AutoData` …) and ships dual **ESM + CJS**.

## Please scrape responsibly

Scraping can violate a site's Terms of Service and, for personal data, data-protection law. `lacspace-scraper` **respects robots.txt by default** and lets you set delays and a truthful User-Agent — please keep it that way. Scrape public data you have a lawful basis to use, keep volumes modest, and don't hammer servers or resell others' content as your own. You are responsible for how you use it.

## Licence

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive, personal and commercial use.

Part of the [Lacspace developer platform](https://developer.lacspace.com).
