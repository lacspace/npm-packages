# @lacspace/gov-notices

Turns the notice boards of Nepali government bodies and universities into clean items you can put in a feed:
- a title, with a flag for whether it is in Nepali, English or both;
- the date in AD and Bikram Sambat, plus the date exactly as the site printed it;
- an absolute URL, and the PDFs, images and documents attached to the notice;
- tags such as `result`, `exam`, `schedule`, `admit-card`, `vacancy`, `syllabus` and `recommendation`.

It has adapters for the boards listed below, including dedicated results lists for PSC, TSC and SEE, and a generic finder for any other notice page. It has no dependencies, runs anywhere `fetch` does, and uses no AI or API keys.

```bash
npm i @lacspace/gov-notices
```

## Changes in 1.1.0

All changes are additive. Existing ids, fields and the one-request default are unchanged.

- **Cut titles.** CTEVT, among others, shortens long titles on its list ("Call for Papers for Journal of Technical and Vocational E..."). The full title is not anywhere in the list markup, so:
  - every adapter now prefers a link's `title` / `data-title` attribute when the visible text ends with "…" or "...";
  - a title that is still cut is flagged `truncated: true`;
  - `fetchNotices(id, { details: true, maxDetails: 5, knownIds })` reads the detail pages of cut items it has not seen before and fills in the full title. It is opt-in, sequential and capped. `completeTitles(notices, opts)` does the same for notices from any source, and `parseDetail(html, url)` reads one detail page.
