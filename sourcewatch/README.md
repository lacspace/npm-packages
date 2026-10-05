# @lacspace/sourcewatch

Checks that official source pages still back the facts you published. Built for newsrooms that cite official sources: emergency numbers, exam-result URLs, helplines, station homepages.

`sourcewatch` fetches each URL (HTML, plain text or PDF) and extracts its visible text. It normalises the text, then checks your expectations against it. You get back one of these:
- a clear pass;
- a classified failure, such as a dead host, a broken certificate, a 404, a "This is test" placeholder, or a page that no longer says the thing.

It is pure TypeScript with no dependencies. It runs on Node 18+, in browsers and on edge runtimes (global `fetch`, `DecompressionStream`, `TextDecoder`).

```sh
npm i @lacspace/sourcewatch
```

```ts
import { check, checkAll, summarize } from "@lacspace/sourcewatch";

const r = await check({ id: "water-helpline", url: "https://nwc.gov.np", expect: "1145" });
// { ok: true, status: 200, kind: "html", found: true, matched: ["1145"], missing: [],
//   snippet: "…प्रेष विज्ञप्ति 1145 मा सम्पर्कका लागि अनुरोध…", contentHash: "590bd7c96affa346", ms: 1222, … }

const results = await checkAll([
  { id: "short-codes", url: "https://nta.gov.np/uploads/contents/National%20Numbering%20Allocation%20Plan.pdf", expect: ["100", "101", "102"] },
  { id: "eoc", url: "http://neoc.gov.np", expect: "1149" },                       // → placeholder_page ("this is test")
  { id: "results", url: "https://neb.gov.np", expect: /results?/i, prevHash: lastRun.results },
], { concurrency: 4 });

summarize(results); // { total: 3, ok: 2, failed: 1, changed: 0, byError: { placeholder_page: 1 } }
```

## Matching rules

**Normalised text.** Both the page text and string expectations go through `normalise()`:
- NFC;
- Devanagari digits `०-९` → `0-9`;
- ZWJ, ZWNJ, zero-width space, soft hyphen and BOM removed;
- NBSP and every Unicode space → one space, whitespace collapsed;
- every dash variant → `-`.

So `"११४५"` matches a page that says `1145`, and the reverse.

**Strings** match case-insensitively. When an expectation starts or ends with a digit, that edge must sit next to a non-digit. So `"1145"` never matches inside `"11450"` or `"21145"`, and `"100"` never matches inside `"2100"`.

**RegExps** run as given on the normalised text. The `g` and `y` flags are ignored.

**Arrays:** `match: "all"` is the default, and `match: "any"` passes on one hit.

## API

- **`check(item, options?) → Promise<WatchResult>`:** verifies one source. It never throws.
- **`checkAll(items, options?) → Promise<WatchResult[]>`:**
  - results come back in input order;
  - runs up to `concurrency` checks at once (default 4);
  - never sends more than one request at a time to the same host.
- **`summarize(results)`:** returns `{ total, ok, failed, changed, byError }`.
- **`extractText(bytes | string, kind, contentType?) → Promise<string>`:** visible text of an HTML, text or PDF body. The charset comes from the BOM, then the `content-type` header, then `<meta>`.
- **`normalise(text)`:** the normalisation used for matching and hashing.
- **`isPlaceholder(text, bytes?)`:** the placeholder heuristic. `placeholderReason()` also says why.
- **`pdfText(bytes) → Promise<string>`:** pure-JS PDF text extraction (see below).
- Also exported:
  - `htmlToText`, `decodeEntities`, `fnv1a64`, `matchExpect`;
  - `classifyError`, `tlsKindOf`, `isPdf`, `DEFAULT_USER_AGENT`.

### `WatchItem`

| field | |
|---|---|
| `id` | your identifier, echoed back |
| `url` | URL to fetch; redirects are followed |
| `expect` | `string \| RegExp \| (string \| RegExp)[]` |
| `kind` | `"html" \| "pdf" \| "text" \| "auto"` (default). Auto checks the content-type, then the `%PDF-` magic bytes, then the URL extension |
| `match` | `"all"` (default) or `"any"` for arrays |
| `prevHash` | last run's `contentHash`. When set, the result includes `changedSince` |

### Options

| option | default | |
|---|---|---|
| `timeoutMs` | `15000` | per attempt, covering connect and body (AbortController) |
| `maxBytes` | `10 MB` | the body is read as a stream and reading stops here (`truncated: true`) |
| `userAgent` | desktop Chrome | some government sites block unknown agents |
| `headers` | — | extra request headers |
| `fetch` | global `fetch` | inject undici, a proxy-aware fetch or a test fake |
| `concurrency` | `4` | `checkAll` parallelism. The one-request-per-host limit always applies |
| `retries` | `1` | extra attempts, only on `timeout`, `http_5xx` and `network` |
| `retryDelayMs` | `500` | multiplied by the attempt number |
| `minTextChars` | `200` | HTML or text pages with less visible text than this are placeholders |

### `WatchResult`

| field | meaning |
|---|---|
| `ok` | fetched fine, not a placeholder, and expectations met |
| `found` | expectations met (can be `true` on a placeholder page; `ok` is still `false`) |
| `matched` / `missing` | expectations as strings; RegExps appear as `/src/flags` |
| `snippet` | about 120 characters of normalised text around the first match |
| `status` | HTTP status, also set on 4xx and 5xx |
| `finalUrl` | URL after redirects |
| `kind` | `html`, `pdf` or `text` |
| `contentHash` | **FNV-1a 64-bit** (16 hex chars) of the normalised extracted text. Whitespace, NBSP and digit-script changes don't affect it; real wording changes do |
| `changedSince` | `contentHash !== prevHash`; only set when `prevHash` was given |
| `bytes` / `truncated` | body bytes read, and whether reading stopped at `maxBytes` |
| `ms` | wall time, including retries |
| `error` / `tlsKind` / `detail` | see below |

