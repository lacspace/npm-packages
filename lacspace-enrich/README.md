# lacspace-enrich

**Free, open-source company + contact enrichment.** Give it a **domain, URL or email** and it builds a profile from open sources — **name, description, logo, emails, phones, socials, address and tech stack** — no paid API. **v0.2** adds **DNS/deliverability signals** (MX, SPF, DMARC, DKIM), **domain registration via RDAP**, **email-pattern guessing**, **categorized tech detection with confidence + versions**, and **key-page discovery** (contact/about/careers/pricing/blog/status). Batch a whole list and export to JSON/CSV/Excel. Built on the [lacspace-scraper](https://www.npmjs.com/package/lacspace-scraper) engine.

```bash
npx lacspace-enrich acme.com --dns --rdap -v
```

## What you get

For each input, a profile with:

- **name** & **description** — from OpenGraph, JSON-LD or the page title (cleaned)
- **logo** — from JSON-LD, `og:image` or the favicon
- **emails** & **phones** — scraped from the home page (and `/contact`, `/about` if needed)
- **socials** — Facebook, Instagram, WhatsApp, LinkedIn, X, YouTube, TikTok, Telegram
- **address** — from schema.org `PostalAddress` when present
- **tech stack** — detected platforms/libraries (WordPress, Shopify, Wix, Next.js, Cloudflare, GA…)
- **pages** *(v0.2)* — discovered contact / about / careers / pricing / blog / rss / status URLs
- **dns** *(v0.2, `--dns`)* — MX + mail provider, SPF policy, DMARC policy, DKIM presence, catch-all hint, plus **MX-verification** of every email found
- **registration** *(v0.2, `--rdap`)* — registrar, created/updated/expiry dates, nameservers, status (open, keyless RDAP)
- **techDetailed** *(v0.2)* — the same detections **categorized** (cms/framework/analytics/ads/cdn/ecommerce/payment/hosting/fonts/tag-manager/…), each with a **confidence**, the **matching signal** and a **version** where visible
- **sources** *(v0.2, `-v`)* — per-field confidence + where each value came from

It reads **schema.org JSON-LD** heavily (Organization / LocalBusiness) — so structured sites give clean, rich data. Everything new is **additive**: old fields, flags and exports are unchanged.

## CLI

```bash
npx lacspace-enrich <domain|url|email> [more…] [options]
npx lacspace-enrich guess "<Full Name>" <domain> [options]
```

| Option | Meaning |
| --- | --- |
| `-d, --domain <x>` | A domain, URL or email (repeatable) |
| `--domains <list>` | Comma-separated list |
| `-i, --input <file>` | One domain/email per line from a file |
| `--no-contact-pages` | Don't fetch `/contact` & `/about` for extra emails |
| `--no-pages` | Skip key-page discovery |
| `--dns` | Add DNS/deliverability signals (MX, SPF, DMARC, DKIM) + MX-verify emails |
| `--rdap` | Add domain registration via RDAP (registrar, dates, nameservers) |
| `--assets <dir>` | Download each site's logo + favicon into `<dir>` |
| `--concurrency <n>` | Parallel lookups (default 4) |
| `--timeout <ms>` | Per-request timeout |
| `--rate <ms>` | Minimum gap between requests to the **same host** (rate limit) |
| `--resume` | Skip domains already present in the `--out` file, append the rest |
| `--fields <a,b,c>` | Keep only these columns in `csv`/`xlsx` (in this order) |
| `-v, --verbose` | Print per-field confidence + source notes |
| `-f, --format <fmt>` | `json` · `ndjson` · `csv` · `xlsx` (default `json`) |
| `-o, --out <file>` | Output file, or `-` for stdout |

### Examples

```bash
# One company, pretty JSON
npx lacspace-enrich stripe.com

# Full picture: deliverability + registration + provenance
npx lacspace-enrich acme.com --dns --rdap -v

# From an email → its company
npx lacspace-enrich jane@acme.com -f csv

# A whole list into a spreadsheet (socials + new columns become columns)
npx lacspace-enrich --input domains.txt --dns -f xlsx -o companies.xlsx

# Resumable, polite batch (skip done, throttle per host, pick columns)
npx lacspace-enrich --input domains.txt --resume --rate 800 \
  --fields domain,name,mailProvider,validEmails,registrar -f csv -o enriched.csv

# Save logos + favicons to a folder
npx lacspace-enrich acme.com --assets ./logos

# Guess a person's likely email; a known colleague reveals the org pattern
npx lacspace-enrich guess "Jane Doe" acme.com --known "Bob Smith:bsmith@acme.com"
```

CSV/Excel output flattens the profile — `emails`/`phones` joined, each social network its own column, `tech` comma-joined. **v0.2** adds columns **only when the data is present** (`hasMx`, `mailProvider`, `spf`, `dmarc`, `dkim`, `validEmails`, `registrar`, `created`, `expires`, `nameServers`, `page_*`, `techCategories`, `savedLogo`/`savedFavicon`), so existing (feature-off) output is unchanged. Use `--fields` to pick exactly the columns your CRM wants.

## Library

```ts
import { enrichDomain, enrichMany } from "lacspace-enrich";

const profile = await enrichDomain("acme.com", { dns: true, rdap: true });
// { domain, name, description, logo, emails, phones, socials, address, tech, contactPage,
//   dns, emailStatus, registration, techDetailed, pages, sources }

const many = await enrichMany(["a.com", "b.com"], { concurrency: 6, perHostRateMs: 500 });
```

New building blocks are exported and unit-tested — most are **pure**:

```ts
import {
  guessEmails, detectPatternFromEmail, splitName,   // email-pattern guessing (pure)
  detectTechDetailed, groupTechByCategory,          // categorized tech (pure)
  discoverPages,                                     // key-page discovery (pure)
  parseSpf, parseDmarc, mailProviderFromMx,          // DNS record parsers (pure)
  dnsSignals, verifyEmailDomains,                    // DNS lookups (Node-only)
  parseRdap, rdapLookup,                             // RDAP (parser pure, lookup network)
  downloadAsset,                                      // save logo/favicon
} from "lacspace-enrich";

guessEmails("Jane Doe", "acme.com", { knownContact: { name: "Bob Smith", email: "bsmith@acme.com" } });
// → [{ email: "jdoe@acme.com", pattern: "flast", confidence: 1 }, …]
```

The classic pure helpers are still here too: `normalizeDomain`, `cleanName`, `detectTech`, `extractSocials`, `factsFromJsonLd`, `socialKey`, `flattenProfile`, plus `selectFields`.

## Honest limitations

- **DNS/RDAP need Node** (they use `node:dns` and `fetch`); they're skipped/return an honest fallback in the browser.
- **RDAP coverage varies** — some TLDs/registries don't expose full data; on any failure `registration.source` is `"unavailable"` with a note, never a fake value.
- **Catch-all is a hint, not proof.** True catch-all detection needs live SMTP probing, which this tool deliberately does **not** do. `dns.catchAllLikely` is inferred from a permissive SPF / forwarder only.
- **MX-verification** checks the domain accepts mail (has MX) — it does **not** confirm a specific mailbox exists; no message is ever sent.
- **Email guesses are guesses.** They're ranked permutations of a name; verify before you send. A known colleague's address raises confidence but isn't a guarantee.
- **Tech detection** reads the delivered HTML only (no JS execution), so client-rendered signals can be missed; confidences are rough heuristics.

## Please use it responsibly

`lacspace-enrich` only reads **public business information** a site chooses to publish, and public DNS/RDAP records. Respect each site's Terms and your local data-protection law (GDPR and friends), and use the data lawfully — don't spam.

## Licence

Free under the **[Lacspace Free Licence](https://developer.lacspace.com/licenses/lacspace-free-1.0)**. Part of the [Lacspace developer platform](https://developer.lacspace.com).
