import { escapeText, fold, paramValue } from "./text";
import { ianaOffset, isIanaZone, resolveZone, ruleOnset, wallToUtc } from "./tz";
import { isoDate, parseIcsEvent, type IcsEvent } from "./parse";

export type IcsMethod = "PUBLISH" | "REQUEST" | "CANCEL" | "REPLY";
export type ReplyPartstat = "ACCEPTED" | "DECLINED" | "TENTATIVE";

export interface BuildPerson {
  name?: string;
  address: string;
}

export interface BuildAttendee extends BuildPerson {
  /** Default "REQ-PARTICIPANT". */
  role?: string;
  /** Default "NEEDS-ACTION". */
  partstat?: string;
  /** Default true when method is REQUEST. */
  rsvp?: boolean;
  cutype?: string;
}

export interface BuildAlarm {
  /** Default "DISPLAY". */
  action?: string;
  /** A TRIGGER value ("-PT15M") or minutes before start (15 → "-PT15M"). */
  trigger: string | number;
  /** Defaults to the event summary for DISPLAY alarms. */
  description?: string;
}

export interface BuildEvent {
  /** Generated (`<uuid>@lacspace.com`) when missing. */
  uid?: string;
  summary: string;
  /**
   * Date → that instant. String: "YYYY-MM-DD" (all-day unless allDay:false),
   * an ISO string with Z/offset (that instant), or a naive
   * "YYYY-MM-DDTHH:MM[:SS]" (wall time in `timeZone`, else UTC).
   */
  start: Date | string;
  /** Exclusive end. All-day default: start + 1 day. Timed: omitted when not given. */
  end?: Date | string;
  allDay?: boolean;
  /** IANA zone (or Windows name). Emits DTSTART;TZID=… plus a VTIMEZONE; UTC "Z" times otherwise. */
  timeZone?: string;
  location?: string;
  description?: string;
  url?: string;
  organizer?: BuildPerson;
  attendees?: BuildAttendee[];
  method?: IcsMethod;
  sequence?: number;
  status?: "CONFIRMED" | "TENTATIVE" | "CANCELLED";
  /** Raw RRULE value, e.g. "FREQ=WEEKLY;BYDAY=MO;COUNT=10". */
  rrule?: string;
  alarms?: BuildAlarm[];
  /** Default "-//Lacspace//Lacspace Mail//EN". */
  prodId?: string;
  /** Default now. */
  dtstamp?: Date;
}

export const DEFAULT_PRODID = "-//Lacspace//Lacspace Mail//EN";

// ---------- formatting helpers ----------

const pad = (n: number, w = 2) => String(Math.abs(n)).padStart(w, "0");

function basicUtc(t: number): string {
  const d = new Date(t);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function basicWall(wall: number): string {
  return basicUtc(wall).slice(0, -1);
}

function basicDate(t: number): string {
  return basicUtc(t).slice(0, 8);
}

function fmtOffset(ms: number): string {
  const s = Math.round(Math.abs(ms) / 1000);
  const base = `${ms < 0 ? "-" : "+"}${pad(Math.floor(s / 3600))}${pad(Math.floor((s % 3600) / 60))}`;
  return s % 60 ? base + pad(s % 60) : base;
}

const noCrlf = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

type Param = [string, string];

function line(name: string, value: string, params: Param[] = []): string {
  return fold(name + params.map(([k, v]) => `;${k}=${paramValue(v)}`).join("") + ":" + value);
}

function mailto(address: string): string {
  const a = noCrlf(address).replace(/^mailto:/i, "");
  return `mailto:${a}`;
}

function personLine(name: string, p: BuildPerson, extra: Param[] = []): string {
  const params: Param[] = [...extra];
  if (p.name) params.push(["CN", p.name]);
  return line(name, mailto(p.address), params);
}

function randomUid(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const id =
    c?.randomUUID?.() ??
    "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
      const r = (Math.random() * 16) | 0;
      return (ch === "x" ? r : (r & 3) | 8).toString(16);
    });
  return `${id}@lacspace.com`;
}

