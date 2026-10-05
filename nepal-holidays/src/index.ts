import { SATURDAYS_2083, SOURCE_2083, TERAI_21, Y2083 } from "./y2083.js";
import type { Holiday, Kind, RawEntry, Region, Scope, Source } from "./types.js";

export type { Category, Holiday, Kind, Region, Scope, Source, Text } from "./types.js";
export { TERAI_21 } from "./y2083.js";

const VERSION = "1.0.0";

interface YearData { startAD: [number, number, number]; months: number[]; rows: RawEntry[]; source: Source; saturdays: Record<number, number[]> }
const YEARS: Record<number, YearData> = {
  2083: { startAD: [2026, 4, 14], months: [31, 31, 32, 31, 31, 31, 30, 29, 30, 29, 30, 30], rows: Y2083, source: SOURCE_2083, saturdays: SATURDAYS_2083 },
};

/** BS years with an official list in this version. */
export const YEARS_AVAILABLE = Object.keys(YEARS).map(Number);

const DAY = 86_400_000;
const pad = (n: number) => String(n).padStart(2, "0");
const isoAD = (t: number) => new Date(t).toISOString().slice(0, 10);
const startOf = (y: YearData) => Date.UTC(y.startAD[0], y.startAD[1] - 1, y.startAD[2]);

/** BS → AD ("2026-10-17") for a year this package covers. */
export function bsToAD(year: number, month: number, day: number): string {
  const y = YEARS[year];
  if (!y) throw new RangeError(`@lacspace/nepal-holidays: no data for BS ${year} (have ${YEARS_AVAILABLE.join(", ")})`);
  if (month < 1 || month > 12 || day < 1 || day > y.months[month - 1]!) throw new RangeError(`@lacspace/nepal-holidays: no such date ${year}-${month}-${day}`);
  let off = day - 1;
  for (let m = 1; m < month; m++) off += y.months[m - 1]!;
  return isoAD(startOf(y) + off * DAY);
}

/** AD ("2026-10-17" or a Date, read as its UTC calendar day) → BS "2083-06-31", or null outside the covered years. */
export function adToBS(ad: string | Date): string | null {
  const t = typeof ad === "string" ? Date.parse(`${ad.slice(0, 10)}T00:00:00Z`) : Date.UTC(ad.getUTCFullYear(), ad.getUTCMonth(), ad.getUTCDate());
  for (const [yr, y] of Object.entries(YEARS)) {
    let off = Math.round((t - startOf(y)) / DAY);
    if (off < 0) continue;
    for (let m = 0; m < 12; m++) {
      if (off < y.months[m]!) return `${yr}-${pad(m + 1)}-${pad(off + 1)}`;
      off -= y.months[m]!;
    }
  }
  return null;
}

function build(year: number, r: RawEntry, y: YearData): Holiday {
  const h: Holiday = {
    id: r.id, name: { en: r.en, ne: r.ne }, kind: r.kind, category: r.cat, scope: r.scope,
    dateBS: r.bs ? `${year}-${pad(r.bs[0])}-${pad(r.bs[1])}` : null,
    dateAD: r.bs ? bsToAD(year, r.bs[0], r.bs[1]) : null,
    days: r.bs ? 1 : 0, section: r.sec, source: y.source,
  };
  if (r.region) h.region = r.region;
  if (r.region === "terai") h.districts = [...TERAI_21];
  if (r.districts) h.districts = [...r.districts];
  if (r.community) h.community = r.community;
  if (r.to) {
    h.endBS = `${year}-${pad(r.to[0])}-${pad(r.to[1])}`;
    h.endAD = bsToAD(year, r.to[0], r.to[1]);
    h.days = Math.round((Date.parse(h.endAD) - Date.parse(h.dateAD!)) / DAY) + 1;
  }
  return h;
}

export interface HolidayFilter {
  /** Only these scopes (default: all). */
  scope?: Scope | Scope[];
  /** Only this kind (default: all; "observance" days keep offices open). */
  kind?: Kind;
  /** Include entries the notice leaves undated (Eid, Bhoto Jatra…). Default true. */
  undated?: boolean;
  /** Keep regional holidays only if they apply to this district (English name) or region. */
  district?: string;
  region?: Region;
}

