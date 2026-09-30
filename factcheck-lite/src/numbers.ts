// Number, amount and percentage extraction — Latin + Devanagari, with South-Asian
// scale words (हजार/लाख/करोड/अरब/खरब) and Western ones (thousand/lakh/crore/million…).

const DEV_DIGITS = "०१२३४५६७८९";

/** Convert Devanagari digits in a string to ASCII digits. */
export function normalizeDigits(s: string): string {
  let out = "";
  for (const ch of s) {
    const d = DEV_DIGITS.indexOf(ch);
    out += d === -1 ? ch : String(d);
  }
  return out;
}

// Scale words → multiplier.
const SCALES: [RegExp, number][] = [
  [/\bthousand\b|\bhajar\b|हजार/gi, 1e3],
  [/\blakh\b|\blac\b|\blakhs\b|लाख/gi, 1e5],
  [/\bcrore\b|\bcrores\b|करोड/gi, 1e7],
  [/\barab\b|अरब|अर्ब/gi, 1e9],
  [/\bkharab\b|खर्ब|खरब/gi, 1e11],
  [/\bmillion\b|\bmn\b|मिलियन/gi, 1e6],
  [/\bbillion\b|\bbn\b|बिलियन/gi, 1e9],
  [/\btrillion\b/gi, 1e12],
];

const CURRENCY: [RegExp, string][] = [
  // रु must be its own token — never the रु inside पुरुष / गुरु — so require a
  // non-letter/non-mark before it.
  [/नेरु|\bNPR\b|(?<![\p{L}\p{M}])रु(?:पैयाँ|पैयां|\.)?|\bRs\.?\b/giu, "NPR"],
  [/\bINR\b|₹/g, "INR"],
  [/\bUSD\b|\bUS\$|\$/g, "USD"],
  [/\bEUR\b|€/g, "EUR"],
  [/\bGBP\b|£/g, "GBP"],
];

export type ClaimKind = "number" | "amount" | "percentage";

export interface NumericClaim {
  kind: ClaimKind;
  raw: string;
  /** Canonical numeric value (scale applied). */
  value: number;
  /** Currency code for amounts. */
  currency?: string;
  start: number;
  end: number;
}

// A number with optional grouping and decimals (ASCII after digit normalization).
const NUMBER_RE = /\d[\d,]*(?:\.\d+)?/g;

function parseGrouped(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

// Kill binary-float noise from scale multiplication (0.07 × 1e7 = 700000.0000000001).
function cleanFloat(n: number): number {
  const r = Math.round(n);
  if (Math.abs(n - r) < 1e-6) return r;
  return Math.round(n * 1e6) / 1e6;
}

function scaleAfter(text: string, from: number): { mult: number; end: number } {
  // Look at the ~16 chars following the number for a scale word.
  const window = text.slice(from, from + 16);
  for (const [re, mult] of SCALES) {
    re.lastIndex = 0;
    const m = re.exec(window);
    if (m && m.index <= 2) return { mult, end: from + m.index + m[0].length };
  }
  return { mult: 1, end: from };
}

function currencyNear(text: string, start: number, end: number): string | undefined {
  const before = text.slice(Math.max(0, start - 8), start);
  const after = text.slice(end, end + 6);
  for (const [re, code] of CURRENCY) {
    re.lastIndex = 0;
    if (re.test(before) || (re.lastIndex = 0, re.test(after))) return code;
  }
  return undefined;
}

/** Extract numbers, amounts and percentages with canonical values and offsets. */
export function extractNumeric(original: string): NumericClaim[] {
  const text = normalizeDigits(original);
  const out: NumericClaim[] = [];
  let m: RegExpExecArray | null;
  NUMBER_RE.lastIndex = 0;
  while ((m = NUMBER_RE.exec(text)) !== null) {
    const start = m.index;
    let end = start + m[0].length;
    let value = parseGrouped(m[0]);
    if (!Number.isFinite(value)) continue;
    const { mult, end: scaleEnd } = scaleAfter(text, end);
    if (mult !== 1) {
      value = cleanFloat(value * mult);
      end = scaleEnd;
    }
    // percentage?
    const tail = text.slice(end, end + 10);
    const pct = /^\s*(?:%|प्रतिशत|percent|per\s*cent)/i.exec(tail);
    const currency = currencyNear(text, start, end);
    let kind: ClaimKind = "number";
    let matchEnd = end;
    if (pct) {
      kind = "percentage";
      matchEnd = end + pct[0].length;
    } else if (currency) {
      kind = "amount";
    }
    out.push({
      kind,
      raw: original.slice(start, matchEnd).trim(),
      value: kind === "percentage" ? cleanFloat(parseGrouped(m[0]) * (mult !== 1 ? mult : 1)) : value,
      ...(kind === "amount" && currency ? { currency } : {}),
      start,
      end: matchEnd,
    });
  }
  return out;
}
