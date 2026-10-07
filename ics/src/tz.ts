/** Time-zone resolution: IANA via Intl, Windows names, VTIMEZONE rules, fixed offsets. */

/**
 * Windows time-zone IDs (as Outlook/Exchange write them in TZID) → IANA.
 * Mapped to CLDR's "territory 001" zone for each Windows ID.
 */
export const WINDOWS_TIMEZONES: Readonly<Record<string, string>> = Object.freeze({
  "UTC": "Etc/UTC",
  "Coordinated Universal Time": "Etc/UTC",
  "GMT Standard Time": "Europe/London",
  "Greenwich Standard Time": "Atlantic/Reykjavik",
  "W. Europe Standard Time": "Europe/Berlin",
  "Romance Standard Time": "Europe/Paris",
  "Central Europe Standard Time": "Europe/Budapest",
  "Central European Standard Time": "Europe/Warsaw",
  "E. Europe Standard Time": "Europe/Chisinau",
  "FLE Standard Time": "Europe/Kiev",
  "GTB Standard Time": "Europe/Bucharest",
  "Russian Standard Time": "Europe/Moscow",
  "Turkey Standard Time": "Europe/Istanbul",
  "Israel Standard Time": "Asia/Jerusalem",
  "Egypt Standard Time": "Africa/Cairo",
  "South Africa Standard Time": "Africa/Johannesburg",
  "W. Central Africa Standard Time": "Africa/Lagos",
  "E. Africa Standard Time": "Africa/Nairobi",
  "Morocco Standard Time": "Africa/Casablanca",
  "Arab Standard Time": "Asia/Riyadh",
  "Arabic Standard Time": "Asia/Baghdad",
  "Arabian Standard Time": "Asia/Dubai",
  "Iran Standard Time": "Asia/Tehran",
  "Afghanistan Standard Time": "Asia/Kabul",
  "Pakistan Standard Time": "Asia/Karachi",
  "West Asia Standard Time": "Asia/Tashkent",
  "India Standard Time": "Asia/Kolkata",
  "Sri Lanka Standard Time": "Asia/Colombo",
  "Nepal Standard Time": "Asia/Kathmandu",
  "Bangladesh Standard Time": "Asia/Dhaka",
  "Central Asia Standard Time": "Asia/Almaty",
  "Myanmar Standard Time": "Asia/Yangon",
  "SE Asia Standard Time": "Asia/Bangkok",
  "Singapore Standard Time": "Asia/Singapore",
  "China Standard Time": "Asia/Shanghai",
  "Taipei Standard Time": "Asia/Taipei",
  "W. Australia Standard Time": "Australia/Perth",
  "Tokyo Standard Time": "Asia/Tokyo",
  "Korea Standard Time": "Asia/Seoul",
  "Cen. Australia Standard Time": "Australia/Adelaide",
  "AUS Central Standard Time": "Australia/Darwin",
  "E. Australia Standard Time": "Australia/Brisbane",
  "AUS Eastern Standard Time": "Australia/Sydney",
  "New Zealand Standard Time": "Pacific/Auckland",
  "Hawaiian Standard Time": "Pacific/Honolulu",
  "Alaskan Standard Time": "America/Anchorage",
  "Pacific Standard Time": "America/Los_Angeles",
  "US Mountain Standard Time": "America/Phoenix",
  "Mountain Standard Time": "America/Denver",
  "Central Standard Time": "America/Chicago",
  "Central Standard Time (Mexico)": "America/Mexico_City",
  "Canada Central Standard Time": "America/Regina",
  "Eastern Standard Time": "America/New_York",
  "US Eastern Standard Time": "America/Indianapolis",
  "SA Pacific Standard Time": "America/Bogota",
  "Atlantic Standard Time": "America/Halifax",
  "Newfoundland Standard Time": "America/St_Johns",
  "E. South America Standard Time": "America/Sao_Paulo",
  "Argentina Standard Time": "America/Argentina/Buenos_Aires",
  "Pacific SA Standard Time": "America/Santiago",
});

const fmtCache = new Map<string, Intl.DateTimeFormat | null>();

function formatter(tz: string): Intl.DateTimeFormat | null {
  let f = fmtCache.get(tz);
  if (f !== undefined) return f;
  try {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hourCycle: "h23",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "numeric",
      second: "numeric",
    });
  } catch {
    f = null;
  }
  fmtCache.set(tz, f);
  return f;
}

