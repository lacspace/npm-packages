/**
 * @lacspace/redact — detectors
 *
 * An extended, individually-toggleable set of PII/secret value detectors used
 * by {@link redactObject} and the enhanced string scrubbing. These are ADDITIVE
 * and never change the behaviour of the original {@link redactString}/{@link redact}
 * built-in patterns, which stay exactly as they were.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

const MASK = "•••";

/** Names of the extra detectors. Each can be turned on/off independently. */
export type DetectorName =
  | "creditCard"
  | "ssn"
  | "phone"
  | "email"
  | "ipv4"
  | "ipv6"
  | "jwt"
  | "awsAccessKey"
  | "githubToken"
  | "slackToken"
  | "stripeKey"
  | "privateKey"
  | "mac"
  | "iban";

/** Context passed to a detector's replacer so it can honour partial masking. */
export interface DetectorContext {
  /** Keep only the last N characters visible (partial masking). */
  partial: boolean;
  /** How many trailing characters to keep when `partial` is on. Default 4. */
  keepEnd: number;
  /** Character used for the masked portion when `partial` is on. Default "*". */
  maskChar: string;
}

export interface Detector {
  name: DetectorName;
  re: RegExp;
  /**
   * Optional validator. If present and it returns false for a raw match, the
   * match is LEFT UNTOUCHED (used to cut false positives — e.g. Luhn on cards).
   */
  validate?: (match: string) => boolean;
  /** Default replacement (full redaction). */
  replace: (match: string) => string;
  /** Optional partial-masking replacement (keep-last-N style). */
  partial?: (match: string, ctx: DetectorContext) => string;
}

/* ------------------------------------------------------------------ */
/* Validators                                                          */
/* ------------------------------------------------------------------ */

/** Luhn check — returns true only for a valid card checksum (12–19 digits). */
export function luhnValid(input: string): boolean {
  const digits = input.replace(/\D/g, "");
  if (digits.length < 12 || digits.length > 19) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

/** Every dotted octet is 0–255. */
function ipv4Valid(match: string): boolean {
  const parts = match.split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => {
    if (!/^\d{1,3}$/.test(p)) return false;
    const n = Number(p);
    return n >= 0 && n <= 255;
  });
}

/** IBAN mod-97 checksum (ISO 7064). */
export function ibanValid(match: string): boolean {
  const s = match.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(s)) return false;
  const rearranged = s.slice(4) + s.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const code = ch.charCodeAt(0);
    const val = code >= 65 && code <= 90 ? String(code - 55) : ch;
    for (const digit of val) {
      remainder = (remainder * 10 + (digit.charCodeAt(0) - 48)) % 97;
    }
  }
  return remainder === 1;
}

/* ------------------------------------------------------------------ */
/* Partial-masking helpers                                             */
/* ------------------------------------------------------------------ */

/**
 * Mask everything but the last `keepEnd` characters.
 * `maskKeepLast("4242424242424242", 4)` → `"************4242"`.
 */
export function maskKeepLast(value: string, keepEnd = 4, maskChar = "*"): string {
  const v = String(value);
  if (keepEnd <= 0) return maskChar.repeat(v.length);
  if (v.length <= keepEnd) return maskChar.repeat(v.length);
  return maskChar.repeat(v.length - keepEnd) + v.slice(v.length - keepEnd);
}

/**
 * Mask a card number keeping the last `keepEnd` digits, grouped in fours.
 * `maskCardNumber("4242424242424242")` → `"**** **** **** 4242"`.
 */
export function maskCardNumber(value: string, keepEnd = 4, maskChar = "*"): string {
  const digits = String(value).replace(/\D/g, "");
  const keep = digits.length <= keepEnd ? digits : digits.slice(digits.length - keepEnd);
  const masked = maskChar.repeat(Math.max(0, digits.length - keep.length));
  const merged = masked + keep;
  return merged.replace(/(.{4})(?=.)/g, "$1 ").trim();
}

/** Mask an email keeping the first character and the domain: `j***@example.com`. */
export function maskEmailPartial(email: string, maskChar = "*"): string {
  return String(email).replace(/^(.)([^@]*)(@.*)$/, (_m, a: string, b: string, c: string) => {
    const stars = maskChar.repeat(Math.max(3, b.length));
    return `${a}${stars}${c}`;
  });
}

