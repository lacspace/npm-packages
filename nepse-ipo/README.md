# @lacspace/nepse-ipo

Pure helpers that turn Nepal IPO data into clean, typed objects. Your app does the fetching and storage; this package only parses. It:
- turns the nepalipaisa.com `GetIpos` JSON into one `Issue` per offering, with eligibility, mutual-fund detection and real UTC dates;
- reads the latest entry on the SEBON IPO pipeline page (title, date and English PDF link);
- converts Nepal Time (UTC+05:45) to UTC by hand;
- decides when an old issue can be archived.

It has zero dependencies and is safe for React Native / Hermes. It uses no `node:` imports, no DOM, no `Intl` time zones, no lookbehind regex and no `structuredClone`. It works the same in Node 18+, browsers and workers.

```ts
import { parseNepaliPaisaIpos, parseSebonPipeline, nptDate, isArchivable } from "@lacspace/nepse-ipo";

const res = await fetch(
  "https://nepalipaisa.com/api/GetIpos?stockSymbol=&pageNo=1&itemsPerPage=50&pagePerDisplay=5",
);
const issues = parseNepaliPaisaIpos(await res.json());
// [{ symbol: "ABCL", companyName: "ABC Hydropower Limited", type: "ipo", eligibility: "general",
//    units: 1000000, pricePerUnit: 100, openDate: 2026-09-07T04:15:00Z, closeDate: 2026-09-10T11:15:00Z, ... }]

const html = await (await fetch("https://www.sebon.gov.np/ipo-pipeline")).text();
parseSebonPipeline(html);
// { title: "List of Application for IPO (2083-06-20)", date: "2026-10-06",
//   url: "https://www.sebon.gov.np/uploads/2026/10/06/....pdf" }

nptDate("2026-09-10", "5:00 PM")?.toISOString(); // "2026-09-10T11:15:00.000Z"
isArchivable(issues[0]!, Date.now(), 30);        // true once 30 days have passed since the last relevant date
```

## API

### Types
```ts
type IssueType = "ipo" | "mutual_fund";
type Eligibility = "general" | "locals" | "foreign_employment";
interface Issue {
  symbol: string; companyName: string; type: IssueType; eligibility: Eligibility;
  sector?: string; issueManager?: string; rating?: string;
  units?: number; minUnits?: number; maxUnits?: number; pricePerUnit?: number;
  openDate: Date; closeDate: Date; extendedCloseDate?: Date; status?: string;
}
```

### `nptDate(ymd, time?) => Date | undefined`
Converts a Nepal wall-clock date and time to a real instant.
- `ymd` must be a strict `YYYY-MM-DD`. A `YYYY-MM-DDT...` value also works; only its date part is used.
- `time` can be `"17:00"`, `"5:00 PM"`, `"5 PM"`, `"12:30 AM"` (00:30) or `"12:00 PM"` (noon). Seconds are optional. If you leave it out, the time is 00:00.
- It returns `undefined` for an impossible date or time, such as month 13, day 32, Feb 30, Feb 29 in a non-leap year, `25:00` or `13 PM`.

### `parseNepaliPaisaIpos(json) => Issue[]`
Parses the response of `GET https://nepalipaisa.com/api/GetIpos?...`. Rows are read from `json.result.data`, and a bare array also works.
- **Eligibility** comes from `shareType`, matched case-insensitively and trimmed: `ordinary` maps to `general`, `local` to `locals`, `Migrant Workers` to `foreign_employment`. Anything else maps to `general`.
- **Type** is `mutual_fund` when `sectorName` contains "mutual fund", or when `companyName` has the word Fund, Yojana or Scheme. Otherwise it is `ipo`. The `mutualFundUnits` field is ignored on purpose: it is the part of an IPO reserved for mutual funds, so it is non-zero on ordinary IPOs too.
- **Dates:**
  - `openDate` is the opening date at 10:00 NPT.
  - `closeDate` is the closing date at `closingDateClosingTime`, or 17:00 NPT when that is missing or invalid.
  - `extendedCloseDate` is `extendedDateAD` at the same time. It is set only when it is later than `closeDate`.
- **Numbers** can be numbers or numeric strings, and commas are allowed (`"1,23,45,000"`).
- **Dedupe:** you get one issue per symbol and opening date. When several tranches exist, the `ordinary` one wins.
- **Skipped rows:** a row with no symbol or no valid opening or closing date is skipped.
- **Order:** results are sorted by `openDate` (newest first), then by symbol.

### `parseSebonPipeline(html, baseUrl = "https://www.sebon.gov.np/ipo-pipeline") => { title, date, url } | null`
Reads the first data row of the IPO pipeline table:
- the title from the first cell, with entities decoded and whitespace collapsed;
- a `YYYY-MM-DD` date from the second cell;
- a `.pdf` link from a later cell, resolved to an absolute URL against `baseUrl`.

Header rows (all `<th>`) are skipped. When there are both English and Nepali links, the English one wins. It is picked by the link text ("English", "EN"), then the cell text, then the column header. The function returns `null` when no row has a title, a valid date and a PDF link.

### `lastRelevant(issue) => number`
Returns the latest of `closeDate`, `extendedCloseDate` and `listingDate` in epoch ms.
- Each can be a `Date`, an ISO string or epoch ms. A bare `YYYY-MM-DD` string is read as midnight NPT.
- Invalid dates are ignored. It returns `NaN` when none is valid.

### `isArchivable(issue, now = Date.now(), days = 30) => boolean`
Returns `true` when `lastRelevant(issue) + days` is strictly before `now`. It returns `false` when every date is invalid.

### Extras
- `eligibilityOf(shareType)`, `issueTypeOf(sectorName, companyName)` and `toNumber(value)` are the building blocks used by the nepalipaisa parser.
- `readTables(html)`, `decodeEntities(s)` and `resolveUrl(href, base)` come from the small tolerant HTML reader.
- `NPT_OFFSET_MINUTES` (345) and `SEBON_IPO_PIPELINE_URL` are exported constants.

None of the functions throw on malformed input. They return `undefined`, `[]`, `null` or `NaN` instead.

## Data sources
- **SEBON** ([sebon.gov.np](https://www.sebon.gov.np/ipo-pipeline)) is the official securities regulator of Nepal.
- The **nepalipaisa.com `GetIpos`** endpoint is a public but undocumented third-party API, and it can change without notice. Check its terms before relying on it in production. The parser is defensive and skips malformed rows.

This package never makes network requests. Cache responses and be gentle with both sites.

## Limits
- **No fetching:** you bring the JSON or HTML.
- **Fixed opening time:** nepalipaisa does not publish an opening time, so 10:00 NPT is assumed.
- **Bare hours:** a time without minutes needs AM/PM (`"5 PM"`). A bare `"17"` is rejected as ambiguous.
- **Dedupe key:** issues are deduped by symbol and opening date. Tranches with different opening dates stay separate issues.
- **Mutual-fund detection:** it uses the sector and the company name. A fund whose name has none of Fund, Yojana or Scheme, and whose sector is not "Mutual Fund", is reported as `ipo`.
- **SEBON page layout:** the parser expects the current layout (title, date, then link cells). A redesign may need an update. It returns `null` rather than guessing.
- **HTML reader:** it is built for simple data tables, not as a general HTML parser. It ignores scripts, styles and comments, and it handles unclosed `td`/`tr` and nested tables.
- **Dates:** only AD (Gregorian) dates are read. Bikram Sambat text in titles is kept as-is.

Built by [Lacspace](https://lacspace.com). Licensed under the Lacspace Free Licence v1.0 (see LICENSE).
