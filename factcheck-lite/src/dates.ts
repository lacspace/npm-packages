import { normalizeDigits } from "./numbers.js";

export interface DateClaim {
  kind: "date";
  raw: string;
  /** ISO YYYY-MM-DD when fully resolved (AD only); else a normalized token. */
  value: string;
  /** "AD" or "BS" (Bikram Sambat). */
  calendar: "AD" | "BS";
  start: number;
  end: number;
}

const MONTHS: Record<string, number> = {
  january: 1, jan: 1, february: 2, feb: 2, march: 3, mar: 3, april: 4, apr: 4, may: 5,
  june: 6, jun: 6, july: 7, jul: 7, august: 8, aug: 8, september: 9, sep: 9, sept: 9,
  october: 10, oct: 10, november: 11, nov: 11, december: 12, dec: 12,
};

const pad = (n: number) => String(n).padStart(2, "0");

/** Extract AD and Bikram Sambat dates with offsets. */
export function extractDates(original: string): DateClaim[] {
  const text = normalizeDigits(original);
  const out: DateClaim[] = [];
  const push = (start: number, end: number, value: string, calendar: "AD" | "BS") =>
    out.push({ kind: "date", raw: original.slice(start, end).trim(), value, calendar, start, end });

  // ISO: 2026-09-30 or 2026/09/30
  for (const m of text.matchAll(/\b(\d{4})[-/](\d{1,2})[-/](\d{1,2})\b/g)) {
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    push(m.index!, m.index! + m[0].length, `${y}-${pad(mo)}-${pad(d)}`, y > 2200 ? "BS" : "AD");
  }
  // "30 September 2026" / "September 30, 2026" / "Sep 30 2026"
  for (const m of text.matchAll(/\b(\d{1,2})\s+([A-Za-z]+)\.?\s+(\d{4})\b/g)) {
    const mo = MONTHS[m[2]!.toLowerCase()];
    if (mo) push(m.index!, m.index! + m[0].length, `${Number(m[3])}-${pad(mo)}-${pad(Number(m[1]))}`, "AD");
  }
  for (const m of text.matchAll(/\b([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})\b/g)) {
    const mo = MONTHS[m[1]!.toLowerCase()];
    if (mo) push(m.index!, m.index! + m[0].length, `${Number(m[3])}-${pad(mo)}-${pad(Number(m[2]))}`, "AD");
  }
  // Bikram Sambat: a year 2000–2200 followed/preceded by साल/बि.सं/BS, or Nepali month names.
  for (const m of text.matchAll(/\b(\d{4})\s*(?:BS|B\.S\.|साल|वि\.?सं\.?|विक्रम)/gi)) {
    push(m.index!, m.index! + m[0].length, m[1]!, "BS");
  }
  for (const m of text.matchAll(/(?:BS|वि\.?सं\.?|विक्रम)\s*(\d{4})\b/gi)) {
    push(m.index!, m.index! + m[0].length, m[1]!, "BS");
  }
  // Deduplicate overlapping matches (keep the longest at each start).
  out.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: DateClaim[] = [];
  let lastEnd = -1;
  for (const d of out) {
    if (d.start >= lastEnd) {
      kept.push(d);
      lastEnd = d.end;
    }
  }
  return kept;
}