// ---------- date input ----------

type When = { kind: "date"; t: number } | { kind: "time"; t: number };

function toWhen(v: Date | string, allDay: boolean, zone: string | undefined): When | null {
  if (v instanceof Date) {
    const t = v.getTime();
    if (!Number.isFinite(t)) return null;
    if (!allDay) return { kind: "time", t };
    const wall = zone ? t + ianaOffset(zone, t) : t;
    const d = new Date(wall);
    return { kind: "date", t: Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) };
  }
  const s = String(v).trim();
  const dm = /^(\d{4})-?(\d{2})-?(\d{2})$/.exec(s);
  if (dm) {
    const day = Date.UTC(+dm[1]!, +dm[2]! - 1, +dm[3]!);
    if (allDay) return { kind: "date", t: day };
    return { kind: "time", t: zone ? wallToUtc(day, (x) => ianaOffset(zone, x)) : day };
  }
  const naive = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?$/.exec(s);
  if (naive) {
    const wall = Date.UTC(+naive[1]!, +naive[2]! - 1, +naive[3]!, +naive[4]!, +naive[5]!, +(naive[6] ?? 0));
    const t = zone ? wallToUtc(wall, (x) => ianaOffset(zone, x)) : wall;
    return toWhen(new Date(t), allDay, zone);
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? toWhen(new Date(t), allDay, zone) : null;
}

function dateLine(name: string, w: When, zone: string | undefined, tzid: string | undefined): string {
  if (w.kind === "date") return line(name, basicDate(w.t), [["VALUE", "DATE"]]);
  if (zone && tzid) return line(name, basicWall(w.t + ianaOffset(zone, w.t)), [["TZID", tzid]]);
  return line(name, basicUtc(w.t));
}

// ---------- VTIMEZONE from Intl ----------

interface Transition {
  at: number;
  from: number;
  to: number;
}

function transitions(zone: string, year: number): Transition[] {
  const out: Transition[] = [];
  const end = Date.UTC(year + 1, 0, 1);
  let t = Date.UTC(year, 0, 1);
  let prev = ianaOffset(zone, t);
  const step = 86_400_000;
  while (t < end) {
    const next = Math.min(t + step, end);
    const off = ianaOffset(zone, next);
    if (off !== prev) {
      let lo = t;
      let hi = next;
      while (hi - lo > 1000) {
        const mid = Math.floor((lo + hi) / 2000) * 1000;
        if (mid <= lo) break;
        if (ianaOffset(zone, mid) === prev) lo = mid;
        else hi = mid;
      }
      out.push({ at: hi, from: prev, to: off });
      prev = off;
    }
    t = next;
  }
  return out;
}

const WD = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/**
 * A VTIMEZONE block for an IANA zone, derived from Intl for `year`. Zones
 * with two transitions that year get yearly RRULEs (BYMONTH + BYDAY, e.g.
 * `2SU` / `-1SU`) with DTSTART in the previous year; other zones get exact
 * observances for that year.
 */
export function buildVTimezone(tzid: string, zone: string, year: number): string[] {
  const out = ["BEGIN:VTIMEZONE", line("TZID", noCrlf(tzid))];
  const tr = transitions(zone, year);
  const obs = (kind: string, dtstart: string, from: number, to: number, rrule?: string) => {
    out.push(`BEGIN:${kind}`, `DTSTART:${dtstart}`, `TZOFFSETFROM:${fmtOffset(from)}`, `TZOFFSETTO:${fmtOffset(to)}`);
    if (rrule) out.push(`RRULE:${rrule}`);
    out.push(`END:${kind}`);
  };
  if (tr.length === 2) {
    const maxTo = Math.max(tr[0]!.to, tr[1]!.to);
    for (const x of tr) {
      const wall = x.at + x.from;
      const d = new Date(wall);
      const month = d.getUTCMonth();
      const day = d.getUTCDate();
      const dim = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      const ord = day + 7 > dim ? -1 : Math.ceil(day / 7);
      const rrule = `FREQ=YEARLY;BYMONTH=${month + 1};BYDAY=${ord}${WD[d.getUTCDay()]}`;
      const tod = wall - Date.UTC(year, month, day);
      const prevWall = ruleOnset(rrule, year - 1, Date.UTC(year - 1, 0, 1) + tod) ?? wall;
      obs(x.to === maxTo ? "DAYLIGHT" : "STANDARD", basicWall(prevWall), x.from, x.to, rrule);
    }
  } else {
    const initial = ianaOffset(zone, Date.UTC(year, 0, 1));
    obs("STANDARD", "19700101T000000", initial, initial);
    for (const x of tr) obs(x.to > x.from ? "DAYLIGHT" : "STANDARD", basicWall(x.at + x.from), x.from, x.to);
  }
  out.push("END:VTIMEZONE");
  return out;
}

