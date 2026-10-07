import type { Delay, Step, TimeInput, Window } from "./types";
import { addCalendarDays, dateKey, isValidTimeZone, toMs, zonedParts, zonedToUtc } from "./tz";

const DAY_MS = 86_400_000;
const MON_FRI = [1, 2, 3, 4, 5];
/** How far ahead to look for an allowed slot before giving up. */
const MAX_SCAN_DAYS = 800;

export interface NormalizedWindow {
  days: boolean[];
  /** Business days for `delay.businessDays`: the window's days if set, else Mon–Fri. */
  business: boolean[];
  /** Start / end as ms after local midnight. */
  startMs: number;
  endMs: number;
  holidays: Set<string>;
}

/** "HH:MM" → minutes after midnight, or null when malformed. "24:00" is allowed. */
export function parseClock(s: unknown): number | null {
  if (typeof s !== "string") return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 24 || min > 59 || (h === 24 && min !== 0)) return null;
  return h * 60 + min;
}

function dayMask(list: number[]): boolean[] {
  const mask = [false, false, false, false, false, false, false];
  for (const d of list) if (Number.isInteger(d) && d >= 0 && d <= 6) mask[d] = true;
  return mask;
}

/** Resolve a Window to absolute bounds. Throws RangeError when it can never match. */
export function normalizeWindow(w: Window | undefined): NormalizedWindow | null {
  if (!w) return null;
  const startMin = w.start !== undefined ? parseClock(w.start) : w.startHour !== undefined ? w.startHour * 60 : 0;
  const endMin = w.end !== undefined ? parseClock(w.end) : w.endHour !== undefined ? w.endHour * 60 : 1440;
  if (startMin === null || !Number.isFinite(startMin) || startMin < 0 || startMin > 1440) {
    throw new RangeError(`Invalid window start: ${String(w.start ?? w.startHour)}`);
  }
  if (endMin === null || !Number.isFinite(endMin) || endMin < 0 || endMin > 1440) {
    throw new RangeError(`Invalid window end: ${String(w.end ?? w.endHour)}`);
  }
  if (endMin <= startMin) throw new RangeError("Window end must be after start");
  const days = w.days ? dayMask(w.days) : w.weekdaysOnly ? dayMask(MON_FRI) : dayMask([0, 1, 2, 3, 4, 5, 6]);
  if (!days.some(Boolean)) throw new RangeError("Window has no allowed days");
  return {
    days,
    business: w.days ? days : dayMask(MON_FRI),
    startMs: Math.round(startMin * 60_000),
    endMs: Math.round(endMin * 60_000),
    holidays: new Set(w.holidays ?? []),
  };
}

/** Delay with `delayHours` folded into `hours`. */
export function stepDelay(step: Step): Delay {
  const d = step.delay ?? {};
  const hours = (d.hours ?? 0) + (step.delayHours ?? 0);
  return { days: d.days ?? 0, hours, minutes: d.minutes ?? 0, businessDays: d.businessDays ?? 0 };
}

/** Add a delay without looking at the window (except for which days are business days). */
export function addDelay(baseMs: number, delay: Delay | undefined, nw: NormalizedWindow | null, tz: string): number {
  const d = delay ?? {};
  for (const [k, v] of Object.entries(d)) {
    if (v !== undefined && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) {
      throw new RangeError(`Invalid delay.${k}: ${String(v)}`);
    }
  }
  let t = baseMs;
  const biz = Math.floor(d.businessDays ?? 0);
  const days = d.days ?? 0;
  if (biz > 0 || days > 0) {
    const p = zonedParts(t, tz);
    const business = nw ? nw.business : dayMask(MON_FRI);
    const holidays = nw ? nw.holidays : new Set<string>();
    let offset = 0;
    let counted = 0;
    while (counted < biz) {
      offset++;
      const c = addCalendarDays(p.year, p.month, p.day, offset);
      if (business[c.weekday] && !holidays.has(dateKey(c.year, c.month, c.day))) counted++;
      if (offset > MAX_SCAN_DAYS * 4) throw new RangeError("No business days found");
    }
    const wholeDays = Math.floor(days);
    const c = addCalendarDays(p.year, p.month, p.day, offset + wholeDays);
    t = zonedToUtc(tz, c.year, c.month, c.day, p.hour, p.minute, p.second, p.ms);
    t += (days - wholeDays) * DAY_MS;
  }
  t += (d.hours ?? 0) * 3_600_000 + (d.minutes ?? 0) * 60_000;
  return Math.round(t);
}

/** Earliest instant ≥ t that is inside the window (t itself when there is no window). */
export function fitToWindow(t: number, nw: NormalizedWindow | null, tz: string): number {
  if (!nw) return t;
  const p = zonedParts(t, tz);
  for (let i = 0; i <= MAX_SCAN_DAYS; i++) {
    const c = addCalendarDays(p.year, p.month, p.day, i);
    if (!nw.days[c.weekday] || nw.holidays.has(dateKey(c.year, c.month, c.day))) continue;
    const start = zonedToUtc(tz, c.year, c.month, c.day, 0, 0, 0, nw.startMs);
    if (i > 0) return start;
    const end = zonedToUtc(tz, c.year, c.month, c.day, 0, 0, 0, nw.endMs);
    if (t < start) return start;
    if (t < end) return t;
  }
  throw new RangeError("No allowed send time in the window within the next 800 days");
}

export function resolveTz(...candidates: Array<string | undefined>): string {
  for (const c of candidates) if (c !== undefined && isValidTimeZone(c)) return c;
  return "UTC";
}

/**
 * When a step runs: `after` + delay, then moved forward into the window in `tz`.
 * Business days and days move the local date and keep the local time of day;
 * hours and minutes are elapsed time. Returns an ISO string.
 */
export function scheduleStep(after: TimeInput, delay: Delay | undefined, window: Window | undefined, tz: string): string {
  const zone = resolveTz(tz);
  const nw = normalizeWindow(window);
  return new Date(fitToWindow(addDelay(toMs(after), delay, nw, zone), nw, zone)).toISOString();
}

/** Deterministic 32-bit hash (FNV-1a + murmur3 finaliser). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** Jitter in ms, in [0, jitterMinutes), whole seconds, seeded by (enrollmentId, stepId). */
export function jitterMs(enrollmentId: string, stepId: string, jitterMinutes: number | undefined): number {
  if (!jitterMinutes || !Number.isFinite(jitterMinutes) || jitterMinutes <= 0) return 0;
  const frac = hash32(`${enrollmentId}\u0000${stepId}`) / 4_294_967_296;
  return Math.floor(frac * jitterMinutes * 60) * 1000;
}

/** End of the window session that contains `t` (Infinity with no window). */
export function windowEndAt(t: number, nw: NormalizedWindow | null, tz: string): number {
  if (!nw) return Infinity;
  const p = zonedParts(t, tz);
  return zonedToUtc(tz, p.year, p.month, p.day, 0, 0, 0, nw.endMs);
}
