# @lacspace/sourcewatch

Checks that official source pages still back the facts you published. Built for newsrooms that cite official sources: emergency numbers, exam-result URLs, helplines, station homepages.

`sourcewatch` fetches each URL (HTML, plain text or PDF) and extracts its visible text. It normalises the text, then checks your expectations against it. You get back one of these:
- a clear pass;
- a classified failure, such as a dead host, a broken certificate, a 404, a "This is test" placeholder, a JavaScript-only app shell, a bot-protection challenge, a scanned PDF that needs OCR, or a page that no longer says the thing.

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
- **`pdfText(bytes, { fixDevanagari?, maxPages? }) → Promise<string>`:** pure-JS PDF text extraction (see below).
- **`pdfInfo(bytes, opts?) → Promise<PdfInfo>`** (1.2.0): `{ text, pages, fonts, legacyFont?, replacementChars, images, imageOnly, ocrLayer, encrypted }`.
- **`pdfFonts(bytes) → Promise<string[]>`** (1.2.0): font names in the PDF, subset prefixes (`ABCDEF+`) removed.
- **`legacyFontFamily(name)`** (1.2.0): the legacy Nepali ASCII font family a font name belongs to, or `undefined`.
- **`jsAppReason(rawHtml, text)`** and **`botBlockReason(status, headers, body)`** (1.2.0): the heuristics behind `js_app` and `bot_blocked`.
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
| `textTransform` | per-item text rewrite; wins over the option-level one |

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
| `minTextChars` | `200` | HTML or text pages with less visible text than this are placeholders (or `js_app`) |
| `textTransform` | — | rewrite extracted text before matching (see PDF notes) |
| `pdf.fixDevanagari` | `true` | repair Devanagari from word-processor PDF exports (see PDF notes) |

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
| `pdfQuality` | PDFs only (1.2.0): `{ replacementChars, legacyFont?, fonts, images, imageOnly?, ocrLayer? }` |

### Error codes

| `error` | when | retried |
|---|---|---|
| `timeout` | AbortController fired (`timeoutMs`), or a connect/headers timeout | yes |
| `tls` | certificate or TLS failure; `tlsKind` says which (table below) | no |
| `dns` | `ENOTFOUND`, `EAI_AGAIN` | no |
| `network` | refused, reset or anything else; the raw code is in `detail` | yes |
| `bot_blocked` | 403, 429 or 503 from bot protection: a `cf-mitigated` header, or a Cloudflare challenge page ("Just a moment…", "Attention Required", `cf-chl`, `challenge-platform`), or a Sucuri, Imperva, Akamai ("Access Denied … Reference #") or DataDome block page. `status` is kept (1.2.0) | no |
| `http_4xx` | status 400–499 | no |
| `http_5xx` | status 500–599 | yes |
| `not_found_text` | real page, but expectations not met | — |
| `js_app` | the page is a JavaScript app shell: under 200 chars of visible text plus an app marker in the raw HTML (empty `<div id="app">` / `<div id="root">` / `__next`, `<noscript>` asking to enable JavaScript, module or hashed bundles such as `/assets/index-*.js`, `/_next/`, `chunk-vendors`, `ng-app`, `data-reactroot`). Wins over `placeholder_page`. `detail` says: check the site's JSON API or use a headless browser (1.2.0) | — |
| `placeholder_page` | under 200 chars of visible text, or reads like a test page, default server page (nginx, Apache, IIS, cPanel, Plesk), "coming soon", "under construction", maintenance or suspended account | — |
| `too_large` | PDF cut at `maxBytes` and no text recovered | — |
| `image_only` | PDF with images but no text: a scan. `detail` is `scanned/image-only PDF (N images, no text) — needs OCR` (1.2.0) | — |
| `unparseable` | PDF with no extractable text that is not a scan: encrypted, broken, or fonts without any Unicode map | — |

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

### Bot protection

Some sites sit behind Cloudflare or another WAF that answers 403 (or 429/503) with a challenge page to requests it scores as automated, often because of the caller's IP address (data-centre ranges score worse than home connections). `sourcewatch` reports these as `bot_blocked` instead of a plain `http_4xx`, so you know the page was never seen. It does **not** try to get around bot protection: it sends an ordinary browser User-Agent with normal `Accept` and `Accept-Language` headers, nothing more. If you need those pages, ask the site for access or an API, or pass your own `fetch` (for example through a proxy you are authorised to use).

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
  - composite (Type0 / Identity-H) fonts without a ToUnicode entry: the embedded TrueType/OpenType font's own `cmap` when there is one, otherwise skipped rather than emitting garbage.