- **Undated items.** An item whose list card shows no date now has `undated: true` (`date` stays undefined). With `details: true`, its date comes from the detail page. For example, the DoTM homepage card for the class B written-exam questions has an empty date slot, and its detail page says `१९ असोज, २०८३`.
- **DoTM.** `SOURCES.dotm` now reads `/category/latest-news/`, the site's dated "ताजा समाचार" list. Before, it read the homepage blocks, where some cards have no date.
- **New results sources:** `psc-results` (written exam results), `psc-recommendations` (final recommendations), `tsc-results` (TSC category 73) and `see-results` (SEE's प्रकाशन list, where results are posted). See *Site status*.
- **Tags.** There is a new `recommendation` tag (`सिफारिस`, "recommend"). PSC results items carry `result` from the feed itself, so `isResult()` is true for every `psc-results` and `psc-recommendations` item. A PSC reference such as "विज्ञापन नं. १२०२०" is no longer tagged `vacancy`. A real call for applications (`दरखास्त`, "विज्ञापन" without a number) still is.
- The default User-Agent is now `lacspace-gov-notices/1.1`.

## Quick start: "results out" alerts

```ts
import { fetchNotices, newSince, isResult } from "@lacspace/gov-notices";

// Load these from your store. Use an empty set on the first run.
const seen: Set<string> = await loadSeenIds();
const prev = await loadValidators("neb"); // { etag?, lastModified?, contentHash? }

const r = await fetchNotices("neb", { etag: prev.etag, lastModified: prev.lastModified });
// For a results feed, poll "psc-results", "psc-recommendations", "tsc-results", "see-results" and "neb" the same way.
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
  - `userAgent`: defaults to `lacspace-gov-notices/1.1 (+https://developer.lacspace.com/packages/gov-notices)`. Pass a browser UA if a site refuses bots.
  - `timeoutMs`: defaults to 20000.
  - `maxBytes`: defaults to 5 MB.
  - `headers`: extra request headers.
  - `etag` / `lastModified`: sent as `If-None-Match` / `If-Modified-Since`. A 304 comes back as `notModified: true`, nothing is parsed and `notices` is `[]`.
  - Non-2xx responses come back with their `status` and no notices. Network errors throw.
  - `details` (default `false`): after the list, read the detail pages of items whose title is cut or that have no date, and complete them (see `completeTitles`). Related options are `maxDetails` (default 5), `knownIds` (ids you already hold, which are never fetched) and `detailDelayMs` (default 1000). The result then carries `detailsFetched`.
- **`completeTitles(notices, opts?)`:** fills in cut titles and, unless `dates: false`, missing dates from each notice's detail page. Notices are updated in place and the same array is returned.
  - It only fetches items that have an HTML detail URL (never a file), that are cut or undated, and whose id is not in `knownIds`.
  - It makes at most `maxDetails` requests (default 5), one at a time, `delayMs` (default 1000) apart.
  - Ids never change. Files linked from the detail page are added to `attachments`. A title the page cannot complete keeps `truncated: true`, and a failed request is skipped.
  - It also takes `fetch`, `userAgent`, `timeoutMs`, `maxBytes` and `headers`.
- **`parseDetail(html, url)`:** returns `{ title?, titles, date?, dateBs?, dateRaw?, attachments }` for a notice's own page.
  - `titles` holds the heading, `og:title` and `<title>`, best first.
  - The date comes from the page's date slot, such as GIWMS `.meta__group .date` or CTEVT "published on".
  - Dates elsewhere on the page, such as header sliders, are ignored.
- **`needsDetail(notices, { knownIds?, dates? })`:** the notices a detail pass would fetch, in list order, before the `maxDetails` cap.
- **`completeTitle(cut, candidates)`, `isTruncated(title)`:** the title-completion helpers.
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
| `tags` | string[]? | `result`, `exam`, `schedule`, `admit-card`, `vacancy`, `syllabus`, `recommendation`. |
| `undated` | `true`? | Set when the list showed no date (`date` is undefined). |
| `truncated` | `true`? | Set when the title still ends with "…" or "..." because the site cut it. |

## Site status

Probed on 2026-10-05 (BS 2083-06-19) from outside Nepal. "Live items" is the number of notices `fetchNotices` parsed from the live page that day.

| id | Body | Notice list | Reachable | Adapter | Fixture tested | Live items | Date format seen |
|---|---|---|---|---|---|---|---|
| `psc` | Public Service Commission (लोक सेवा आयोग) | `https://psc.gov.np/category/notice` (read from the JSON feed `/front/category/notice`) | yes | `psc` (JSON) | yes | 10 | `upload_date` AD + `upload_date_bs` |
| `psc-results` | PSC written exam results (लिखित नतिजा) | `https://psc.gov.np/category/result/all` (read from `/front/branch-details/all/written_result`) | yes | `psc` (JSON) | yes | 20 (all `result`) | `date_upload` AD + `date_upload_bs` |
| `psc-recommendations` | PSC recommendations, i.e. final results (सिफारिस) | `https://psc.gov.np/category/recommended/all` (read from `/front/branch-details/all/recommendation`) | yes | `psc` (JSON) | yes | 20 (all `result`) | `date_upload` AD + `date_upload_bs` |
| `neb` | National Examinations Board | `https://neb.gov.np/` (homepage tabs: notices, results, exam routines, vacancy syllabus) | yes | `neb` | yes | 24 (10 `result`) | `प्रकाशित मिति २०८३ आश्विन १५ गते` |
| `see` | Office of the Controller of Examinations, Sanothimi (SEE) | `https://see.gov.np/category/notice/` | yes | `giwms` | yes | 4 | `१ असोज, २०८३` |
| `see-results` | SEE results and publications (प्रकाशन) | `https://see.gov.np/category/publication/` | yes | `giwms` | yes | 5 (4 `result`) | `२२ साउन, २०८३` |
| `tsc` | Teacher Service Commission | `https://tsc.gov.np/category/72/` (notices) | yes | `giwms` | yes | 6 | `असोज ८, २०८३, बिहिबार १५:६` |
| `tsc-results` | TSC results and recommendations (नतिजा) | `https://tsc.gov.np/category/73/` | yes | `giwms` | yes | 6 (all `result`) | `असोज १४, २०८३, बुधबार १७:१०` |
| `mec` | Medical Education Commission | `https://mec.gov.np/np/category/notice` | **TLS certificate expired**: Node's fetch refuses it, curl `-k` works | `mec` | yes | 0 (fetch failed) / 10 from a saved copy | `१४ आश्विन २०८३, बुधबार` |
| `ctevt` | CTEVT | `https://ctevt.org.np/documents/list/notice-board` | yes | `ctevt` | yes | 13 (3 `truncated`; all 3 completed with `details: true`) | `Sep 15, 2026` (AD) |
| `tuexam` | TU Office of the Controller of Examinations | `https://tuexam.edu.np/` (unverified) | **no** (connection timed out from outside Nepal) | generic | no | 0 | n/a |
| `nec` | Nepal Engineering Council | `https://nec.gov.np/notices` (read from the tRPC feed `notice.getNoticesPublic`) | yes | `nec` (JSON) | yes | 10 (3 `result`) | ISO timestamp, read as the Nepal (UTC+05:45) day |
| `nmc` | Nepal Medical Council | `https://nmc.org.np/latest-notice` | yes, but the list is rendered over a Blazor Server socket and is empty in the HTML | generic | no | 0 | n/a |
| `dotm` | Department of Transport Management | `https://dotm.gov.np/category/latest-news/` (the dated "ताजा समाचार" list; 6 per page) | yes (rate-limits bursts with 403) | `giwms` | yes | 6 (all dated) | `१९ असोज, २०८३` |

Results lists that do **not** have their own source, as of the probe day:

- **NEB:** the homepage "नतिजा प्रकाशन" tab is already in `neb`, with that `category`. Its "more" page (`/result-publish`) returns HTTP 500, and `/vacancy-results` does too.
- **CTEVT:** `ctevt.org.np/documents/list/results` exists but is empty. Exam results are on the examination office's portal (`itms.ctevt.org.np:5580/notices/result`), whose list loads from an AJAX endpoint that returned HTTP 500 to every request.
- **NEC:** there is no results category. The feed's `categoryId` filter is ignored server-side, so results come through `nec` (tagged `result`).
- **PSC:** `/front/category/result` is a 404. The results lists are the `branch-details` feeds used above.

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

- `fetchNotices` makes exactly one request per call and never crawls pagination, unless you pass `details: true`. With it, the call makes at most `maxDetails` (default 5) more requests, one at a time and a second apart, and only for items that are cut or undated and not in `knownIds`. Pass the ids you already stored as `knownIds` so old items are never fetched again. Run it once per site per polling cycle; every 15–30 minutes is plenty for exam and results news.
- Send `etag`/`lastModified` back on the next call, and compare `contentHash` to skip unchanged pages.
- The default User-Agent identifies the library and links to its documentation. Only switch to a browser UA when a site refuses the default.
- Some GIWMS hosts answer bursts of requests with 403, so don't fetch several pages from one host in parallel.

Notices are public government information; check each site's terms before republishing.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
