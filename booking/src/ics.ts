/**
 * Minimal RFC 5545 / RFC 5546 (iTIP) VEVENT writer: CRLF line endings,
 * 75-octet folding that never splits a UTF-8 sequence, TEXT escaping,
 * DTSTAMP and UID.
 */

import type { Interval } from "./slots";

export interface Person {
  name?: string;
  email: string;
}

export interface InviteOptions {
  title: string;
  description?: string;
  location?: string;
  url?: string;
  organizer: Person;
  attendees: Person[];
  /** Stable UID; reuse it to update or cancel the same meeting later. Default: random. */
  uid?: string;
  /** IANA zone, written as an X-WR-TIMEZONE display hint. Event times are always UTC. */
  timezone?: string;
  /** SEQUENCE number; bump it when re-sending an updated invite. Default 0. */
  sequence?: number;
  /** DTSTAMP override (ISO). Default: now. */
  now?: string;
  /** PRODID. Default "-//Lacspace//Booking 1.0//EN". */
  prodId?: string;
}

export interface Invite {
  /** The iCalendar text, or "" if the slot or organizer was invalid. */
  ics: string;
  method: "REQUEST";
}

const enc = new TextEncoder();

/** Escape a TEXT value (RFC 5545 §3.3.11). */
export function escapeText(s: unknown): string {
  return String(s ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n");
}

/** Parameter value: quoted when needed; DQUOTE and control chars removed (RFC 5545 §3.2). */
function paramValue(s: string): string {
  const clean = s.replace(/["\u0000-\u001f\u007f]/g, "").trim();
  return /[;:,]/.test(clean) ? `"${clean}"` : clean;
}

/** Fold one content line at 75 octets, never splitting a UTF-8 character. */
export function foldLine(line: string): string {
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  let limit = 75;
  for (const ch of line) {
    const n = enc.encode(ch).length;
    if (curBytes + n > limit) {
      out.push(cur);
      cur = " " + ch;
      curBytes = 1 + n;
      limit = 75;
    } else {
      cur += ch;
      curBytes += n;
    }
  }
  out.push(cur);
  return out.join("\r\n");
}

/** UTC DATE-TIME form, e.g. 20261014T041500Z. */
export function icsDate(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

function cleanEmail(e: unknown): string {
  return typeof e === "string" ? e.replace(/[\s<>"]/g, "") : "";
}

function randomUid(): string {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/** Build an iTIP REQUEST invite for one slot. Never throws; returns ics "" on invalid input. */
export function invite(slot: Interval, opts: InviteOptions): Invite {
  const empty: Invite = { ics: "", method: "REQUEST" };
  if (!slot || !opts) return empty;
  const a = Date.parse(slot.start);
  const b = Date.parse(slot.end);
  const org = cleanEmail(opts.organizer?.email);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b <= a || !org.includes("@")) return empty;
  const stampMs = opts.now !== undefined && Number.isFinite(Date.parse(opts.now)) ? Date.parse(opts.now) : Date.now();
  const uid = typeof opts.uid === "string" && opts.uid.trim() ? opts.uid.replace(/[\r\n]/g, "").trim() : `${randomUid()}@lacspace-booking`;
  const seq = Number.isInteger(opts.sequence) && (opts.sequence as number) >= 0 ? (opts.sequence as number) : 0;

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    `PRODID:${escapeText(opts.prodId ?? "-//Lacspace//Booking 1.0//EN")}`,
    "VERSION:2.0",
    "CALSCALE:GREGORIAN",
    "METHOD:REQUEST",
  ];
  if (typeof opts.timezone === "string" && /^[A-Za-z0-9_+\-/]+$/.test(opts.timezone)) lines.push(`X-WR-TIMEZONE:${opts.timezone}`);
  lines.push(
    "BEGIN:VEVENT",
    `UID:${escapeText(uid)}`,
    `DTSTAMP:${icsDate(stampMs)}`,
    `DTSTART:${icsDate(a)}`,
    `DTEND:${icsDate(b)}`,
    `SEQUENCE:${seq}`,
    `SUMMARY:${escapeText(opts.title)}`,
  );
  if (opts.description) lines.push(`DESCRIPTION:${escapeText(opts.description)}`);
  if (opts.location) lines.push(`LOCATION:${escapeText(opts.location)}`);
  if (typeof opts.url === "string" && /^https?:\/\/\S+$/i.test(opts.url.trim())) lines.push(`URL:${opts.url.trim()}`);
  const orgName = opts.organizer?.name ? `;CN=${paramValue(opts.organizer.name)}` : "";
  lines.push(`ORGANIZER${orgName}:mailto:${org}`);
  for (const p of Array.isArray(opts.attendees) ? opts.attendees : []) {
    const e = cleanEmail(p?.email);
    if (!e.includes("@")) continue;
    const cn = p.name ? `;CN=${paramValue(p.name)}` : "";
    lines.push(`ATTENDEE${cn};CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${e}`);
  }
  lines.push("STATUS:CONFIRMED", "TRANSP:OPAQUE", "END:VEVENT", "END:VCALENDAR");
  return { ics: lines.map(foldLine).join("\r\n") + "\r\n", method: "REQUEST" };
}