- **Devanagari repair** (`fixDevanagari`, default `true`, since 1.2.0). Word-processor exports of Nepali documents often carry a broken ToUnicode map: each glyph is labelled from the first cluster it appeared in, with logical characters paired with visually ordered glyphs. The i-matra glyph then reads `म`, consonants read `ि`, the reph reads `श` or `ा`, and `न` reads `र्न`, which gives `कायाालय` for कार्यालय and `सूचर्ना` for सूचना. Other extractors (MuPDF/PyMuPDF included) print the same garbage, because the map in the file is wrong. `sourcewatch` repairs it like this:
  - when the embedded font has a `cmap` that disagrees with the ToUnicode map, the font's own `cmap` wins;
  - zero-width glyphs labelled with a spacing letter, or with `र्`, are treated as rephs;
  - i-matras (`ि`) drawn before their consonant cluster move after it, and rephs move before their cluster. This only happens within a run of glyphs from one font, and only for fonts whose text is visually ordered;
  - glyphs mapped to U+FFFD are recovered from their context when the evidence is clear: a glyph that always comes before a consonant becomes an i-matra variant, and one as wide as the font's `ी` that always follows a consonant becomes a `ी` variant;
  - anything else is dropped and counted in `pdfQuality.replacementChars`. U+FFFD never reaches the normalised text.

  Conjunct ligatures that have no Unicode label anywhere in the file (for example `ष्ट्र` or `क्र` in some subsets) can't be recovered, and the word loses that cluster. Pass `pdf: { fixDevanagari: false }` to get the raw ToUnicode text.
- **Malformed input:** it never throws and has guards against huge loops. Truncated files return whatever text was recovered.

**Legacy Nepali fonts:** many Nepali government PDFs are typed in Preeti or another legacy Nepali ASCII font, where Devanagari is stored as ASCII. Nepali text in legacy-font PDFs comes out in the font's ASCII (for example `g]kfn ;/sf/`). Digits and English text still match. Note that Preeti digits are typed as `!@#$%^&*()`, so a Devanagari number typed in Preeti will not match `"2083"`.

`pdfQuality.fonts` lists the PDF's fonts (subset prefixes removed), and `pdfQuality.legacyFont` names the legacy Nepali ASCII font family when one drew a real share of the text (at least 5 %, or 200 characters). Both are also passed to `textTransform` (since 1.2.0), so you can pick the right converter. To match the converted text, pass a converter as `textTransform` (since 1.1.0), on the item or in the options:

```ts
import { preetiToUnicode } from "@lacspace/preeti";

await check({ id: "neb-notice", url, expect: "२०८३", textTransform: preetiToUnicode });
// or only where it applies:
// { textTransform: (t, { kind, legacyFont }) => (kind === "pdf" && legacyFont === "Preeti" ? preetiToUnicode(t) : t) }
```

Expectations match the converted text **or** the raw text, so a converter that garbles English never hides an English or digit match. `contentHash` is always computed on the raw text, so turning the hook on doesn't mark pages as changed. If the hook throws, the result is `unparseable` with the message in `detail`.

**Scans:** a PDF with images but no text gives `image_only`, with `pdfQuality.imageOnly: true`. There is no OCR. Some scanners add an invisible OCR text layer (text render mode 3) over the page image. For Devanagari that layer is often Latin garbage, not a font encoding, so no converter will fix it. When most of the text is invisible and drawn over images, `pdfQuality.ocrLayer` is `true`. Encrypted and broken PDFs give `unparseable`.

## Changes in 1.2.0

- New error codes, each more specific than the one it replaces:
  - `js_app` for JavaScript app shells (was `placeholder_page`);
  - `bot_blocked` for WAF challenges on 403/429/503 (was `http_4xx`/`http_5xx`, and is no longer retried);
  - `image_only` for scanned PDFs (was `unparseable`).
- Devanagari repair for PDFs with broken ToUnicode maps: the embedded font's `cmap`, i-matra and reph reordering, and U+FFFD recovery. It is on by default; pass `pdf: { fixDevanagari: false }` to turn it off.
- `pdfQuality` on PDF results: `replacementChars`, `fonts`, `legacyFont`, `images`, `imageOnly`, `ocrLayer`.
- `textTransform` context gains `fonts` and `legacyFont`.
- New exports: `pdfInfo`, `pdfFonts`, `legacyFontFamily`, `jsAppReason`, `botBlockReason`.
- `normalise()` drops U+FFFD.
- Zero-width marks positioned back over their base no longer split a word (`के न्द्रीय` → `केन्द्रीय`).

Every other result is unchanged. Texts from repaired PDFs hash differently from 1.1.0, so expect `changedSince: true` once for those sources.

## Licence

[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0): free for personal and commercial use.