### Error codes

| `error` | when | retried |
|---|---|---|
| `timeout` | AbortController fired (`timeoutMs`), or a connect/headers timeout | yes |
| `tls` | certificate or TLS failure; `tlsKind` says which (table below) | no |
| `dns` | `ENOTFOUND`, `EAI_AGAIN` | no |
| `network` | refused, reset or anything else; the raw code is in `detail` | yes |
| `http_4xx` | status 400–499 | no |
| `http_5xx` | status 500–599 | yes |
| `not_found_text` | real page, but expectations not met | — |
| `placeholder_page` | under 200 chars of visible text, or reads like a test page, default server page (nginx, Apache, IIS, cPanel, Plesk), "coming soon", "under construction", maintenance or suspended account | — |
| `too_large` | PDF cut at `maxBytes` and no text recovered | — |
| `unparseable` | PDF with no extractable text (scanned image, encrypted, or fonts without a Unicode map) | — |

| `tlsKind` | codes |
|---|---|
| `chain` | `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, `UNABLE_TO_GET_ISSUER_CERT`, `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`: the server sends an incomplete chain (missing intermediate) |
| `expired` | `CERT_HAS_EXPIRED`, `CERT_NOT_YET_VALID` |
| `self_signed` | `DEPTH_ZERO_SELF_SIGNED_CERT`, `SELF_SIGNED_CERT_IN_CHAIN` |
| `hostname` | `ERR_TLS_CERT_ALTNAME_INVALID` |
| `other` | any other TLS code (`ERR_SSL_*`, `CERT_REVOKED`, …) |

## Custom `fetch` and TLS

Many `.gov.np` servers ship an **incomplete certificate chain**: they don't send the intermediate. Browsers fill the gap, but Node's fetch fails with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`, which shows up as `error: "tls", tlsKind: "chain"`. `sourcewatch` never disables certificate verification. If you have verified the missing intermediate yourself, pass a fetch that trusts it:

```ts
import { Agent, fetch as undiciFetch } from "undici";
import { readFileSync } from "node:fs";
import { rootCertificates } from "node:tls";

const dispatcher = new Agent({ connect: { ca: [...rootCertificates, readFileSync("intermediates.pem", "utf8")] } });
const fetchWithCA = ((url, init) => undiciFetch(url, { ...init, dispatcher })) as typeof fetch;

await checkAll(items, { fetch: fetchWithCA });
```

You can also inject a fetch for proxies, caching or tests. Tests can return plain `Response` objects.

## PDF notes

`pdfText()` is a forgiving, pure-JS extractor:

- **Objects:** it scans the file for `N G obj` objects, so it doesn't need an xref and tolerates broken files and incremental updates. It unpacks compressed object streams (`/Type /ObjStm`).
- **Filters:**
  - supported: `FlateDecode` (via `DecompressionStream`, with PNG and TIFF predictors), `LZWDecode`, `ASCII85Decode`, `ASCIIHexDecode`, `RunLengthDecode`;
  - skipped: image filters (DCT, JPX, CCITT, JBIG2).
- **Page order:** it follows the `/Pages` `/Kids` tree with inherited `/Resources`, and falls back to file order. Form XObjects are followed.
- **Content streams:** it handles `Tj`, `TJ`, `'`, `"`, `Td`/`TD`/`T*`/`Tm`, `cm` and `q`/`Q`. It inserts newlines on vertical moves and spaces on horizontal gaps (using the font's `/Widths` or `/W`). A `TJ` kerning gap of 200 or more inserts a space.
- **Fonts:**
  - `/ToUnicode` CMaps: `bfchar`, `bfrange` (including the array form), multi-byte codespaces and UTF-16 surrogate pairs;
  - simple fonts without one: `/Differences` glyph names (`one`, `zero`, `uni0915`, …) over WinAnsi;
  - composite (Type0 / Identity-H) fonts without a ToUnicode map: skipped rather than emitting garbage.
- **Malformed input:** it never throws and has guards against huge loops. Truncated files return whatever text was recovered.

**Legacy Nepali fonts:** many Nepali government PDFs are typed in Preeti or similar legacy fonts, where Devanagari is stored as ASCII. Nepali text in legacy-font PDFs comes out in the font's ASCII (for example `g]kfn ;/sf/`). Digits and English text still match. Note that Preeti digits are typed as `!@#$%^&*()`, so a Devanagari number typed in Preeti will not match `"2083"`.

To match those, pass a converter as `textTransform` (since 1.1.0), on the item or in the options:

```ts
import { preetiToUnicode } from "@lacspace/preeti";

await check({ id: "neb-notice", url, expect: "२०८३", textTransform: preetiToUnicode });
// or for every PDF: { textTransform: (t, { kind }) => (kind === "pdf" ? preetiToUnicode(t) : t) }
```

Expectations match the converted text **or** the raw text, so a converter that garbles English never hides an English or digit match. `contentHash` is always computed on the raw text, so turning the hook on doesn't mark pages as changed. If the hook throws, the result is `unparseable` with the message in `detail`.

Encrypted PDFs and scanned (image-only) PDFs give `unparseable`. There is no OCR.

## Licence

[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