/* ------------------------------------------------------------------ */
/* Detectors                                                           */
/* ------------------------------------------------------------------ */

const keepPrefix = (m: string, n: number) =>
  m.length <= n ? MASK : m.slice(0, n) + MASK;

/** The full extended detector set, keyed by name. Individually toggleable. */
export const DETECTORS: Detector[] = [
  {
    name: "privateKey",
    re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g,
    replace: () => "[REDACTED_PRIVATE_KEY]",
  },
  {
    name: "jwt",
    re: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g,
    replace: () => "[REDACTED_JWT]",
  },
  {
    name: "stripeKey",
    re: /\b(?:sk|pk|rk)_(?:live|test)_[A-Za-z0-9]{16,}\b/g,
    replace: (m) => keepPrefix(m, 8),
    partial: (m) => keepPrefix(m, 8),
  },
  {
    name: "githubToken",
    re: /\b(?:gh[posur]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})\b/g,
    replace: () => "[REDACTED_GITHUB_TOKEN]",
  },
  {
    name: "slackToken",
    re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g,
    replace: () => "[REDACTED_SLACK_TOKEN]",
  },
  {
    name: "awsAccessKey",
    re: /\b(?:AKIA|ASIA|AROA|AIDA|AGPA|ANPA|ANVA|AIPA)[0-9A-Z]{16}\b/g,
    replace: (m) => keepPrefix(m, 4),
    partial: (m) => keepPrefix(m, 4),
  },
  {
    name: "email",
    re: /([a-zA-Z0-9._%+-])[a-zA-Z0-9._%+-]*(@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g,
    replace: (m) => m.replace(/^(.)(.*)(@.*)$/, (_x, a, _b, c) => `${a}${MASK}${c}`),
    partial: (m, ctx) => maskEmailPartial(m, ctx.maskChar),
  },
  {
    name: "creditCard",
    re: /\b(?:\d[ -]?){13,19}\b/g,
    validate: (m) => luhnValid(m),
    replace: (m) => {
      const d = m.replace(/\D/g, "");
      return d.length <= 4 ? MASK : MASK + d.slice(d.length - 4);
    },
    partial: (m, ctx) => maskCardNumber(m, ctx.keepEnd, ctx.maskChar),
  },
  {
    name: "iban",
    re: /\b[A-Z]{2}\d{2}(?:[ ]?[A-Z0-9]{4}){2,7}(?:[ ]?[A-Z0-9]{1,3})?\b/g,
    validate: (m) => ibanValid(m),
    replace: (m) => keepPrefix(m.replace(/\s/g, ""), 4),
    partial: (m, ctx) => keepPrefix(m.replace(/\s/g, ""), 4),
  },
  {
    name: "ssn",
    re: /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g,
    replace: () => "[REDACTED_SSN]",
  },
  {
    name: "phone",
    re: /(?:\+[1-9]\d{7,14}\b|\b\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b)/g,
    replace: () => "[REDACTED_PHONE]",
  },
  {
    name: "mac",
    re: /\b(?:[0-9A-Fa-f]{2}[:-]){5}[0-9A-Fa-f]{2}\b/g,
    replace: () => "[REDACTED_MAC]",
  },
  {
    name: "ipv4",
    re: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
    validate: (m) => ipv4Valid(m),
    replace: (m) => m.replace(/\.\d+$/, ".•••"),
  },
  {
    name: "ipv6",
    re: /\b(?:[A-Fa-f0-9]{1,4}:){2,7}[A-Fa-f0-9]{1,4}\b|\b(?:[A-Fa-f0-9]{1,4}:){1,7}:(?:[A-Fa-f0-9]{1,4})?\b/g,
    replace: () => "[REDACTED_IPV6]",
  },
];

/** Lookup a detector by name. */
export const DETECTOR_MAP: Record<DetectorName, Detector> = DETECTORS.reduce(
  (acc, d) => {
    acc[d.name] = d;
    return acc;
  },
  {} as Record<DetectorName, Detector>,
);

/** All detector names (in evaluation order). */
export const DETECTOR_NAMES: DetectorName[] = DETECTORS.map((d) => d.name);
