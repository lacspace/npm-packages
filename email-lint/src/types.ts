/** Every rule id this package can raise. Ids are stable across minor versions. */
export type RuleId =
  // size
  | "html.too_large"
  | "attachment.large"
  | "attachment.risky_type"
  // content
  | "text.missing_plain"
  | "images.only"
  | "images.high_ratio"
  | "images.missing_alt"
  | "images.no_dimensions"
  | "links.text_mismatch"
  | "links.shortener"
  | "links.ip_address"
  | "links.http_insecure"
  | "links.too_many"
  | "links.javascript"
  | "links.empty"
  // subject
  | "subject.missing"
  | "subject.too_long"
  | "subject.all_caps"
  | "subject.excess_punctuation"
  | "subject.spammy"
  | "subject.fake_reply"
  | "subject.emoji_heavy"
  // body
  | "body.spammy_phrases"
  | "body.all_caps_ratio"
  | "body.excess_exclamation"
  | "body.hidden_text"
  // css / clients
  | "css.script"
  | "css.external_stylesheet"
  | "css.import"
  | "css.layout_unsupported"
  | "css.background_image"
  | "html.form"
  | "html.embed"
  | "svg.inline"
  | "images.base64"
  // compliance (bulk only)
  | "bulk.no_unsubscribe"
  | "bulk.no_one_click"
  | "bulk.no_postal_address"
  // other
  | "from.noreply"
  | "preheader.missing"
  | "html.malformed";

export type Severity = "error" | "warn" | "info";

/** A per-rule override: turn it off or force a severity. */
export type RuleSetting = "off" | Severity;

export type Locale = "en" | "ne";

export type Grade = "good" | "fair" | "poor";

export interface Attachment {
  filename: string;
  /** Size in bytes. */
  size: number;
  contentType?: string;
}

export interface LintInput {
  /** The HTML part. */
  html?: string;
  /** The plain-text part. */
  text?: string;
  /** Subject rules run only when this is passed (an empty string counts as missing). */
  subject?: string;
  /** Preview text shown after the subject in the inbox. */
  preheader?: string;
  /** The From address, e.g. `"News <news@example.com>"`. */
  from?: string;
  /** Message headers. Names match case-insensitively. */
  headers?: Record<string, string | string[]>;
  attachments?: Attachment[];
  /** Campaign / bulk mail. Turns on the compliance rules. */
  bulk?: boolean;
}

export interface LintOptions {
  /** Bulk mode: run the unsubscribe and compliance rules. Defaults to `input.bulk`. */
  requireUnsubscribe?: boolean;
  /** Turn rules off or change their severity, keyed by rule id. */
  rules?: Partial<Record<string, RuleSetting>>;
  /** Language of `message` and `fix`. Nepali covers the main rules and falls back to English. */
  locale?: Locale;
}

export interface Issue {
  /** The rule id. */
  id: string;
  severity: Severity;
  /** What is wrong, in plain words. */
  message: string;
  /** What to do about it. */
  fix?: string;
  /** Email clients known to be affected, only where that is well established. */
  clients?: string[];
  /** How many times it was found. */
  count?: number;
  /** A short example of what was found. */
  sample?: string;
}

export interface LintStats {
  /** UTF-8 size of the HTML part in bytes (0 when there is no HTML). */
  sizeBytes: number;
  /** Content images. 1x1 / 2x2 tracking pixels are not counted. */
  imageCount: number;
  /** Links with an href (from the HTML, or URLs in the text part when there is no HTML). */
  linkCount: number;
  /** Visible words per content image: `wordCount / max(imageCount, 1)`, 2 decimals. */
  textToImageRatio: number;
  /** Characters of visible text (whitespace collapsed). */
  textChars: number;
  /** Visible words. */
  wordCount: number;
}

export interface LintResult {
  /** 0–100. 100 means no issues were found. */
  score: number;
  grade: Grade;
  /** Sorted errors first, then warnings, then info. */
  issues: Issue[];
  stats: LintStats;
}

export interface RuleMeta {
  /** The default severity. A few rules escalate (see `escalates`). */
  severity: Severity;
  description: string;
  /** Only runs in bulk mode. */
  bulkOnly?: boolean;
  /** Clients known to be affected. */
  clients?: string[];
  /** When the rule can raise a different severity than the default, and why. */
  escalates?: string;
}
