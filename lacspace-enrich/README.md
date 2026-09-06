# lacspace-enrich

**Free, open-source company + contact enrichment.** Give it a **domain, URL or email** and it builds a profile from open sources — **name, description, logo, emails, phones, socials, address and tech stack** — no paid API. Batch a whole list and export to JSON/CSV/Excel. Built on the [lacspace-scraper](https://www.npmjs.com/package/lacspace-scraper) engine.

```bash
npx lacspace-enrich acme.com
```

## What you get

For each input, a profile with:

- **name** & **description** — from OpenGraph, JSON-LD or the page title (cleaned)
- **logo** — from JSON-LD, `og:image` or the favicon
- **emails** & **phones** — scraped from the home page (and `/contact`, `/about` if needed)
- **socials** — Facebook, Instagram, WhatsApp, LinkedIn, X, YouTube, TikTok, Telegram
- **address** — from schema.org `PostalAddress` when present
- **tech stack** — detected platforms/libraries (WordPress, Shopify, Wix, Next.js, Cloudflare, GA…)

It reads **schema.org JSON-LD** heavily (Organization / LocalBusiness) — so structured sites give clean, rich data.

## CLI

```bash
npx lacspace-enrich <domain|url|email> [more…] [options]
```

| Option | Meaning |
| --- | --- |
| `-d, --domain <x>` | A domain, URL or email (repeatable) |
| `--domains <list>` | Comma-separated list |
| `-i, --input <file>` | One domain/email per line from a file |
| `--no-contact-pages` | Don't fetch `/contact` & `/about` for extra emails |
| `--concurrency <n>` | Parallel lookups (default 4) |
| `--timeout <ms>` | Per-request timeout |
| `-f, --format <fmt>` | `json` · `ndjson` · `csv` · `xlsx` (default `json`) |
| `-o, --out <file>` | Output file, or `-` for stdout |

### Examples

```bash
# One company, pretty JSON
npx lacspace-enrich stripe.com

# From an email → its company
npx lacspace-enrich jane@acme.com -f csv

# A whole list into a spreadsheet (socials become columns)
npx lacspace-enrich --input domains.txt -f xlsx -o companies.xlsx
```

CSV/Excel output flattens the profile — `emails`/`phones` joined, each social network its own column, `tech` comma-joined — so it drops straight into a CRM.

## Library

```ts
import { enrichDomain, enrichMany } from "lacspace-enrich";

const profile = await enrichDomain("acme.com");
// { domain, name, description, logo, emails, phones, socials, address, tech, contactPage }

const many = await enrichMany(["a.com", "b.com"], { concurrency: 6 });
```

Pure, unit-tested helpers are exported too: `normalizeDomain`, `cleanName`, `detectTech`, `extractSocials`, `factsFromJsonLd`, `socialKey`, and `flattenProfile` (profile → a flat row).

## Please use it responsibly

`lacspace-enrich` only reads **public business information** a site chooses to publish. Respect each site's Terms and your local data-protection law (GDPR and friends), and use the data lawfully — don't spam.

## Licence

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)**. Part of the [Lacspace developer platform](https://developer.lacspace.com).
