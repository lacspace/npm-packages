/** Money, digit and date helpers shared by the JSON-LD normaliser and heuristics. */

export interface Money {
  amount: number;
  currency: string;
}

/** Convert Devanagari digits (०-९) to ASCII. Keeps string length. */
export function asciiDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x0966));
}

/** Parse "1,23,456.50" / "1.234,50" / 1234 into a number. Returns null if not a number. */
export function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  let s = asciiDigits(v).replace(/[^\d.,-]/g, "");
  if (!/\d/.test(s)) return null;
  if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", "."); // 1.234,50
  else if (/^\d+,\d{1,2}$/.test(s)) s = s.replace(",", "."); // 12,50
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Map a currency symbol / word to ISO 4217. `rupee` decides what a bare "Rs." means. */
export function currencyCode(sym: string, rupee: "NPR" | "INR" = "NPR"): string | null {
  const s = sym.trim().replace(/\.$/, "").toUpperCase();
  if (s === "NPR" || s === "NRS" || s === "रु" || s === "रू" || s === "NEPALI RUPEES") return "NPR";
  if (s === "INR" || s === "₹" || s === "IRS" || s === "IC") return "INR";
  if (s === "RS" || s === "RS." || s === "RUPEES") return rupee;
  if (s === "USD" || s === "$" || s === "US$") return "USD";
  if (s === "EUR" || s === "€") return "EUR";
  if (s === "GBP" || s === "£") return "GBP";
  if (/^[A-Z]{3}$/.test(s)) return s;
  return null;
}

const CUR = String.raw`(?:NPR|NRs\.?|INR|Rs\.?|रु\.?|रू\.?|₹|USD|US\$|\$|EUR|€|GBP|£)`;
const NUM = String.raw`(\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?|\d+(?:\.\d{1,2})?)`;

/** Money mentions in a line: "Rs. 1,250.00", "NPR 999", "₹499", "$12.99", "1,250 NPR". */
export const MONEY_RE = new RegExp(String.raw`(${CUR})\s?${NUM}(?![\d,])|${NUM}\s?(NPR|INR|USD|EUR|GBP)\b`, "gi");

export function findMoney(line: string, rupee: "NPR" | "INR" = "NPR"): Array<Money & { index: number }> {
  const out: Array<Money & { index: number }> = [];
  const l = asciiDigits(line);
  for (const m of l.matchAll(MONEY_RE)) {
    const sym = m[1] ?? m[4] ?? "";
    const num = m[2] ?? m[3] ?? "";
    const currency = currencyCode(sym, rupee);
    const amount = parseAmount(num);
    if (currency && amount !== null) out.push({ amount, currency, index: m.index ?? 0 });
  }
  return out;
}

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2200) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** First calendar date in a string as YYYY-MM-DD (ISO, "14 Oct 2026", "Oct 14, 2026", "14/10/2026" as day/month). */
export function findDate(s: string): { date: string; index: number } | null {
  const t = asciiDigits(s);
  const cands: Array<{ date: string; index: number }> = [];
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(t);
  if (m) {
    const d = iso(+m[1]!, +m[2]!, +m[3]!);
    if (d) cands.push({ date: d, index: m.index });
  }
  m = /\b(\d{1,2})(?:st|nd|rd|th)?[\s-]+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?[\s,-]+(\d{4})\b/i.exec(t);
  if (m) {
    const d = iso(+m[3]!, MONTHS.indexOf(m[2]!.toLowerCase()) + 1, +m[1]!);
    if (d) cands.push({ date: d, index: m.index });
  }
  m = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i.exec(t);
  if (m) {
    const d = iso(+m[3]!, MONTHS.indexOf(m[1]!.toLowerCase()) + 1, +m[2]!);
    if (d) cands.push({ date: d, index: m.index });
  }
  m = /\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/.exec(t);
  if (m) {
    const d = iso(+m[3]!, +m[2]!, +m[1]!);
    if (d) cands.push({ date: d, index: m.index });
  }
  cands.sort((a, b) => a.index - b.index);
  return cands[0] ?? null;
}

/** First clock time as HH:MM (24h). */
export function findTime(s: string): string | null {
  const m = /\b(\d{1,2}):(\d{2})\s*([AaPp]\.?[Mm]\.?)?/.exec(asciiDigits(s));
  if (!m) return null;
  let h = +m[1]!;
  const min = +m[2]!;
  if (min > 59 || h > 23) return null;
  const ap = m[3]?.toLowerCase().replace(/\./g, "");
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
