/** Human-readable slot proposals using Intl. */

import type { Interval } from "./slots";
import { isValidTimeZone } from "./tz";

export interface ProposeOptions {
  timezone: string;
  /** Maximum slots to mention. Default 3. */
  limit?: number;
  /** "en" (default) or "ne" (Nepali, if the runtime's Intl has it; otherwise English). */
  locale?: string;
  /** "list" (one per line, default) or "sentence". */
  style?: "list" | "sentence";
  /** Override the zone label shown in brackets, e.g. "Kathmandu time". */
  zoneLabel?: string;
}

/** Abbreviations Intl doesn't produce for `en` (it prints GMT+x instead). */
const ZONE_ABBR: Record<string, string> = {
  "Asia/Kathmandu": "NPT",
  "Asia/Katmandu": "NPT",
  "Asia/Kolkata": "IST",
  "Asia/Calcutta": "IST",
  "Asia/Tokyo": "JST",
  "Asia/Singapore": "SGT",
  "Asia/Dubai": "GST",
  "Asia/Shanghai": "CST",
  "Asia/Hong_Kong": "HKT",
  UTC: "UTC",
  "Etc/UTC": "UTC",
};

function supported(locale: string): boolean {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([locale]).length > 0;
  } catch {
    return false;
  }
}

/** The locale actually used: "ne-NP" when requested and supported, else "en-GB". */
export function resolveLocale(locale: string | undefined): "ne-NP" | "en-GB" {
  if (typeof locale === "string" && /^ne\b/i.test(locale) && supported("ne-NP")) return "ne-NP";
  return "en-GB";
}

function shortZoneName(ms: number, timeZone: string, locale: string): string {
  try {
    const p = new Intl.DateTimeFormat(locale, { timeZone, timeZoneName: "short" }).formatToParts(new Date(ms));
    return p.find((x) => x.type === "timeZoneName")?.value ?? "";
  } catch {
    return "";
  }
}

/** Short zone label for an instant, e.g. "NPT", "BST", "EDT", or "GMT+5:45" as a last resort. */
export function zoneLabel(ms: number, timeZone: string, locale = "en"): string {
  if (resolveLocale(locale) === "ne-NP" && (timeZone === "Asia/Kathmandu" || timeZone === "Asia/Katmandu")) return "नेपाल समय";
  const fixed = ZONE_ABBR[timeZone];
  if (fixed) return fixed;
  const us = shortZoneName(ms, timeZone, "en-US");
  if (us && !/^(GMT|UTC)[+-]/.test(us)) return us;
  const gb = shortZoneName(ms, timeZone, "en-GB");
  if (gb && !/^(GMT|UTC)[+-]/.test(gb)) return gb;
  const au = shortZoneName(ms, timeZone, "en-AU");
  if (au && !/^(GMT|UTC)[+-]/.test(au)) return au;
  return us || gb || timeZone;
}

interface Parts {
  date: string;
  time: string;
  key: string;
}

function fmt(ms: number, timeZone: string, locale: string): Parts {
  const p = new Intl.DateTimeFormat(locale, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ms));
  const g = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  const k = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
  return { date: `${g("weekday")} ${g("day")} ${g("month")}`, time: `${g("hour")}:${g("minute")}`, key: k };
}

function joinOr(items: string[], locale: string): string {
  try {
    return new Intl.ListFormat(locale, { style: "long", type: "disjunction" }).format(items);
  } catch {
    if (items.length <= 1) return items.join("");
    return items.slice(0, -1).join(", ") + " or " + items[items.length - 1];
  }
}

/**
 * Format slots for an email, e.g. "Tue 14 Oct, 10:00–10:30 (NPT)".
 * Returns "" when there is nothing valid to show.
 */
export function proposeText(slots: Interval[], opts: ProposeOptions): string {
  if (!Array.isArray(slots) || !opts || !isValidTimeZone(opts.timezone)) return "";
  const tz = opts.timezone;
  const loc = resolveLocale(opts.locale);
  const limit = Number(opts.limit) > 0 ? Math.floor(Number(opts.limit)) : 3;
  const items: Array<{ range: string; short: string; label: string }> = [];
  for (const s of slots) {
    if (items.length >= limit) break;
    const a = Date.parse(s?.start);
    const b = Date.parse(s?.end);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a) continue;
    const pa = fmt(a, tz, loc);
    const pb = fmt(b, tz, loc);
    const label = typeof opts.zoneLabel === "string" && opts.zoneLabel ? opts.zoneLabel : zoneLabel(a, tz, loc);
    const range = pa.key === pb.key ? `${pa.date}, ${pa.time}–${pb.time}` : `${pa.date}, ${pa.time} – ${pb.date}, ${pb.time}`;
    const short = pa.key === pb.key ? `${pa.date} ${pa.time}–${pb.time}` : `${pa.date} ${pa.time} – ${pb.date} ${pb.time}`;
    items.push({ range, short, label });
  }
  if (items.length === 0) return "";
  if (opts.style === "sentence") {
    const first = items[0]!.label;
    const sameLabel = items.every((i) => i.label === first);
    const parts = items.map((i) => (sameLabel ? i.short : `${i.short} (${i.label})`));
    return sameLabel ? `${joinOr(parts, loc)} (${first})` : joinOr(parts, loc);
  }
  return items.map((i) => `${i.range} (${i.label})`).join("\n");
}
