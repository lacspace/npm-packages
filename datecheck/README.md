# @lacspace/datecheck

**Tell how old an article really is — and never republish a 2019 story as today's news.** Extract the published/modified date from HTML (JSON-LD, meta tags, `<time>`, URL patterns, bylines), including **Nepali Bikram Sambat** dates, detect body-text staleness, and return a `fresh | stale | unknown` verdict. Deterministic, **fail-closed**, zero third-party dependencies. AI only through an optional injected hook.

```bash
npm i @lacspace/datecheck
```

```ts
import { extractPublishedDate, assessFreshness, bsToAd } from "@lacspace/datecheck";

// 1) What date does this page claim?
const { publishedAt, source, confidence } = extractPublishedDate(html, url);
// → { publishedAt: 2019-09-10, source: "jsonld", confidence: 0.95, ... }

// 2) Is it fresh enough to publish?
assessFreshness({ html, text, url, feedDate, now: new Date(), maxAgeHours: 48 }).verdict;
// → "stale"  (old page date)   |  "fresh"  |  "unknown"  (no date, no signal — NOT assumed fresh)

// 3) Bikram Sambat ↔ Gregorian
bsToAd(2083, 6, 16); // → 2026-10-02 (AD)
```

## Why

A news engine treated an undated page as "now" and pushed a 2019 iPhone-11 story as breaking news. The root cause: *no date → assume fresh.* `datecheck` fixes that by being **fail-closed** — an article with no parseable date anywhere and no staleness signal is `unknown`, never silently `fresh`.

## API

### `extractPublishedDate(html, url?, { now?, lang? })` → `ExtractedDate`
Reads the date in priority order and returns the best one plus every candidate:
`{ publishedAt, modifiedAt, source, confidence, candidates }`, where `source` is one of `jsonld | meta | time | url | byline | text | null`.

- **JSON-LD** `datePublished` / `dateModified`, including `@graph` and arrays (confidence 0.95)
- **meta tags** — `article:published_time`, `og:published_time`, `pubdate`, `date`, `dc.date`, `sailthru.date`, `parsely-pub-date`, `itemprop=datePublished`, … (0.9)
- **`<time datetime>`** (0.8)
- **URL patterns** — `/2019/09/10/`, `/20190910`, `-2019-09-10`, `?date=…` (0.6)
- **byline / article-date elements** — elements whose `class`/`id` or a nearby `प्रकाशित`/`Published`/`मिति` label marks the article's own date (0.7)
- **body text** — last resort (0.4)

**Site chrome is ignored.** A header/sidebar "today" bar or a related-stories list never becomes the publish date — chrome containers (`<header>`/`<nav>`/`<aside>`/`<footer>` and `sidebar`/`related`/`trending`/… classes) are stripped, a concrete date always beats a relative "आज/today", and a dated `class="post__date"`/`प्रकाशित` element wins over loose body text.

**Time & timezone.** Full time precision is kept. A time with an explicit zone is honored; a time with **no** zone is read as **Nepal time (+05:45)**; a date with no time is **noon Nepal time**. Rejects dates before **1990** or more than ~1 day in the **future**.

### `textStaleness(text, { now, maxAgeDays, lang? })` → `TextStalenessResult`
`{ stale, upcoming, signals, newestMention, oldestMention, confidence }`. Flags articles whose body talks only about events older than `maxAgeDays`. **Not fooled by historical background:** a single mention inside the window — or a relative "today / yesterday / आज / हिजो" — keeps it fresh. Explicit dates keep full day precision (`September 10, 2019` stays the 10th, not year-end). A piece about a **future** event sets `upcoming: true` instead of looking stale.

### `assessFreshness({ html?, text, url?, feedDate?, now?, maxAgeHours })` → `AssessFreshnessResult`
`{ verdict: "fresh" | "stale" | "unknown" | "upcoming", ageHours, reasons }`. Combines page date, feed date and text staleness:
- a page publish/modify date is **authoritative** and outranks the feed date;
- only when no page date exists is the feed date used;
- only when neither exists does text staleness decide — **stale** if it reads old, **unknown** if there is no date and no signal.

### `assessFreshnessWithAI({ ..., ai })` → `Promise<AssessFreshnessResult>`
Same as `assessFreshness`, but when the deterministic verdict is `unknown` it calls your injected `ai(prompt) => Promise<string>` (via `freshnessPrompt`) and upgrades the verdict. **The AI is never consulted when a deterministic date was already found** — keeping cost down and results reproducible.

### `freshnessPrompt(text)` → `string`
A terse prompt asking an LLM to reply with `{"eventDate":"YYYY-MM-DD"|null,"isCurrentNews":true|false}`.

### Bikram Sambat
`bsToAd(year, month, day)` and `adToBs(date)` plus `BS_MONTH_DAYS`, `BS_MIN_YEAR` (2000), `BS_MAX_YEAR` (2100), `BS_MAX_SOLID` (2083). Also `parseAnyDate(str, { now })` and `normalizeDigits(str)` (Devanagari → Arabic).

> **BS data coverage.** The month-length table is cross-checked across three independent datasets and is a solid consensus for **BS 2000–2083** (anchor BS 2000/01/01 = AD 1943-04-14). **BS 2084–2100 are provisional** — the Nepali government finalizes month lengths only a few years ahead and libraries diverge there; re-verify against the official patro. Conversions outside 2000–2100 throw.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
