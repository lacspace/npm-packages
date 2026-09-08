/**
 * Deterministic, dependency-free PII detection and redaction.
 *
 * Detectors are regular-expression based with light validation (Luhn for card
 * numbers, length checks for cards/IBANs). Matches from higher-priority types
 * claim their span first, so a credit-card number is never also reported as a
 * phone number.
 */

import type {
  DetectPiiOptions,
  PiiFinding,
  PiiMask,
  PiiType,
  RedactPiiOptions,
  RedactPiiResult,
} from "./types";

/** All PII types, in overlap-resolution priority order (first wins). */
export const PII_TYPES: readonly PiiType[] = [
  "email",
  "api-key",
  "iban",
  "credit-card",
  "ipv6",
  "ipv4",
  "ssn",
  "phone",
];

interface Detector {
  type: PiiType;
  regex: RegExp;
  /** Optional post-match validation; return the accepted value or `null`. */
  validate?: (match: string) => boolean;
}

/** Luhn checksum — used to weed out random digit runs from real card numbers. */
export function luhnValid(digits: string): boolean {
  if (!/^\d+$/.test(digits)) return false;
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const DETECTORS: Detector[] = [
  {
    type: "email",
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  },
  {
    // Common vendor key shapes: OpenAI, GitHub, AWS access-key id, Google, Stripe, Slack.
    type: "api-key",
    regex:
      /\b(?:sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{36}|gho_[A-Za-z0-9]{36}|github_pat_[A-Za-z0-9_]{22,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35}|xox[baprs]-[0-9A-Za-z-]{10,})\b/g,
  },
  {
    type: "iban",
    regex: /\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/g,
    validate: (m) => m.length >= 15 && m.length <= 34,
  },
  {
    // 13–19 digits, optionally split by single spaces or hyphens, then Luhn.
    type: "credit-card",
    regex: /\b\d(?:[ -]?\d){12,18}\b/g,
    validate: (m) => {
      const digits = m.replace(/[ -]/g, "");
      return digits.length >= 13 && digits.length <= 19 && luhnValid(digits);
    },
  },
  {
    type: "ipv6",
    regex:
      /\b(?:[A-Fa-f0-9]{1,4}:){7}[A-Fa-f0-9]{1,4}\b|\b(?:[A-Fa-f0-9]{1,4}:){1,7}:(?:[A-Fa-f0-9]{1,4}:){0,6}[A-Fa-f0-9]{1,4}\b/g,
    validate: (m) => m.includes(":") && m.replace(/[^:]/g, "").length >= 2,
  },
  {
    type: "ipv4",
    regex: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g,
  },
  {
    type: "ssn",
    regex: /\b\d{3}[- ]\d{2}[- ]\d{4}\b/g,
  },
  {
    // E.164 and common US groupings.
    type: "phone",
    regex:
      /\+[1-9]\d{7,14}\b|\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/g,
  },
];

const PRIORITY: Record<PiiType, number> = {
  email: 8,
  "api-key": 7,
  iban: 6,
  "credit-card": 5,
  ipv6: 4,
  ipv4: 3,
  ssn: 2,
  phone: 1,
};

function overlaps(a: PiiFinding, b: PiiFinding): boolean {
  return a.start < b.end && b.start < a.end;
}

/**
 * Find every piece of PII in `text`. Findings never overlap; when candidate
 * spans collide, the higher-priority type (email > api-key > iban >
 * credit-card > ipv6 > ipv4 > ssn > phone) keeps the span. Results are returned
 * in source order.
 */
export function detectPii(text: string, opts: DetectPiiOptions = {}): PiiFinding[] {
  const allow = opts.types ? new Set(opts.types) : null;
  const candidates: PiiFinding[] = [];

  for (const det of DETECTORS) {
    if (allow && !allow.has(det.type)) continue;
    det.regex.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = det.regex.exec(text)) !== null) {
      const value = m[0];
      if (value.length === 0) {
        det.regex.lastIndex++;
        continue;
      }
      if (det.validate && !det.validate(value)) continue;
      candidates.push({
        type: det.type,
        value,
        start: m.index,
        end: m.index + value.length,
      });
    }
  }

  // Resolve overlaps: process by priority (desc), then longer, then earlier.
  candidates.sort(
    (a, b) =>
      PRIORITY[b.type] - PRIORITY[a.type] ||
      b.end - b.start - (a.end - a.start) ||
      a.start - b.start,
  );

  const accepted: PiiFinding[] = [];
  for (const c of candidates) {
    if (accepted.some((a) => overlaps(a, c))) continue;
    accepted.push(c);
  }

  accepted.sort((a, b) => a.start - b.start);
  return accepted;
}

/** `true` when `text` contains any PII (optionally restricted to `types`). */
export function hasPii(text: string, opts: DetectPiiOptions = {}): boolean {
  return detectPii(text, opts).length > 0;
}

function resolveMask(mask: PiiMask | undefined, finding: PiiFinding): string {
  if (typeof mask === "function") return mask(finding);
  if (typeof mask === "string") return mask;
  return `[REDACTED_${finding.type.toUpperCase().replace(/-/g, "_")}]`;
}

/**
 * Replace every PII finding in `text` with a mask (default
 * `"[REDACTED_<TYPE>]"`). Returns the redacted string plus the findings that
 * were removed. Redaction is applied right-to-left so offsets stay valid.
 */
export function redactPii(text: string, opts: RedactPiiOptions = {}): RedactPiiResult {
  const findings = detectPii(text, { types: opts.types });
  let out = text;
  for (let i = findings.length - 1; i >= 0; i--) {
    const f = findings[i]!;
    out = out.slice(0, f.start) + resolveMask(opts.mask, f) + out.slice(f.end);
  }
  return { text: out, findings };
}
