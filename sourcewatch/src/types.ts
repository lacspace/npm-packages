/** What a source page must contain. Strings match case-insensitively on normalised text; RegExps run as given. */
export type Expect = string | RegExp | (string | RegExp)[];

/** The document kinds sourcewatch can read. */
export type Kind = "html" | "pdf" | "text";

/** One source to verify. */
export interface WatchItem {
  /** Your identifier, echoed back on the result. */
  id: string;
  /** The URL to fetch (redirects are followed). */
  url: string;
  /** What the page must still say. */
  expect: Expect;
  /** Document kind. Default `"auto"`: content-type, then `%PDF-` magic bytes, then the URL extension. */
  kind?: Kind | "auto";
  /** The `contentHash` from the previous run. When given, the result carries `changedSince`. */
  prevHash?: string;
  /** For array expectations: `"all"` (default) must all match, `"any"` needs one. */
  match?: "all" | "any";
  /** Per-item text rewrite (e.g. Preeti → Unicode for this PDF only). @since 1.1.0 */
  textTransform?: TextTransform;
}

/** Failure classes. */
export type WatchError =
  | "timeout"
  | "tls"
  | "dns"
  | "network"
  | "http_4xx"
  | "http_5xx"
  | "not_found_text"
  | "placeholder_page"
  | "too_large"
  | "unparseable"
  /** The page is a JavaScript app shell (empty mount point, bundles, "enable JavaScript"). @since 1.2.0 */
  | "js_app"
  /** 403/429/503 with a bot-protection challenge (Cloudflare, Sucuri, Imperva, Akamai…). @since 1.2.0 */
  | "bot_blocked"
  /** A PDF with images but no text: a scan that needs OCR. @since 1.2.0 */
  | "image_only";

/** The sub-class of a `tls` failure. `chain` means the server sent an incomplete certificate chain. */
export type TlsKind = "chain" | "expired" | "self_signed" | "hostname" | "other";

/** The outcome of one check. */
export interface WatchResult {
  id: string;
  url: string;
  /** The URL after redirects. */
  finalUrl?: string;
  /** Fetched fine, not a placeholder page, and expectations met. */
  ok: boolean;
  /** HTTP status code. */
  status?: number;
  /** The detected (or declared) document kind. */
  kind?: Kind;
  /** Expectations met. */
  found: boolean;
  /** Expectations that matched (strings as given, RegExps as `/src/flags`). */
  matched: string[];
  /** Expectations that did not match. */
  missing: string[];
  /** About 120 characters of normalised text around the first match. */
  snippet?: string;
  /** FNV-1a 64-bit hash (16 hex chars) of the normalised extracted text. */
  contentHash?: string;
  /** Only when `prevHash` was given: whether `contentHash` differs from it. */
  changedSince?: boolean;
  /** Body bytes read. */
  bytes?: number;
  /** The body was cut at `maxBytes`. */
  truncated?: boolean;
  /** Wall time for the check, including retries. */
  ms?: number;
  error?: WatchError;
  /** Only when `error` is `"tls"`. */
  tlsKind?: TlsKind;
  /** Raw error code or a human-readable reason. */
  detail?: string;
  /** PDFs only: extraction quality signals. @since 1.2.0 */
  pdfQuality?: PdfQuality;
}

/** Extraction quality signals for a PDF. @since 1.2.0 */
export interface PdfQuality {
  /** U+FFFD characters (glyphs without a usable Unicode mapping) that could not be recovered and were dropped. */
  replacementChars: number;
  /** The legacy Nepali ASCII font family that drew a real share of the text (pick a converter with it). */
  legacyFont?: string;
  /** Font names in the PDF, subset prefixes removed. */
  fonts?: string[];
  /** Images drawn on the pages. */
  images?: number;
  /** Images but no text: a scan that needs OCR. */
  imageOnly?: boolean;
  /** Most text is an invisible layer over images (a scanner's OCR), often unreliable for Devanagari. */
  ocrLayer?: boolean;
}

/** Options for {@link check} and {@link checkAll}. */
export interface CheckOptions {
  /** Per-attempt timeout covering connect + body. Default 15000. */
  timeoutMs?: number;
  /** Stop reading the body after this many bytes. Default 10 MB. */
  maxBytes?: number;
  /** User-Agent header. Default: a current desktop Chrome string. */
  userAgent?: string;
  /** A custom fetch (e.g. undici with a CA bundle, a proxy, or a test fake). Default: global `fetch`. */
  fetch?: typeof fetch;
  /** Extra request headers. */
  headers?: Record<string, string>;
  /** `checkAll` parallelism. Default 4. One request at a time per host regardless. */
  concurrency?: number;
  /** Extra attempts on timeout / 5xx / network errors. Default 1. */
  retries?: number;
  /** Wait between retries (ms). Default 500. */
  retryDelayMs?: number;
  /** HTML/text pages with less visible text than this are placeholders. Default 200. */
  minTextChars?: number;
  /**
   * Rewrite the extracted text before matching, e.g. Preeti → Unicode for legacy-font PDFs.
   * Expectations then match the transformed text OR the raw text, so a converter that garbles
   * English never hides an English or digit match. `contentHash` stays on the raw text.
   * An item's own `textTransform` wins over this one. @since 1.1.0
   */
  textTransform?: TextTransform;
  /** PDF extraction options. @since 1.2.0 */
  pdf?: {
    /**
     * Repair Devanagari from word-processor exports (broken ToUnicode maps, visually ordered
     * i-matras and rephs, U+FFFD i-matra variants). Default true.
     */
    fixDevanagari?: boolean;
  };
}

/** Context passed to a {@link TextTransform}. */
export interface TextTransformContext {
  id: string;
  url: string;
  kind: "html" | "pdf" | "text";
  /** PDFs: font names (subset prefixes removed). @since 1.2.0 */
  fonts?: string[];
  /** PDFs: the legacy Nepali ASCII font family used, e.g. to choose a converter. @since 1.2.0 */
  legacyFont?: string;
}

/** See {@link CheckOptions.textTransform}. */
export type TextTransform = (text: string, ctx: TextTransformContext) => string | Promise<string>;

/** Totals from {@link summarize}. */
export interface Summary {
  total: number;
  ok: number;
  failed: number;
  /** Results whose `changedSince` is true. */
  changed: number;
  byError: Partial<Record<WatchError, number>>;
}
