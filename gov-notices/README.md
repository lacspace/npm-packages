# @lacspace/gov-notices

Turns the notice boards of Nepali government bodies and universities into clean items you can put in a feed:
- a title, with a flag for whether it is in Nepali, English or both;
- the date in AD and Bikram Sambat, plus the date exactly as the site printed it;
- an absolute URL, and the PDFs, images and documents attached to the notice;
- tags such as `result`, `exam`, `schedule`, `admit-card`, `vacancy` and `syllabus`.

It has adapters for the boards listed below and a generic finder for any other notice page. It has no dependencies, runs anywhere `fetch` does, and uses no AI or API keys.

```bash
npm i @lacspace/gov-notices
```

## Quick start: "results out" alerts

```ts
import { fetchNotices, newSince, isResult } from "@lacspace/gov-notices";

// Load these from your store. Use an empty set on the first run.
const seen: Set<string> = await loadSeenIds();
const prev = await loadValidators("neb"); // { etag?, lastModified?, contentHash? }

const r = await fetchNotices("neb", { etag: prev.etag, lastModified: prev.lastModified });
if (!r.notModified && r.contentHash !== prev.contentHash) {
  for (const n of newSince(r.notices, seen)) {
    if (isResult(n)) await alert(`Results out: ${n.title} (${n.dateBs}) ${n.url}`);
    seen.add(n.id);
  }
}
await saveValidators("neb", { etag: r.etag, lastModified: r.lastModified, contentHash: r.contentHash });
await saveSeenIds(seen);
```

You can also parse a page you fetched yourself:

```ts
import { parseNotices } from "@lacspace/gov-notices";

parseNotices(html, { baseUrl: "https://tsc.gov.np/category/73/" });
// [{ id: "0928d0f6faad8846", sourceId: "tsc", title: "बढुवा नतिजा पुनरावलोकनसम्बन्धी सूचना (…)", titleLang: "ne",
//    date: "2026-09-30", dateBs: "2083-06-14", dateRaw: "असोज १४, २०८३",
//    url: "https://tsc.gov.np/content/4216/…", attachments: [{ url: "https://…/Pokhara_2tqbqfz.pdf", type: "pdf" }],
//    category: "नतिजा", tags: ["result"] }, …]
```

## API

- **`parseNotices(body, { baseUrl, sourceId?, now? })`:** parses a page into `Notice[]`.
  - `body` is HTML, or JSON for the sites whose list comes from an API.
  - The adapter is chosen by `sourceId`, then by the host of `baseUrl`. Anything else goes to the generic finder.
  - Relative links resolve against `baseUrl`, and duplicates are removed.
- **`fetchNotices(sourceIdOrUrl, opts?)`:** makes one GET and parses the response. It never follows pagination. It returns `{ status, notModified, notices, etag?, lastModified?, contentHash?, url, source? }`.
  - `fetch`: your own fetch implementation. Defaults to the global one.
  - `userAgent`: defaults to `lacspace-gov-notices/1.0 (+https://developer.lacspace.com/packages/gov-notices)`. Pass a browser UA if a site refuses bots.
  - `timeoutMs`: defaults to 20000.
  - `maxBytes`: defaults to 5 MB.
  - `headers`: extra request headers.
  - `etag` / `lastModified`: sent as `If-None-Match` / `If-Modified-Since`. A 304 comes back as `notModified: true`, nothing is parsed and `notices` is `[]`.
  - Non-2xx responses come back with their `status` and no notices. Network errors throw.
