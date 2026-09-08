/**
 * Core type vocabulary for `@lacspace/moderation`.
 *
 * Everything here is dependency-free and duck-typed: an external moderation
 * model or classifier is supplied to the library as a plain async function
 * (see {@link ClassifyFn}), so the package works standalone and needs nothing
 * installed — or online — to run its tests.
 */

/** The kinds of personally-identifiable information {@link detectPii} recognises. */
export type PiiType =
  | "email"
  | "phone"
  | "ssn"
  | "credit-card"
  | "ipv4"
  | "ipv6"
  | "iban"
  | "api-key";

/** A single piece of PII located in a string. */
export interface PiiFinding {
  /** What kind of PII this is. */
  type: PiiType;
  /** The exact substring that matched (as it appears in the source). */
  value: string;
  /** Inclusive start offset into the source string (UTF-16 code units). */
  start: number;
  /** Exclusive end offset into the source string (UTF-16 code units). */
  end: number;
}

/** Options for {@link detectPii} / {@link hasPii}. */
export interface DetectPiiOptions {
  /** Restrict detection to these PII types. Default: all types. */
  types?: PiiType[];
}

/**
 * A mask for {@link redactPii}. Either a fixed replacement string, or a
 * function that receives each finding and returns its replacement.
 */
export type PiiMask = string | ((finding: PiiFinding) => string);

/** Options for {@link redactPii}. */
export interface RedactPiiOptions {
  /**
   * Replacement for each finding. Default `"[REDACTED_<TYPE>]"`
   * (e.g. `"[REDACTED_EMAIL]"`). A string is used verbatim; a function is
   * called per finding.
   */
  mask?: PiiMask;
  /** Restrict redaction to these PII types. Default: all types. */
  types?: PiiType[];
}

/** The result of {@link redactPii}. */
export interface RedactPiiResult {
  /** The input with every (selected) finding replaced by its mask. */
  text: string;
  /** The findings that were redacted, in source order. */
  findings: PiiFinding[];
}

/** The result of {@link detectPromptInjection}. */
export interface InjectionResult {
  /** `true` when the heuristic score crosses the flag threshold. */
  flagged: boolean;
  /** A rough `[0, 1]` suspicion score — heuristic, not a probability. */
  score: number;
  /** The human-readable pattern names that matched. */
  matches: string[];
}

/**
 * The normalised outcome of moderating a piece of text.
 *
 * `categories` is a boolean verdict per category; `scores` is the matching
 * `[0, 1]` severity per category. This shape is also what an injected
 * {@link ClassifyFn} must return, so a real moderation endpoint and the
 * built-in lexical scanner are interchangeable.
 */
export interface ModerationResult {
  /** `true` when any category is flagged. */
  flagged: boolean;
  /** Per-category boolean verdicts. */
  categories: Record<string, boolean>;
  /** Per-category `[0, 1]` severity scores. */
  scores: Record<string, number>;
}

/**
 * An **injected** classifier. Give it text, get back a {@link ModerationResult}.
 * Wrap an LLM or a hosted moderation endpoint with this shape and pass it to
 * {@link moderateText} — this package never bundles a model or requires a key.
 */
export type ClassifyFn = (text: string) => Promise<ModerationResult>;

/** Options for {@link moderateText}. */
export interface ModerateOptions {
  /**
   * An injected classifier. When present it fully replaces the built-in
   * lexical scan — use it to wrap a real moderation model or endpoint.
   */
  classify?: ClassifyFn;
  /** Restrict the built-in scan to these categories. Default: all categories. */
  categories?: string[];
  /**
   * Score at/above which a category is flagged, for the built-in scan.
   * Default `0.5`. Ignored when `classify` is supplied.
   */
  threshold?: number;
}

/**
 * A guardrail rule applied to model output by {@link guardOutput}.
 *
 * This is a discriminated union on `type`; some rules only report a violation,
 * while others (`noPii`, `maxLength`, `blocklist`) can also rewrite the output.
 */
export type OutputRule =
  /** Reject or redact any PII in the output. */
  | { type: "noPii"; redact?: boolean; mask?: PiiMask; types?: PiiType[] }
  /** Cap the output length; optionally truncate instead of only flagging. */
  | { type: "maxLength"; max: number; truncate?: boolean }
  /** Require the output to parse as JSON. */
  | { type: "mustBeJson" }
  /** Reject (or redact) any of these terms. */
  | {
      type: "blocklist";
      terms: string[];
      caseSensitive?: boolean;
      redact?: boolean;
      mask?: string;
    }
  /** Require the output to match this pattern (a `RegExp` or source string). */
  | { type: "allowlistRegex"; pattern: RegExp | string }
  /** Reject output that looks like it echoes a prompt-injection attempt. */
  | { type: "noPromptInjection"; threshold?: number };

/** The rule kinds, e.g. `"noPii"`. */
export type OutputRuleType = OutputRule["type"];

/** A single failed guardrail check. */
export interface Violation {
  /** The rule kind that failed. */
  rule: OutputRuleType;
  /** A human-readable explanation. */
  message: string;
  /** Whether the offending content was rewritten (redacted/truncated). */
  redacted: boolean;
  /** Optional diagnostic payload (matched terms, findings, score…). */
  details?: Record<string, unknown>;
}

/** The result of {@link guardOutput}. */
export interface GuardOutputResult {
  /** `true` when every rule passed. */
  ok: boolean;
  /** Every failed rule, in rule order. */
  violations: Violation[];
  /** The (possibly rewritten) output after redacting/truncating rules ran. */
  output: string;
}

/** Configuration for {@link createGuard}. */
export interface GuardConfig {
  /** Input-side (prompt) filtering. */
  input?: {
    /** Flag/block prompt-injection in user input. Default `false`. */
    blockPromptInjection?: boolean;
    /** Injection score threshold for `blockPromptInjection`. Default `0.5`. */
    injectionThreshold?: number;
    /**
     * Redact PII from user input before it reaches the model. Pass `true` for
     * defaults, or an options object to customise the mask/types.
     */
    redactPii?: boolean | RedactPiiOptions;
    /** Reject input containing any of these terms. */
    blocklist?: string[];
    /** Reject input longer than this many characters. */
    maxLength?: number;
  };
  /** Output-side rules, applied by {@link guardOutput}. */
  output?: OutputRule[];
}

/** The result of {@link Guard.checkInput}. */
export interface InputCheck {
  /** `true` when the input passed every check (nothing blocked). */
  ok: boolean;
  /** `true` when the input should be rejected outright. */
  blocked: boolean;
  /** The (possibly PII-redacted) input to forward to the model. */
  text: string;
  /** Every failed input check. */
  violations: Violation[];
  /** The prompt-injection analysis of the input (always computed). */
  injection: InjectionResult;
}

/** A composed input+output guard, produced by {@link createGuard}. */
export interface Guard {
  /** Screen and optionally redact user input before it reaches the model. */
  checkInput(text: string): InputCheck;
  /** Validate and optionally rewrite model output before you show/store it. */
  checkOutput(text: string): GuardOutputResult;
}
