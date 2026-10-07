import { parseContentLine, splitTextList, unescapeText, unfold, type ContentLine } from "./text";
import { parseUtcOffset, resolveZone, wallToUtc, type TzObservance, type ZoneContext } from "./tz";

export interface IcsPerson {
  name?: string;
  address: string;
}

export interface IcsAttendee extends IcsPerson {
  role?: string;
  partstat?: string;
  rsvp?: boolean;
  cutype?: string;
}

export interface IcsAlarm {
  action: string;
  /** Raw TRIGGER value, e.g. "-PT15M" or "20261010T090000Z". */
  trigger: string;
  description?: string;
}

export interface IcsEvent {
  /** UID; "" when the event has none (never generated on parse). */
  uid: string;
  sequence: number;
  summary?: string;
  description?: string;
  location?: string;
  url?: string;
  /** ISO 8601 UTC ("…Z") for timed events, "YYYY-MM-DD" for all-day; "" if DTSTART is missing/invalid. */
  start: string;
  /** DTEND, or DTSTART + DURATION, or start + 1 day (all-day) / start (timed) when neither is present. */
  end?: string;
  allDay: boolean;
  startTzid?: string;
  endTzid?: string;
  /** Raw DURATION value when present. */
  duration?: string;
  organizer: IcsPerson | null;
  attendees: IcsAttendee[];
  /** Raw RRULE value (not expanded). */
  rrule?: string;
  exdate?: string[];
  rdate?: string[];
  recurrenceId?: string;
  status?: string;
  transp?: string;
  created?: string;
  lastModified?: string;
  dtstamp?: string;
  categories?: string[];
  /** Video-call URL: X-GOOGLE-CONFERENCE, Teams/Skype X- props, CONFERENCE, or a Meet/Teams/Zoom link in the text. */
  conference?: string;
  alarms: IcsAlarm[];
  /** Every property of the VEVENT (upper-cased name) → raw values as they appear in the file (unfolded, still escaped). */
  raw: Record<string, string[]>;
}

export interface IcsCalendar {
  method?: string;
  prodId?: string;
  events: IcsEvent[];
  /** TZIDs of the VTIMEZONE blocks present. */
  timezones: string[];
}

export interface ParseOptions {
  /**
   * IANA zone for floating times (DATE-TIME with neither "Z" nor TZID) and for
   * TZIDs that cannot be resolved. Default: treat them as UTC.
   */
  defaultTimeZone?: string;
}

export interface ParsedDateTime {
  /** ISO UTC "YYYY-MM-DDTHH:MM:SSZ", or "YYYY-MM-DD" for DATE values. */
  value: string;
  allDay: boolean;
  /** TZID parameter as written, if any. */
  tzid?: string;
  /** True for a floating local time (no Z, no TZID). */
  floating: boolean;
  /** Epoch ms (UTC midnight for DATE values). */
  epoch: number;
}

type Params = Record<string, string | string[] | undefined>;

function param(params: Params | undefined, name: string): string | undefined {
  if (!params) return undefined;
  const v = params[name] ?? params[name.toUpperCase()] ?? params[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

export function isoUtc(t: number): string {
  return new Date(t).toISOString().replace(/\.\d{3}Z$/, "Z");
}

export function isoDate(t: number): string {
  return new Date(t).toISOString().slice(0, 10);
}

interface DateContext extends ZoneContext {
  defaultTimeZone?: string;
}

/**
 * Parse a DATE or DATE-TIME value. `params` are the property parameters
 * (`TZID`, `VALUE`). TZID is resolved as IANA → Windows name → VTIMEZONE
 * (via `opts.vtimezones`) → fixed "(UTC+hh:mm)" → `opts.defaultTimeZone` →
 * UTC. Returns null for unparseable values.
 */
export function parseDateTime(
  value: string,
  params?: Params,
  opts: DateContext = {},
): ParsedDateTime | null {
  const v = value.trim();
  const m = /^(\d{4})-?(\d{2})-?(\d{2})(?:T(\d{2}):?(\d{2}):?(\d{2})?(?:\.\d+)?(Z)?)?$/i.exec(v);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const tzid = param(params, "TZID")?.trim() || undefined;
  if (m[4] === undefined || param(params, "VALUE")?.toUpperCase() === "DATE") {
    const epoch = Date.UTC(y, mo - 1, d);
    return { value: isoDate(epoch), allDay: true, floating: false, epoch, ...(tzid ? { tzid } : {}) };
  }
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6] ?? 0);
  if (h > 24 || mi > 59 || s > 60) return null;
  const wall = Date.UTC(y, mo - 1, d, h, mi, Math.min(s, 59));
  if (!Number.isFinite(wall)) return null;
  if (m[7]) return { value: isoUtc(wall), allDay: false, floating: false, epoch: wall };
  let zone = tzid ? resolveZone(tzid, opts) : null;
  if (!zone && opts.defaultTimeZone) zone = resolveZone(opts.defaultTimeZone, opts);
  const epoch = zone ? wallToUtc(wall, zone.offset) : wall;
  return { value: isoUtc(epoch), allDay: false, floating: !tzid, epoch, ...(tzid ? { tzid } : {}) };
}