function trigger(t: string | number): string {
  if (typeof t === "number") {
    const m = Math.round(Math.abs(t));
    return `${t > 0 ? "-" : ""}PT${m}M`;
  }
  return noCrlf(t);
}

function wrapCalendar(body: string[], method: string | undefined, prodId: string | undefined, vtz: string[] = []): string {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    line("PRODID", noCrlf(prodId ?? DEFAULT_PRODID)),
    "CALSCALE:GREGORIAN",
    ...(method ? [`METHOD:${method}`] : []),
    ...vtz,
    ...body,
    "END:VCALENDAR",
  ];
  return lines.join("\r\n") + "\r\n";
}

/**
 * Build a VCALENDAR with one VEVENT. CRLF line endings, folded at 75 octets
 * (UTF-8 aware), TEXT values escaped, DTSTAMP in UTC. Times are emitted in
 * UTC unless `timeZone` is given (then TZID + a VTIMEZONE for the event's
 * year). Throws only when `start` is not a valid date.
 */
export function buildIcs(ev: BuildEvent): string {
  const tzResolved = ev.timeZone ? resolveZone(ev.timeZone) : null;
  const zone = tzResolved?.iana && isIanaZone(tzResolved.iana) ? tzResolved.iana : undefined;
  const tzid = zone ? noCrlf(ev.timeZone!) : undefined;
  const allDay = ev.allDay ?? (typeof ev.start === "string" && /^\d{4}-?\d{2}-?\d{2}$/.test(ev.start.trim()));
  const start = toWhen(ev.start, allDay, zone);
  if (!start) throw new TypeError(`buildIcs: invalid start ${String(ev.start)}`);
  let end = ev.end !== undefined ? toWhen(ev.end, allDay, zone) : null;
  if (!end && allDay) end = { kind: "date", t: start.t + 86_400_000 };

  const body: string[] = ["BEGIN:VEVENT"];
  body.push(line("UID", noCrlf(ev.uid || randomUid())));
  body.push(`DTSTAMP:${basicUtc((ev.dtstamp ?? new Date()).getTime())}`);
  body.push(dateLine("DTSTART", start, zone, tzid));
  if (end) body.push(dateLine("DTEND", end, zone, tzid));
  if (ev.sequence !== undefined || ev.method) body.push(`SEQUENCE:${Math.max(0, Math.floor(ev.sequence ?? 0))}`);
  body.push(line("SUMMARY", escapeText(ev.summary ?? "")));
  if (ev.location) body.push(line("LOCATION", escapeText(ev.location)));
  if (ev.description) body.push(line("DESCRIPTION", escapeText(ev.description)));
  if (ev.url) body.push(line("URL", noCrlf(ev.url)));
  if (ev.status) body.push(`STATUS:${ev.status}`);
  if (ev.rrule) body.push(line("RRULE", noCrlf(ev.rrule).replace(/^RRULE:/i, "")));
  if (ev.organizer) body.push(personLine("ORGANIZER", ev.organizer));
  for (const a of ev.attendees ?? []) {
    const params: Param[] = [];
    if (a.cutype) params.push(["CUTYPE", a.cutype.toUpperCase()]);
    params.push(["ROLE", (a.role ?? "REQ-PARTICIPANT").toUpperCase()]);
    params.push(["PARTSTAT", (a.partstat ?? "NEEDS-ACTION").toUpperCase()]);
    const rsvp = a.rsvp ?? ev.method === "REQUEST";
    if (rsvp) params.push(["RSVP", "TRUE"]);
    body.push(personLine("ATTENDEE", a, params));
  }
  for (const al of ev.alarms ?? []) {
    const action = (al.action ?? "DISPLAY").toUpperCase();
    body.push("BEGIN:VALARM", `ACTION:${noCrlf(action)}`, line("TRIGGER", trigger(al.trigger)));
    const desc = al.description ?? (action === "DISPLAY" || action === "EMAIL" ? ev.summary : undefined);
    if (desc) body.push(line("DESCRIPTION", escapeText(desc)));
    if (action === "EMAIL") body.push(line("SUMMARY", escapeText(ev.summary ?? "")));
    body.push("END:VALARM");
  }
  body.push("END:VEVENT");

  const vtz = zone && tzid && !allDay ? buildVTimezone(tzid, zone, new Date(start.t).getUTCFullYear()) : [];
  return wrapCalendar(body, ev.method, ev.prodId, vtz);
}