/** True when the runtime's Intl knows this IANA zone name. */
export function isIanaZone(tz: string): boolean {
  return !!tz && formatter(tz) !== null;
}

/** Offset (ms, local − UTC) of an IANA zone at instant `t`. */
export function ianaOffset(tz: string, t: number): number {
  const f = formatter(tz);
  if (!f) return 0;
  const p: Record<string, number> = {};
  for (const part of f.formatToParts(new Date(t))) if (part.type !== "literal") p[part.type] = Number(part.value);
  const wall = Date.UTC(p.year!, p.month! - 1, p.day!, (p.hour ?? 0) % 24, p.minute ?? 0, p.second ?? 0);
  return wall - Math.floor(t / 1000) * 1000;
}

export type OffsetFn = (t: number) => number;

const DAY = 86_400_000;

/**
 * Convert a local wall time (encoded as a UTC epoch of its fields) to a UTC
 * instant. Non-existent times (spring-forward gap) use the offset before the
 * transition; ambiguous times (fall-back overlap) resolve to the first
 * occurrence — both per RFC 5545 §3.3.5.
 */
export function wallToUtc(wall: number, offset: OffsetFn): number {
  const before = offset(wall - DAY);
  const after = offset(wall + DAY);
  const candidates: number[] = [];
  for (const o of before === after ? [before] : [before, after]) {
    const t = wall - o;
    if (offset(t) === o) candidates.push(t);
  }
  if (candidates.length) return Math.min(...candidates);
  return wall - before;
}

/** Parse "+0545" / "-0500" / "+054500" to ms. */
export function parseUtcOffset(s: string): number | null {
  const m = /^([+-])(\d{2}):?(\d{2})(?::?(\d{2}))?$/.exec(s.trim());
  if (!m) return null;
  const v = (Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4] ?? 0)) * 1000;
  return m[1] === "-" ? -v : v;
}

// ---------- VTIMEZONE rules ----------

export interface TzObservance {
  kind: "STANDARD" | "DAYLIGHT";
  /** DTSTART local wall fields as epoch (UTC-encoded). */
  start: number;
  from: number;
  to: number;
  rrule?: string;
  rdates: number[];
}

const WEEKDAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

export function ruleOnset(rrule: string, year: number, startWall: number): number | null {
  const parts: Record<string, string> = {};
  for (const kv of rrule.split(";")) {
    const [k, v] = kv.split("=");
    if (k && v) parts[k.toUpperCase()] = v.toUpperCase();
  }
  if (parts.FREQ !== "YEARLY") return null;
  const d0 = new Date(startWall);
  const month = parts.BYMONTH ? Number(parts.BYMONTH.split(",")[0]) - 1 : d0.getUTCMonth();
  const tod = startWall - Date.UTC(d0.getUTCFullYear(), d0.getUTCMonth(), d0.getUTCDate());
  let day: number | null = null;
  const byday = parts.BYDAY?.split(",")[0];
  if (byday) {
    const bm = /^([+-]?\d{1,2})?(SU|MO|TU|WE|TH|FR|SA)$/.exec(byday);
    if (!bm) return null;
    const wd = WEEKDAYS.indexOf(bm[2]!);
    const n = bm[1] ? Number(bm[1]) : 0;
    const dim = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const firstWd = new Date(Date.UTC(year, month, 1)).getUTCDay();
    const firstMatch = 1 + ((wd - firstWd + 7) % 7);
    if (n > 0) day = firstMatch + (n - 1) * 7;
    else if (n < 0) {
      const lastWd = new Date(Date.UTC(year, month, dim)).getUTCDay();
      day = dim - ((lastWd - wd + 7) % 7) + (n + 1) * 7;
    } else if (parts.BYMONTHDAY) {
      const days = parts.BYMONTHDAY.split(",").map(Number);
      day = days.find((d) => new Date(Date.UTC(year, month, d)).getUTCDay() === wd) ?? null;
    } else day = firstMatch;
    if (day === null || day < 1 || day > dim) return null;
  } else if (parts.BYMONTHDAY) {
    day = Number(parts.BYMONTHDAY.split(",")[0]);
  } else day = d0.getUTCDate();
  if (!Number.isFinite(day)) return null;
  const onset = Date.UTC(year, month, day) + tod;
  if (onset < startWall) return null;
  if (parts.UNTIL) {
    const u = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?/.exec(parts.UNTIL);
    if (u && onset > Date.UTC(+u[1]!, +u[2]! - 1, +u[3]!, +(u[4] ?? 23), +(u[5] ?? 59), +(u[6] ?? 59)) + DAY) return null;
  }
  return onset;
}