function matches(h: Holiday, f: HolidayFilter): boolean {
  if (f.undated === false && !h.dateAD) return false;
  if (f.kind && h.kind !== f.kind) return false;
  if (f.scope && !(Array.isArray(f.scope) ? f.scope : [f.scope]).includes(h.scope)) return false;
  if (h.scope === "regional" && (f.district || f.region)) {
    const d = f.district?.toLowerCase();
    const inTerai = !!d && TERAI_21.some((x) => x.toLowerCase() === d || (d.startsWith("nawalparasi") && x.startsWith("Nawalparasi")));
    if (h.region === "kathmandu-valley") return f.region === "kathmandu-valley" || ["kathmandu", "lalitpur", "bhaktapur"].includes(d ?? "");
    if (h.region === "terai") return f.region === "terai" || inTerai;
    if (h.region === "hill") return f.region === "hill" || (!!d && !inTerai);
    if (h.districts) return !!d && h.districts.some((x) => x.toLowerCase() === d);
  }
  return true;
}

/** Every holiday and observance of a BS year from the official notice, in date order (undated last). */
export function holidays(year: number, filter: HolidayFilter = {}): Holiday[] {
  const y = YEARS[year];
  if (!y) throw new RangeError(`@lacspace/nepal-holidays: no data for BS ${year} (have ${YEARS_AVAILABLE.join(", ")})`);
  return y.rows.map((r) => build(year, r, y)).filter((h) => matches(h, filter))
    .sort((a, b) => (a.dateAD ?? "9999").localeCompare(b.dateAD ?? "9999"));
}

const all = (f: HolidayFilter) => YEARS_AVAILABLE.flatMap((yr) => holidays(yr, f));

/** Holidays that cover an AD date ("2026-10-20" or a Date), including days inside Dashain/Tihar. */
export function holidaysOn(ad: string | Date, filter: HolidayFilter = {}): Holiday[] {
  const day = typeof ad === "string" ? ad.slice(0, 10) : isoAD(Date.UTC(ad.getUTCFullYear(), ad.getUTCMonth(), ad.getUTCDate()));
  return all(filter).filter((h) => h.dateAD && h.dateAD <= day && (h.endAD ?? h.dateAD) >= day);
}

/** Is this AD date a day off? Saturdays count; by default only national public holidays do. */
export function isHoliday(ad: string | Date, filter: HolidayFilter = { scope: "national" }): { holiday: boolean; saturday: boolean; holidays: Holiday[] } {
  const day = typeof ad === "string" ? ad.slice(0, 10) : isoAD(Date.UTC(ad.getUTCFullYear(), ad.getUTCMonth(), ad.getUTCDate()));
  const hs = holidaysOn(day, { ...filter, kind: "public-holiday" });
  const saturday = new Date(`${day}T00:00:00Z`).getUTCDay() === 6;
  return { holiday: saturday || hs.length > 0, saturday, holidays: hs };
}

/** The next n dated holidays on or after an AD date (default today, UTC). */
export function upcoming(from: string | Date = new Date(), n = 5, filter: HolidayFilter = {}): Holiday[] {
  const day = typeof from === "string" ? from.slice(0, 10) : isoAD(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  return all({ ...filter, undated: false }).filter((h) => (h.endAD ?? h.dateAD)! >= day).slice(0, n);
}

/** The official notice behind a year's list. */
export function source(year: number): Source | undefined {
  return YEARS[year]?.source;
}

/** @internal Saturday list printed in the notice (for verification). */
export function _printedSaturdays(year: number): Record<number, number[]> | undefined {
  return YEARS[year]?.saturdays;
}
/** @internal raw rows with printed weekdays (for verification). */
export function _rows(year: number): RawEntry[] | undefined {
  return YEARS[year]?.rows;
}

/** Machine-readable descriptor for an AI "conductor". */
export function describe() {
  return {
    name: "@lacspace/nepal-holidays",
    version: VERSION,
    years: YEARS_AVAILABLE,
    summary: "Nepal's official public holidays by BS year, transcribed from the Ministry of Home Affairs notice in Nepal Rajpatra: BS + AD dates, en/ne names, kind (public-holiday/observance), scope (national/regional/community/women/education/disability), districts, multi-day Dashain/Tihar ranges, undated lunar holidays kept as null. Pure JS, no dependencies.",
    commands: [
      { name: "holidays", input: { type: "object", properties: { year: { type: "integer" }, scope: { type: "string" }, kind: { enum: ["public-holiday", "observance"] }, district: { type: "string" } }, required: ["year"] }, output: "Holiday[]" },
      { name: "holidaysOn", input: { type: "object", properties: { date: { type: "string", description: "AD YYYY-MM-DD" } }, required: ["date"] }, output: "Holiday[]" },
      { name: "isHoliday", input: { type: "object", properties: { date: { type: "string" } }, required: ["date"] }, output: "{ holiday, saturday, holidays }" },
      { name: "upcoming", input: { type: "object", properties: { from: { type: "string" }, n: { type: "integer" } } }, output: "Holiday[]" },
    ],
  };
}