// ---------- duration ----------

interface Dur {
  sign: 1 | -1;
  days: number;
  ms: number;
}

export function parseDuration(s: string): Dur | null {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/i.exec(s.trim());
  if (!m || s.trim().replace(/^[+-]/, "").toUpperCase() === "P" || /T$/i.test(s.trim())) return null;
  return {
    sign: m[1] === "-" ? -1 : 1,
    days: Number(m[2] ?? 0) * 7 + Number(m[3] ?? 0),
    ms: (Number(m[4] ?? 0) * 3600 + Number(m[5] ?? 0) * 60 + Number(m[6] ?? 0)) * 1000,
  };
}

// ---------- component tree ----------

interface Component {
  name: string;
  props: ContentLine[];
  children: Component[];
}

function tree(text: string): Component {
  const root: Component = { name: "ROOT", props: [], children: [] };
  const stack: Component[] = [root];
  for (const line of text.split(/\r\n|\n|\r/)) {
    if (!line.trim()) continue;
    const cl = parseContentLine(line);
    if (!cl) continue;
    const top = stack[stack.length - 1]!;
    if (cl.name === "BEGIN") {
      const c: Component = { name: cl.value.trim().toUpperCase(), props: [], children: [] };
      top.children.push(c);
      stack.push(c);
    } else if (cl.name === "END") {
      const name = cl.value.trim().toUpperCase();
      // Pop to the matching BEGIN; ignore stray ENDs.
      const idx = stack.map((c) => c.name).lastIndexOf(name);
      if (idx > 0) stack.length = idx;
    } else top.props.push(cl);
  }
  return root;
}

function findAll(c: Component, name: string, out: Component[] = []): Component[] {
  for (const ch of c.children) {
    if (ch.name === name) out.push(ch);
    else findAll(ch, name, out);
  }
  return out;
}

const first = (c: Component, name: string) => c.props.find((p) => p.name === name);
const all = (c: Component, name: string) => c.props.filter((p) => p.name === name);
const p1 = (cl: ContentLine, name: string) => cl.params[name]?.[0];

function person(cl: ContentLine): IcsPerson {
  const address = cl.value.trim().replace(/^mailto:/i, "");
  const name = p1(cl, "CN")?.trim();
  return name ? { name, address } : { address };
}

function vtimezones(root: Component): Map<string, TzObservance[]> {
  const map = new Map<string, TzObservance[]>();
  for (const vt of findAll(root, "VTIMEZONE")) {
    const id = first(vt, "TZID")?.value.trim();
    if (!id) continue;
    const obs: TzObservance[] = [];
    for (const sub of vt.children) {
      if (sub.name !== "STANDARD" && sub.name !== "DAYLIGHT") continue;
      const to = parseUtcOffset(first(sub, "TZOFFSETTO")?.value ?? "");
      if (to === null) continue;
      const from = parseUtcOffset(first(sub, "TZOFFSETFROM")?.value ?? "") ?? to;
      const ds = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/.exec(first(sub, "DTSTART")?.value.trim() ?? "");
      const start = ds ? Date.UTC(+ds[1]!, +ds[2]! - 1, +ds[3]!, +(ds[4] ?? 0), +(ds[5] ?? 0), +(ds[6] ?? 0)) : Date.UTC(1970, 0, 1);
      const rdates: number[] = [];
      for (const r of all(sub, "RDATE"))
        for (const v of r.value.split(",")) {
          const rm = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/.exec(v.trim());
          if (rm) rdates.push(Date.UTC(+rm[1]!, +rm[2]! - 1, +rm[3]!, +(rm[4] ?? 0), +(rm[5] ?? 0), +(rm[6] ?? 0)));
        }
      const rrule = first(sub, "RRULE")?.value.trim();
      obs.push({ kind: sub.name, start, from, to, rdates, ...(rrule ? { rrule } : {}) });
    }
    if (obs.length) map.set(id, obs);
  }
  return map;
}