/**
 * Build an offset function from VTIMEZONE observances. Supports DTSTART,
 * RDATE and yearly RRULEs with BYMONTH + BYDAY (`2SU`, `-1SU`) or
 * BYMONTHDAY + BYDAY. With no usable rule it falls back to the first
 * observance's TZOFFSETTO (STANDARD preferred).
 */
export function vtimezoneOffset(obs: TzObservance[]): OffsetFn | null {
  if (!obs.length) return null;
  const fallback = (obs.find((o) => o.kind === "STANDARD") ?? obs[0]!).to;
  const cache = new Map<number, { at: number; to: number }[]>();
  const onsets = (year: number) => {
    let list = cache.get(year);
    if (list) return list;
    list = [];
    for (const o of obs) {
      const walls: number[] = [];
      if (o.rrule) {
        const w = ruleOnset(o.rrule, year, o.start);
        if (w !== null) walls.push(w);
      }
      if (new Date(o.start).getUTCFullYear() === year) walls.push(o.start);
      for (const r of o.rdates) if (new Date(r).getUTCFullYear() === year) walls.push(r);
      for (const w of walls) list.push({ at: w - o.from, to: o.to });
    }
    list.sort((a, b) => a.at - b.at);
    cache.set(year, list);
    return list;
  };
  return (t: number) => {
    const y = new Date(t).getUTCFullYear();
    let best: { at: number; to: number } | undefined;
    for (const yy of [y - 1, y, y + 1])
      for (const on of onsets(yy)) if (on.at <= t && (!best || on.at >= best.at)) best = on;
    if (best) return best.to;
    // Before any known onset: use the earliest observance's TZOFFSETFROM, else fallback.
    const earliest = [...obs].sort((a, b) => a.start - b.start)[0];
    return earliest ? earliest.from : fallback;
  };
}

export interface ZoneContext {
  /** Custom VTIMEZONE definitions from the calendar, keyed by TZID. */
  vtimezones?: Map<string, TzObservance[]>;
}

export interface ResolvedZone {
  /** IANA name if the TZID resolved to one. */
  iana?: string;
  offset: OffsetFn;
}

/**
 * Resolve a TZID: IANA name → Windows name → trailing IANA path of a
 * "/vendor/…/Area/City" style id → the calendar's VTIMEZONE → a "(UTC+05:45)"
 * style fixed offset. Returns null if nothing matches.
 */
export function resolveZone(tzid: string, ctx: ZoneContext = {}): ResolvedZone | null {
  const id = tzid.trim().replace(/^"|"$/g, "");
  if (!id) return null;
  const iana = (z: string): ResolvedZone => ({ iana: z, offset: (t) => ianaOffset(z, t) });
  if (!id.includes(" ") && isIanaZone(id)) return iana(id);
  const win = WINDOWS_TIMEZONES[id];
  if (win && isIanaZone(win)) return iana(win);
  if (id.includes("/")) {
    const segs = id.split("/").filter(Boolean);
    for (let k = Math.min(3, segs.length); k >= 1; k--) {
      const cand = segs.slice(-k).join("/");
      if (/^[A-Za-z_+-]+(\/[A-Za-z0-9_+-]+)+$/.test(cand) && isIanaZone(cand)) return iana(cand);
    }
  }
  const vt = ctx.vtimezones?.get(id);
  if (vt) {
    const fn = vtimezoneOffset(vt);
    if (fn) return { offset: fn };
  }
  const fixed = /(?:UTC|GMT)\s*([+-]\d{1,2}):?(\d{2})?/i.exec(id);
  if (fixed) {
    const h = Number(fixed[1]);
    const m = Number(fixed[2] ?? 0);
    const ms = (Math.abs(h) * 60 + m) * 60_000 * (fixed[1]!.startsWith("-") ? -1 : 1);
    return { offset: () => ms };
  }
  return null;
}

/** Local wall fields of instant `t` in an IANA zone, as a UTC-encoded epoch. */
export function utcToWall(t: number, tz: string): number {
  return t + ianaOffset(tz, t);
}