- **`SOURCES`:** the registry. Each entry has `{ id, name, nameNe, url, feedUrl?, headers?, kind, adapter }`. `url` is the page a person would open. `feedUrl` is what `fetchNotices` actually reads, for sites that render their list with JavaScript.
- **`parseBsDate(s)`:** returns `{ bs, ad }` or `null`. Reads a BS date anywhere in `s`.
- **`parseDate(s)`:** returns `{ ad, bs?, raw, calendar }` or `null`. Reads a date in either calendar (see *Dates* below).
- **`dedupe(notices)`:** removes duplicates by URL, then by normalised title + date. The first copy is kept and the duplicates' attachments are merged into it.
- **`newSince(notices, prevIds)`:** returns the notices whose `id` is not in `prevIds`.
- **`tag(notice)` / `isResult(notice)`:** tags inferred from the title and category. Tags are already filled in on parsed notices.
- **`conditional(prev)`:** builds `If-None-Match` / `If-Modified-Since` headers from `{ etag, lastModified }`, for when you fetch the page yourself.
- **`cleanTitle(s)`, `titleLang(s)`:** the title helpers used internally.
- **`genericParse(doc)`, `parseHTML(html)`, `queryAll` / `queryOne`, `ADAPTERS`, `adapterFor(host)`:** the building blocks, for writing your own adapter.

### Notice fields

| Field | Type | Notes |
|---|---|---|
| `id` | string | 16 hex chars. A stable hash of `sourceId` + `url`, or of `sourceId` + title + date when there is no URL. |
| `sourceId` | string | The `SOURCES` id, else the host. |
| `title` | string | Whitespace collapsed. "New"/"नयाँ" badges, a trailing "(PDF)" and leading serials (`1.`, `१.`, `क्र.सं.`) are stripped. |
| `titleLang` | `'ne' \| 'en' \| 'mixed'` | `ne` when at least 60% of the letters are Devanagari, `en` when at most 10% are. |
| `date` | string? | AD, `YYYY-MM-DD`. |
| `dateBs` | string? | BS, `YYYY-MM-DD`, ASCII digits. |
| `dateRaw` | string? | The date text as printed, e.g. `असोज ८, २०८३` or `Sep 15, 2026`. |
| `url` | string? | Absolute. The notice's own page, or else its first file. |
| `attachments` | `{ url, type, label? }[]` | `type` is `pdf`, `image`, `doc` or `other`, from the file extension or the site's media type. |
| `category` | string? | The site's tab, section or category label. |
| `tags` | string[]? | `result`, `exam`, `schedule`, `admit-card`, `vacancy`, `syllabus`. |

## Site status

Probed on 2026-10-05 (BS 2083-06-19) from outside Nepal. "Live items" is the number of notices `fetchNotices` parsed from the live page that day.

| id | Body | Notice list | Reachable | Adapter | Fixture tested | Live items | Date format seen |
|---|---|---|---|---|---|---|---|
| `psc` | Public Service Commission (लोक सेवा आयोग) | `https://psc.gov.np/category/notice` (read from the JSON feed `/front/category/notice`) | yes | `psc` (JSON) | yes | 10 | `upload_date` AD + `upload_date_bs` |
| `neb` | National Examinations Board | `https://neb.gov.np/` (homepage tabs: notices, results, exam routines, vacancy syllabus) | yes | `neb` | yes | 24 | `प्रकाशित मिति २०८३ आश्विन १५ गते` |
| `see` | Office of the Controller of Examinations, Sanothimi (SEE) | `https://see.gov.np/category/notice/` | yes | `giwms` | yes | 4 | `१ असोज, २०८३` |
| `tsc` | Teacher Service Commission | `https://tsc.gov.np/category/72/` (notices); `/category/73/` is results and recommendations | yes | `giwms` | yes | 6 | `असोज ८, २०८३, बिहिबार १५:६` |
| `mec` | Medical Education Commission | `https://mec.gov.np/np/category/notice` | **TLS certificate expired**: Node's fetch refuses it, curl `-k` works | `mec` | yes | 0 (fetch failed) / 10 from a saved copy | `१४ आश्विन २०८३, बुधबार` |
| `ctevt` | CTEVT | `https://ctevt.org.np/documents/list/notice-board` | yes | `ctevt` | yes | 13 | `Sep 15, 2026` (AD) |
| `tuexam` | TU Office of the Controller of Examinations | `https://tuexam.edu.np/` (unverified) | **no** (connection timed out from outside Nepal) | generic | no | 0 | n/a |
| `nec` | Nepal Engineering Council | `https://nec.gov.np/notices` (read from the tRPC feed `notice.getNoticesPublic`) | yes | `nec` (JSON) | yes | 10 | ISO timestamp, read as the Nepal (UTC+05:45) day |
| `nmc` | Nepal Medical Council | `https://nmc.org.np/latest-notice` | yes, but the list is rendered over a Blazor Server socket and is empty in the HTML | generic | no | 0 | n/a |
| `dotm` | Department of Transport Management | `https://dotm.gov.np/` (homepage highlight and latest-news blocks; no public notice category) | yes (rate-limits bursts with 403) | `giwms` | yes | 7 | `१६ असोज, २०८३` |