const CONF_RE = /https:\/\/(?:meet\.google\.com\/[a-z0-9-]+|teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"]+|teams\.live\.com\/meet\/[^\s<>"]+|[a-z0-9-]*\.?zoom\.us\/j\/[^\s<>"]+)/i;

function addDuration(start: ParsedDateTime, dur: Dur, ctx: DateContext, tzid?: string): string {
  if (start.allDay) return isoDate(start.epoch + dur.sign * dur.days * 86_400_000);
  // Days are nominal (wall-clock) in the event's zone; H/M/S are exact.
  let t = start.epoch;
  if (dur.days) {
    const zone = tzid ? resolveZone(tzid, ctx) : null;
    if (zone) {
      const wall = t + zone.offset(t) + dur.sign * dur.days * 86_400_000;
      t = wallToUtc(wall, zone.offset);
    } else t += dur.sign * dur.days * 86_400_000;
  }
  return isoUtc(t + dur.sign * dur.ms);
}

function dateList(lines: ContentLine[], ctx: DateContext): string[] | undefined {
  if (!lines.length) return undefined;
  const out: string[] = [];
  for (const cl of lines) {
    const isPeriod = p1(cl, "VALUE")?.toUpperCase() === "PERIOD";
    for (const v of cl.value.split(",")) {
      if (!v.trim()) continue;
      if (isPeriod || v.includes("/")) {
        out.push(v.trim());
        continue;
      }
      const d = parseDateTime(v, cl.params, ctx);
      if (d) out.push(d.value);
    }
  }
  return out.length ? out : undefined;
}

function toEvent(c: Component, ctx: DateContext): IcsEvent {
  const raw: Record<string, string[]> = {};
  for (const p of c.props) (raw[p.name] ??= []).push(p.value);
  const text = (n: string) => {
    const p = first(c, n);
    return p ? unescapeText(p.value) : undefined;
  };
  const dt = (n: string) => {
    const p = first(c, n);
    return p ? parseDateTime(p.value, p.params, ctx) : null;
  };

  const startP = first(c, "DTSTART");
  const start = dt("DTSTART");
  const endP = first(c, "DTEND") ?? first(c, "DUE");
  const end = endP ? parseDateTime(endP.value, endP.params, ctx) : null;
  const durRaw = first(c, "DURATION")?.value.trim();
  const allDay = start?.allDay ?? false;

  let endStr: string | undefined;
  if (end) endStr = end.value;
  else if (start && durRaw) {
    const d = parseDuration(durRaw);
    if (d) endStr = addDuration(start, d, ctx, startP && p1(startP, "TZID"));
  } else if (start) endStr = start.allDay ? isoDate(start.epoch + 86_400_000) : start.value;

  const ev: IcsEvent = {
    uid: first(c, "UID")?.value.trim() ?? "",
    sequence: Math.max(0, parseInt(first(c, "SEQUENCE")?.value ?? "0", 10) || 0),
    start: start?.value ?? "",
    allDay,
    organizer: first(c, "ORGANIZER") ? person(first(c, "ORGANIZER")!) : null,
    attendees: all(c, "ATTENDEE").map((cl) => {
      const a: IcsAttendee = person(cl);
      const role = p1(cl, "ROLE");
      const partstat = p1(cl, "PARTSTAT");
      const rsvp = p1(cl, "RSVP");
      const cutype = p1(cl, "CUTYPE");
      if (role) a.role = role.toUpperCase();
      if (partstat) a.partstat = partstat.toUpperCase();
      if (rsvp) a.rsvp = rsvp.toUpperCase() === "TRUE";
      if (cutype) a.cutype = cutype.toUpperCase();
      return a;
    }),
    alarms: findAll(c, "VALARM").map((a) => {
      const al: IcsAlarm = {
        action: first(a, "ACTION")?.value.trim().toUpperCase() ?? "",
        trigger: first(a, "TRIGGER")?.value.trim() ?? "",
      };
      const desc = first(a, "DESCRIPTION");
      if (desc) al.description = unescapeText(desc.value);
      return al;
    }),
    raw,
  };
  if (endStr) ev.end = endStr;
  const set = <K extends keyof IcsEvent>(k: K, v: IcsEvent[K] | undefined) => {
    if (v !== undefined && v !== "") ev[k] = v;
  };
  set("summary", text("SUMMARY"));
  set("description", text("DESCRIPTION"));
  set("location", text("LOCATION"));
  set("url", first(c, "URL")?.value.trim());
  set("startTzid", startP && p1(startP, "TZID"));
  set("endTzid", endP && p1(endP, "TZID"));
  set("duration", durRaw);
  set("rrule", first(c, "RRULE")?.value.trim());
  set("exdate", dateList(all(c, "EXDATE"), ctx));
  set("rdate", dateList(all(c, "RDATE"), ctx));
  set("recurrenceId", dt("RECURRENCE-ID")?.value);
  set("status", first(c, "STATUS")?.value.trim().toUpperCase());
  set("transp", first(c, "TRANSP")?.value.trim().toUpperCase());
  set("created", dt("CREATED")?.value);
  set("lastModified", dt("LAST-MODIFIED")?.value);
  set("dtstamp", dt("DTSTAMP")?.value);
  const cats = all(c, "CATEGORIES").flatMap((p) => splitTextList(p.value));
  if (cats.length) ev.categories = cats;

  const conf =
    first(c, "X-GOOGLE-CONFERENCE")?.value ??
    first(c, "X-MICROSOFT-SKYPETEAMSMEETINGURL")?.value ??
    first(c, "X-MICROSOFT-ONLINEMEETINGCONFLINK")?.value ??
    first(c, "CONFERENCE")?.value ??
    CONF_RE.exec(`${ev.location ?? ""}\n${ev.description ?? ""}`)?.[0];
  set("conference", conf?.trim());
  return ev;
}

/**
 * Parse an iCalendar object (string or raw bytes). Never throws: unknown or
 * malformed lines are skipped, unbalanced BEGIN/END are tolerated. Every
 * VEVENT is returned, including RECURRENCE-ID overrides (same uid, with
 * `recurrenceId` set).
 */
export function parseIcs(input: string | Uint8Array, opts: ParseOptions = {}): IcsCalendar {
  const cal: IcsCalendar = { events: [], timezones: [] };
  try {
    const root = tree(unfold(input ?? ""));
    const vcal = findAll(root, "VCALENDAR")[0] ?? root;
    const method = first(vcal, "METHOD")?.value.trim().toUpperCase();
    const prodId = first(vcal, "PRODID")?.value.trim();
    if (method) cal.method = method;
    if (prodId) cal.prodId = prodId;
    const vt = vtimezones(root);
    cal.timezones = [...vt.keys()];
    for (const vtz of findAll(root, "VTIMEZONE")) {
      const id = first(vtz, "TZID")?.value.trim();
      if (id && !cal.timezones.includes(id)) cal.timezones.push(id);
    }
    const ctx: DateContext = { vtimezones: vt, ...(opts.defaultTimeZone ? { defaultTimeZone: opts.defaultTimeZone } : {}) };
    for (const ve of findAll(root, "VEVENT")) {
      try {
        cal.events.push(toEvent(ve, ctx));
      } catch {
        /* skip a broken event */
      }
    }
  } catch {
    /* never throw */
  }
  return cal;
}

/** The first VEVENT of a calendar, or null. */
export function parseIcsEvent(input: string | Uint8Array, opts?: ParseOptions): IcsEvent | null {
  return parseIcs(input, opts).events[0] ?? null;
}
