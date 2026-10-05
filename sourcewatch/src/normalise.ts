import type { Expect } from "./types";

const DEV_DIGITS = /[\u0966-\u096F]/g;
const INVISIBLE = /[\u200B\u200C\u200D\u00AD\u2060\uFEFF]/g;
const SPACES = /[\s\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]+/g;
const DASHES = /[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g;

/**
 * Normalise text for matching and hashing: NFC, Devanagari digits (०-९) to 0-9,
 * zero-width joiners / soft hyphens / BOM removed, every Unicode space collapsed
 * to one ASCII space, all dash variants to "-", trimmed.
 */
export function normalise(text: string): string {
  let s = String(text ?? "");
  try {
    s = s.normalize("NFC");
  } catch {
    /* lone surrogates etc. */
  }
  return s
    .replace(DEV_DIGITS, (d) => String(d.charCodeAt(0) - 0x0966))
    .replace(INVISIBLE, "")
    .replace(DASHES, "-")
    .replace(SPACES, " ")
    .trim();
}

/** FNV-1a 64-bit over the UTF-8 bytes of `s`, as 16 lowercase hex chars. Sync and identical on every runtime. */
export function fnv1a64(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let hi = 0xcbf29ce4;
  let lo = 0x84222325;
  for (let i = 0; i < bytes.length; i++) {
    lo = (lo ^ bytes[i]!) >>> 0;
    // (hi:lo) * 0x100000001b3 mod 2^64 = (hi:lo) * 0x1b3 + ((hi:lo) << 40)
    const a = lo * 0x1b3;
    const carry = Math.floor(a / 4294967296);
    hi = (hi * 0x1b3 + carry + ((lo << 8) >>> 0)) % 4294967296;
    lo = a % 4294967296;
  }
  return (hi >>> 0).toString(16).padStart(8, "0") + (lo >>> 0).toString(16).padStart(8, "0");
}

export interface MatchOutcome {
  found: boolean;
  matched: string[];
  missing: string[];
  snippet?: string;
}

const isDigit = (c: string | undefined) => c !== undefined && c >= "0" && c <= "9";

/** Find a string expectation in normalised lowercased text; digit-edged needles need non-digit boundaries. */
function findString(hay: string, needle: string): number {
  if (!needle) return -1;
  const leadDigit = isDigit(needle[0]);
  const tailDigit = isDigit(needle[needle.length - 1]);
  let from = 0;
  for (;;) {
    const i = hay.indexOf(needle, from);
    if (i < 0) return -1;
    const before = hay[i - 1];
    const after = hay[i + needle.length];
    if ((!leadDigit || !isDigit(before)) && (!tailDigit || !isDigit(after))) return i;
    from = i + 1;
  }
}

/** Label for an expectation in `matched` / `missing`. */
export function expectLabel(e: string | RegExp): string {
  return typeof e === "string" ? e : String(e);
}

/**
 * Match expectations against already-normalised text.
 * Strings: normalised the same way, case-insensitive, number-edged strings match as whole numbers.
 * RegExps: run on the normalised text as given (global/sticky flags ignored).
 */
export function matchExpect(normText: string, expect: Expect, mode: "all" | "any" = "all"): MatchOutcome {
  const list = Array.isArray(expect) ? expect : [expect];
  const lower = normText.toLowerCase();
  const sameLen = lower.length === normText.length;
  const matched: string[] = [];
  const missing: string[] = [];
  let first: { i: number; len: number; src: string } | undefined;
  for (const e of list) {
    let at = -1;
    let len = 0;
    let src = normText;
    if (typeof e === "string") {
      const needle = normalise(e).toLowerCase();
      at = findString(lower, needle);
      len = needle.length;
      if (!sameLen) src = lower;
    } else if (e instanceof RegExp) {
      const re = new RegExp(e.source, e.flags.replace(/[gy]/g, ""));
      const m = re.exec(normText);
      if (m) {
        at = m.index;
        len = m[0].length;
      }
    }
    if (at >= 0) {
      matched.push(expectLabel(e));
      if (!first) first = { i: at, len, src };
    } else missing.push(expectLabel(e));
  }
  const found = mode === "any" ? matched.length > 0 || list.length === 0 : missing.length === 0;
  let snippet: string | undefined;
  if (first) {
    const pad = Math.max(0, Math.floor((120 - first.len) / 2));
    const s = Math.max(0, first.i - pad);
    const e = Math.min(first.src.length, first.i + first.len + pad);
    snippet = (s > 0 ? "…" : "") + first.src.slice(s, e).trim() + (e < first.src.length ? "…" : "");
  }
  return { found, matched, missing, snippet };
}