The `giwms` adapter covers the shared Government Integrated Website Management System template, including its category tables and card grids. Many other `*.gov.np` sites use the same template, so it is worth trying it on any GIWMS page with `fetchNotices(url)`.

None of these sites sent `ETag` or `Last-Modified` on the probe day. Use `contentHash` together with `newSince` to detect changes. Conditional headers are still sent whenever you pass validators.

For `mec` you can pass your own `fetch`. In Node that can be an undici `Agent` with relaxed TLS for that one host, which is your call. The library never turns off certificate checks.

## Dates

- **Digits:** Devanagari (`०-९`) and ASCII digits are both read.
- **Numeric forms:** `/`, `-` and `.` all work as separators. `parseBsDate("२०८२/०६/१८")`, `parseBsDate("2082.6.18")` and `parseBsDate("2082-06-18")` all return `{ bs: "2082-06-18", ad: "2025-10-04" }`.
- **Month names:** written as `YYYY Month D`, `Month D, YYYY` or `D Month YYYY`, in Roman or Devanagari. Each month accepts several spellings:

  | Month | Spellings |
  |---|---|
  | 1 | Baisakh / Baishakh / बैशाख / वैशाख |
  | 2 | Jestha / Jeth / जेठ / जेष्ठ |
  | 3 | Asar / Ashadh / असार / आषाढ |
  | 4 | Shrawan / Saun / साउन / श्रावण |
  | 5 | Bhadra / Bhadau / भदौ / भाद्र |
  | 6 | Ashwin / Asoj / असोज / आश्विन |
  | 7 | Kartik / कात्तिक / कार्तिक |
  | 8 | Mangsir / मंसिर / मङ्सिर / मार्गशीर्ष |
  | 9 | Poush / Push / पुस / पौष |
  | 10 | Magh / माघ |
  | 11 | Falgun / Fagun / फागुन / फाल्गुन |
  | 12 | Chaitra / Chait / चैत / चैत्र |

  Trailing `गते`, weekdays and times are ignored.
- **Validation:** the day is checked against the real month length from `@lacspace/nepali-date` (bundled at build time), so `२०८२/०६/३३` returns `null`. BS years 1970–2086 are covered.
- **BS or AD (`parseDate`):**
  - A numeric year from 2050 to 2100 is read as BS. BS 2050 began in 1993, so a notice dated `2083-06-15` is BS.
  - A year from 1990 to 2049 is read as AD (`2025-10-04`).
  - English month names are AD (`Sep 15, 2026`, `5 October 2026`). Nepali month names are BS.
- **JSON feeds:** `psc` already gives both dates. `nec` gives a UTC timestamp, which is converted to the calendar day in Nepal.

## Being polite

- `fetchNotices` makes exactly one request per call and never crawls pagination. Run it once per site per polling cycle; every 15–30 minutes is plenty for exam and results news.
- Send `etag`/`lastModified` back on the next call, and compare `contentHash` to skip unchanged pages.
- The default User-Agent identifies the library and links to its documentation. Only switch to a browser UA when a site refuses the default.
- Some GIWMS hosts answer bursts of requests with 403, so don't fetch several pages from one host in parallel.

Notices are public government information; check each site's terms before republishing.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