// ---------- iTIP ----------

function eventOf(invite: IcsEvent | string): IcsEvent {
  const ev = typeof invite === "string" ? parseIcsEvent(invite) : invite;
  if (!ev) throw new TypeError("no VEVENT found in invite");
  return ev;
}

function parsedDateLine(name: string, v: string | undefined): string[] {
  if (!v) return [];
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return [line(name, v.replace(/-/g, ""), [["VALUE", "DATE"]])];
  const t = Date.parse(v);
  return Number.isFinite(t) ? [line(name, basicUtc(t))] : [];
}

function sameAddress(a: string, b: string): boolean {
  const n = (s: string) => s.trim().replace(/^mailto:/i, "").toLowerCase();
  return n(a) === n(b);
}

export interface ReplyOptions {
  invite: IcsEvent | string;
  attendee: BuildPerson;
  partstat: ReplyPartstat;
  comment?: string;
  /** Default now. */
  dtstamp?: Date;
  prodId?: string;
}

/**
 * RFC 5546 §3.2.3 REPLY: METHOD:REPLY with the invite's UID, SEQUENCE,
 * RECURRENCE-ID (if any) and ORGANIZER, exactly one ATTENDEE (the replier,
 * with PARTSTAT), DTSTAMP now, plus SUMMARY/DTSTART/DTEND for clients that
 * display the reply. Times are written in UTC.
 */
export function buildReplyIcs(opts: ReplyOptions): string {
  const ev = eventOf(opts.invite);
  const partstat = String(opts.partstat).toUpperCase();
  const known = ev.attendees.find((a) => sameAddress(a.address, opts.attendee.address));
  const name = opts.attendee.name ?? known?.name;
  const params: Param[] = [];
  if (known?.cutype) params.push(["CUTYPE", known.cutype]);
  if (known?.role) params.push(["ROLE", known.role]);
  params.push(["PARTSTAT", partstat]);
  const body: string[] = ["BEGIN:VEVENT", line("UID", noCrlf(ev.uid))];
  body.push(`DTSTAMP:${basicUtc((opts.dtstamp ?? new Date()).getTime())}`);
  body.push(`SEQUENCE:${ev.sequence}`);
  body.push(...parsedDateLine("RECURRENCE-ID", ev.recurrenceId));
  if (ev.organizer) body.push(personLine("ORGANIZER", ev.organizer));
  body.push(personLine("ATTENDEE", { address: opts.attendee.address, ...(name ? { name } : {}) }, params));
  body.push(...parsedDateLine("DTSTART", ev.start));
  body.push(...parsedDateLine("DTEND", ev.end));
  if (ev.summary !== undefined) body.push(line("SUMMARY", escapeText(ev.summary)));
  if (opts.comment) body.push(line("COMMENT", escapeText(opts.comment)));
  body.push("END:VEVENT");
  return wrapCalendar(body, "REPLY", opts.prodId);
}

