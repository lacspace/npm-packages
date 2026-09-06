# lacspace-leads

**Free, open-source local-business lead finder.** Name a city, area and business type — it drives a real browser over Google Maps and collects each listing's **name, category, rating, reviews, address, phone, website, email and social links**, then exports to **JSON, NDJSON, CSV or Excel**. No API keys, no paid services.

```bash
npx lacspace-leads restaurants --city Kathmandu --area Baneshwor -f xlsx
```

That opens a browser, searches Maps for *"restaurants in Baneshwor, Kathmandu"*, reads the listings, and writes `restaurants-in-baneshwor-kathmandu-YYYY-MM-DD.xlsx`.

## Why it's different

- **Free & keyless** — uses a real browser (via [Playwright](https://playwright.dev)), not a paid Places API.
- **Sweep a whole city** — comma-separate areas and it runs each search, then **merges and de-duplicates** into one list: `--area "Thamel,Baneshwor,Patan"`.
- **Accumulate a master list** — `--append` merges each run into your existing file and de-duplicates, so daily runs build one clean database.
- **Rich enrichment** — visit each website to pull an **email** and links for **Facebook, Instagram, WhatsApp, LinkedIn, X, YouTube, TikTok and Telegram** — a few sites in parallel.
- **Verified emails** — `--verify-emails` checks each address's domain has **MX records** (no message sent) and tags it `valid`/`no-mx`; `--has-valid-email` keeps only deliverable ones.
- **CRM-ready data** — normalise phones to **E.164** (`--country NP` → `+9779…`), and tidy website URLs (unwrap Google redirects, strip `utm_*`/`fbclid`).
- **Any format** — JSON, NDJSON, CSV or Excel; write to a file or pipe to `stdout` with `-o -`.
- **Pick your fields** — choose exactly what you collect, or a ready-made **preset** (`--preset outreach`).
- **Sort & filter** — `--sort reviews --desc`, `--min-rating`, `--has-valid-email`, and more.
- **Robust & polite** — `--proxy`, `--retries`, `--jitter`, per-listing delays and a permission-first prompt before it opens a browser.
- **Library too** — `import { searchLeads, searchLeadsBatch, searchLeadsDetailed } from "lacspace-leads"`.

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
| `-t, --type <text>` | Business type / keyword, e.g. `"dental clinic"`. Comma-separate for several. |
| `--city <text>` | City, e.g. `Kathmandu`. Comma-separate for several. |
| `--area <text>` | Area / neighbourhood, e.g. `Baneshwor`. Comma-separate to **sweep a whole city**. |
| `-q, --query <text>` | Raw query, used verbatim (overrides city/area/type) |
| `--fields <list>` | Columns: `name,category,rating,reviews,priceLevel,address,phone,website,email,facebook,instagram,whatsapp,linkedin,twitter,youtube,tiktok,telegram,emailStatus,plusCode,latitude,longitude,hours,mapsUrl` |
| `--preset <name>` | Field bundle: `minimal` · `outreach` · `contact` · `geo` · `full` · `everything` |
| `-f, --format <fmt>` | `json` · `ndjson` · `csv` · `xlsx` (default `json`) |
| `-o, --out <file>` | Output file, or `-` for **stdout** (default: a slug + date) |
| `--append` | Merge into an existing output file — **accumulate + dedupe** across runs |
| `--sheet <name>` | Excel sheet name (default `Leads`) |
| `-n, --limit <n>` | Max listings **per search** (default `60`) |
| `--total <n>` | Cap the merged result when sweeping several searches |
| `--no-details` | Skip opening each listing — names + Maps URLs only, much faster |
| `--sort <key>` | `rating` · `reviews` · `name` · `priceLevel` (missing values last) |
| `--desc` / `--asc` | Sort direction (default: `desc` for numbers, `asc` for name) |
| `--delay <ms>` | Pause between listings (default `700`) |
| `--jitter` | Randomise the delay ±40% (more human) |
| `--retries <n>` | Retry a listing that fails to open (default `1`) |
| `--max-time <s>` | Stop collecting after n seconds |
| `--proxy <url>` | Route the browser via a proxy (`http://user:pass@host:port`) |
| `--lang <locale>` | Browser locale, e.g. `en-US`, `ne-NP` (default `en-US`) |
| `--region <cc>` | Region bias for results, e.g. `np`, `us` |
| `--headless` | Run the browser without a visible window |
| `-y, --yes` | Skip prompts and the browser-open confirmation |

**Enrichment** (visits each business website — slower, opt-in):

| Option | Meaning |
| --- | --- |
| `--emails` | Also find an email from each website |
| `--socials` | Also find Facebook / Instagram / WhatsApp / LinkedIn / X / YouTube / TikTok / Telegram |
| `--enrich` | Both of the above |
| `--verify-emails` | Check each email domain has **MX records** (implies `--emails`); adds an `emailStatus` column |
| `--concurrency <n>` | How many websites to enrich in parallel (default `3`) |

**Clean-up** (data quality):

| Option | Meaning |
| --- | --- |
| `--country <c>` | Normalise phones to **E.164** for this country — an ISO-2 code (`NP`, `US`) or a calling code (`977`) |
| `--no-clean-urls` | Don't tidy website URLs (by default it unwraps Google redirects and strips tracking params) |

**Filters** (drop leads that don't qualify):

| Option | Meaning |
| --- | --- |
| `--min-rating <n>` | Keep only ratings ≥ n |
| `--min-reviews <n>` | Keep only ≥ n reviews |
| `--has-phone` | Only leads with a phone |
| `--has-website` | Only leads with a website |
| `--has-email` | Only leads with an email (implies `--emails`) |
| `--has-valid-email` | Only leads whose email passed **MX verification** (implies `--verify-emails`) |
| `--dedupe <key>` | `website` · `phone` · `name` · `smart` · `none` (default `website`; `--append` uses `smart` = website→phone→name) |

Run with no arguments for an interactive walkthrough.

## Sweep a whole city

Comma-separate areas (and/or types) and `lacspace-leads` runs each search in turn, then **merges and de-duplicates** into a single list — sorted and filtered across the whole set:

```bash
# Every coffee shop across three neighbourhoods, phones as +977…, best-reviewed first
npx lacspace-leads "coffee shop" \
  --city Kathmandu --area "Thamel,Baneshwor,Patan" \
  --country NP --sort reviews --desc -f xlsx

# Two business types at once, capped at 100 unique leads total
npx lacspace-leads --type "gym,fitness studio" --city Pokhara --total 100 -f csv
```

## Field presets

Skip spelling out `--fields` with a ready-made bundle:

| Preset | Columns |
| --- | --- |
| `minimal` | name, phone, website |
| `outreach` | name, phone, email, website, address |
| `contact` | name, phone, email, website, facebook, instagram, whatsapp |
| `geo` | name, address, latitude, longitude, plusCode, mapsUrl |
| `full` | everything Maps shows (no website enrichment) |
| `everything` | every field, including enriched ones |

```bash
npx lacspace-leads salons --city Pokhara --preset outreach --country NP -f csv
```

## Verify emails & build a master list

Chase down deliverable contacts and accumulate them over time:

```bash
# Only businesses with an MX-verified email, as CSV
npx lacspace-leads dentists --city Pokhara --verify-emails --has-valid-email -f csv

# Run this daily — each run merges into master.csv and de-duplicates (smart key)
npx lacspace-leads cafes --city Kathmandu --area "Thamel,Baneshwor,Patan" \
  -o master.csv --append
```

`--verify-emails` does a DNS **MX lookup** on each email's domain (no message is sent) and adds an `emailStatus` column of `valid` · `no-mx` · `invalid-format`. `--append` reads the existing file back, merges, and de-duplicates with the **`smart`** key (website → phone → name) so even website-less businesses don't pile up on re-runs.

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

Sweep several areas and merge them yourself:

```ts
import { searchLeadsBatch } from "lacspace-leads";

const leads = await searchLeadsBatch(
  [
    { type: "coffee shop", city: "Kathmandu", area: "Thamel" },
    { type: "coffee shop", city: "Kathmandu", area: "Baneshwor" },
  ],
  { limit: 40, country: "NP", sort: "reviews", enrich: true, headless: true },
);
// → one de-duplicated, sorted, E.164-normalised list
```

| Export | Purpose |
| --- | --- |
| `searchLeads(options)` | Run one search, resolve to `Lead[]`. |
| `searchLeadsDetailed(options)` | Same, plus aggregate `stats` and `elapsedMs`. |
| `searchLeadsBatch(queries, options)` | Run several searches and merge/dedupe/sort into one `Lead[]`. |
| `searchLeadsMulti(options)` | Expand comma-separated `type`/`city`/`area` and run as a batch. |
| `serialize(leads, format, fields?)` | Serialize to `{ data, binary }` for `json` / `ndjson` / `csv` / `xlsx`. |
| `computeStats(leads)` | Aggregate counts (`withPhone`, `withValidEmail`, `avgRating` …). |
| `verifyEmails(leads)` / `verifyEmail(email)` | MX-verify emails; also `emailFormatValid` / `emailDomain`. |
| `rowsToLeads(rows)` | Turn read-back rows (CSV/Excel/JSON) into `Lead[]` — powers `--append`. |
| `toRows(leads, fields?)` | Header-keyed rows, for your own exporter. |
| `enrichContacts(website)` / `extractEmails` / `extractSocials` | Website enrichment, on tap. |
| `cleanWebsite` / `normalizePhone` / `sortLeads` | Pure data-cleaning helpers (unit-tested). |
| `filterLeads` / `dedupeLeads` | Pure post-processing over any `Lead[]`. |
| `expandQueries` / `resolvePreset` / `FIELD_PRESETS` | Batch expansion + field presets. |
| `composeQuery` / `mapsSearchUrl` / `normalizeFields` / `defaultFilename` | Query + helper utilities. |

The `onProgress` and `onLead` callbacks stream progress and each lead as it's found — handy for live UIs or crash-safe writing. Everything is fully typed (`Lead`, `LeadField`, `SearchOptions`, `LeadStats`, `EmailStatus`, `SortKey`, `OutputFormat`, `Contacts` …) and ships dual **ESM + CJS**.

## Please use it responsibly

Automated scraping of Google Maps is **against Google's Terms of Service**, and heavy use can trigger CAPTCHAs or temporary blocks. This tool is meant for **small, human-scale** collection of **public business information**. You are responsible for how you use it: keep volumes modest, add delays, respect local data-protection law (and don't collect or contact people in ways that break it), and don't resell scraped data as your own. If you need high volume or guaranteed reliability, use the official Google Places API.

## Licence

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)** — permissive freedoms, personal and commercial use.

Part of the [Lacspace developer platform](https://developer.lacspace.com).
