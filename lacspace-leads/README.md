# lacspace-leads

**Free, open-source local-business lead finder.** Name a city, area and business type — it drives a real browser over Google Maps and collects each listing's **name, category, rating, reviews, address, phone, website** and more, then exports to **JSON, CSV or Excel**. No API keys, no paid services.

```bash
npx lacspace-leads restaurants --city Kathmandu --area Baneshwor -f xlsx
```

That opens a browser, searches Maps for *"restaurants in Baneshwor, Kathmandu"*, reads the listings, and writes `restaurants-in-baneshwor-kathmandu-YYYY-MM-DD.xlsx`.

## Why it's different

- **Free & keyless** — uses a real browser (via [Playwright](https://playwright.dev)), not a paid Places API.
- **Any format** — JSON, CSV or Excel out of the box (Excel/CSV via `@lacspace/xlsx` + `@lacspace/csv`).
- **Pick your fields** — only collect what you need.
- **Permission-first** — it tells you what it's about to do and asks before opening a browser.
- **Library too** — `import { searchLeads } from "lacspace-leads"`.

## Install

Needs **Node 20+** and a Chromium-based browser. It uses your installed **Google Chrome** or **Microsoft Edge** automatically; if you have neither, run:

```bash
npx playwright install chromium
```

## CLI

```bash
npx lacspace-leads [type] [options]
```

| Option | Meaning |
| --- | --- |
| `-t, --type <text>` | Business type / keyword, e.g. `"dental clinic"` |
| `--city <text>` | City, e.g. `Kathmandu` |
| `--area <text>` | Area / neighbourhood, e.g. `Baneshwor` |
| `-q, --query <text>` | Raw query, used verbatim (overrides city/area/type) |
| `--fields <list>` | Columns: `name,category,rating,reviews,priceLevel,address,phone,website,email,facebook,instagram,whatsapp,plusCode,latitude,longitude,hours,mapsUrl` |
| `-f, --format <fmt>` | `json` · `csv` · `xlsx` (default `json`) |
| `-o, --out <file>` | Output file (default: a slug + date) |
| `--sheet <name>` | Excel sheet name (default `Leads`) |
| `-n, --limit <n>` | Max listings to collect (default `60`) |
| `--no-details` | Skip opening each listing — names + Maps URLs only, much faster |
| `--delay <ms>` | Pause between listings (default `700`) |
| `--max-time <s>` | Stop collecting after n seconds |
| `--headless` | Run the browser without a visible window |
| `-y, --yes` | Skip prompts and the browser-open confirmation |

**Enrichment** (visits each business website — slower, opt-in):

| Option | Meaning |
| --- | --- |
| `--emails` | Also find an email from each website |
| `--socials` | Also find Facebook / Instagram / WhatsApp |
| `--enrich` | Both of the above |

**Filters** (drop leads that don't qualify):

| Option | Meaning |
| --- | --- |
| `--min-rating <n>` | Keep only ratings ≥ n |
| `--min-reviews <n>` | Keep only ≥ n reviews |
| `--has-phone` | Only leads with a phone |
| `--has-website` | Only leads with a website |
| `--has-email` | Only leads with an email (implies `--emails`) |
| `--dedupe <key>` | `website` · `phone` · `name` · `none` (default `website`) |

Run with no arguments for an interactive walkthrough.

## Convert anything (JSON ↔ CSV ↔ Excel)

A general converter is built in — it works on any tabular file, not just leads:

```bash
npx lacspace-leads convert leads.json -f xlsx        # JSON → Excel
npx lacspace-leads convert data.csv  -o data.json    # CSV → JSON
npx lacspace-leads convert sheet.xlsx -f csv         # Excel → CSV
```

Programmatically: `convertFile(input, { format, out, sheetName })`, or `readRows(file)` + `serializeRows(rows, format)`.

### Examples

```bash
# Excel of restaurants in a specific area
npx lacspace-leads restaurants --city Kathmandu --area Baneshwor -f xlsx

# Just the essentials for outreach, as CSV
npx lacspace-leads --type "dental clinic" --city Pokhara --fields name,phone,website -f csv -n 40

# Fast name + URL sweep, no per-listing opening
npx lacspace-leads gyms --city Lalitpur --no-details -n 100
```

## Library

```ts
import { searchLeads, serialize } from "lacspace-leads";
import { writeFileSync } from "node:fs";

const leads = await searchLeads({
  city: "Kathmandu",
  area: "Baneshwor",
  type: "restaurants",
  fields: ["name", "phone", "website", "rating"],
  limit: 40,
  headless: true,
  onProgress: (m) => console.log(m),
});

const { data, binary } = serialize(leads, "xlsx");
writeFileSync("leads.xlsx", binary ? Buffer.from(data as Uint8Array) : data);
```

| Export | Purpose |
| --- | --- |
| `searchLeads(options)` | Run the search, resolve to `Lead[]`. |
| `serialize(leads, format, fields?)` | Serialize to `{ data, binary }` for `json` / `csv` / `xlsx`. |
| `toRows(leads, fields?)` | Header-keyed rows, for your own exporter. |
| `composeQuery` / `mapsSearchUrl` / `normalizeFields` / `defaultFilename` | Query + helper utilities. |

## Please use it responsibly

Automated scraping of Google Maps is **against Google's Terms of Service**, and heavy use can trigger CAPTCHAs or temporary blocks. This tool is meant for **small, human-scale** collection of **public business information**. You are responsible for how you use it: keep volumes modest, add delays, respect local data-protection law (and don't collect or contact people in ways that break it), and don't resell scraped data as your own. If you need high volume or guaranteed reliability, use the official Google Places API.

## Licence

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms, personal and commercial use.

Part of the [Lacspace developer platform](https://developer.lacspace.com).