export interface CancelOptions {
  /** Default invite.sequence + 1. */
  sequence?: number;
  dtstamp?: Date;
  prodId?: string;
}

/** RFC 5546 §3.2.5 CANCEL for the whole event (or the RECURRENCE-ID instance), sequence incremented. */
export function buildCancelIcs(invite: IcsEvent | string, opts: CancelOptions = {}): string {
  const ev = eventOf(invite);
  const body: string[] = ["BEGIN:VEVENT", line("UID", noCrlf(ev.uid))];
  body.push(`DTSTAMP:${basicUtc((opts.dtstamp ?? new Date()).getTime())}`);
  body.push(`SEQUENCE:${Math.max(0, Math.floor(opts.sequence ?? ev.sequence + 1))}`);
  body.push(...parsedDateLine("RECURRENCE-ID", ev.recurrenceId));
  if (ev.organizer) body.push(personLine("ORGANIZER", ev.organizer));
  for (const a of ev.attendees) {
    const params: Param[] = [];
    if (a.cutype) params.push(["CUTYPE", a.cutype]);
    if (a.role) params.push(["ROLE", a.role]);
    body.push(personLine("ATTENDEE", a, params));
  }
  body.push(...parsedDateLine("DTSTART", ev.start));
  body.push(...parsedDateLine("DTEND", ev.end));
  if (ev.summary !== undefined) body.push(line("SUMMARY", escapeText(ev.summary)));
  body.push("STATUS:CANCELLED");
  body.push("END:VEVENT");
  return wrapCalendar(body, "CANCEL", opts.prodId);
}

export interface ReplyEmail {
  subject: string;
  text: string;
  ics: string;
  contentType: "text/calendar; method=REPLY; charset=UTF-8";
  /** Organizer address — where the reply goes. */
  to?: string;
  /** Suggested filename for the calendar part. */
  filename: "invite.ics";
}

const VERB: Record<string, [string, string]> = {
  ACCEPTED: ["Accepted", "accepted"],
  DECLINED: ["Declined", "declined"],
  TENTATIVE: ["Tentative", "tentatively accepted"],
};

/**
 * Everything needed to send an RSVP: subject ("Accepted: Weekly sync"),
 * a plain-text body, the REPLY calendar and its Content-Type. Send it to the
 * organizer as a `text/calendar; method=REPLY` part (see README).
 */
export function replyEmail(
  invite: IcsEvent | string,
  attendee: BuildPerson,
  partstat: ReplyPartstat,
  opts: { comment?: string; dtstamp?: Date } = {},
): ReplyEmail {
  const ev = eventOf(invite);
  const ps = String(partstat).toUpperCase();
  const [label, verb] = VERB[ps] ?? [ps.charAt(0) + ps.slice(1).toLowerCase(), ps.toLowerCase()];
  const who = attendee.name ? `${attendee.name} <${attendee.address}>` : attendee.address;
  const summary = ev.summary ?? "(no title)";
  const when = ev.allDay
    ? `${ev.start}${ev.end && ev.end !== isoDate(Date.parse(ev.start) + 86_400_000) ? ` – ${ev.end} (exclusive)` : ""} (all day)`
    : `${ev.start}${ev.end && ev.end !== ev.start ? ` – ${ev.end}` : ""}`;
  const lines = [`${who} has ${verb} this invitation.`, "", `Event: ${summary}`];
  if (ev.start) lines.push(`When: ${when}`);
  if (ev.location) lines.push(`Where: ${ev.location}`);
  if (opts.comment) lines.push("", opts.comment);
  const out: ReplyEmail = {
    subject: `${label}: ${summary}`,
    text: lines.join("\n") + "\n",
    ics: buildReplyIcs({ invite: ev, attendee, partstat, ...opts }),
    contentType: "text/calendar; method=REPLY; charset=UTF-8",
    filename: "invite.ics",
  };
  if (ev.organizer?.address) out.to = ev.organizer.address;
  return out;
}
