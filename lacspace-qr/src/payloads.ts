/**
 * Build correctly-formatted payload strings for common QR use cases (URL, WiFi,
 * vCard, email, phone, SMS, geo). These produce the exact text a scanner app
 * expects; feed the result to {@link makeQr}.
 */

/** Escape the reserved characters in a WiFi payload field (\ ; , : " ). */
export function escapeWifi(value: string): string {
  return value.replace(/([\\;,:"])/g, "\\$1");
}

/** Escape a vCard field value (\ ; , and newlines). */
export function escapeVcard(value: string): string {
  return value.replace(/([\\;,])/g, "\\$1").replace(/\n/g, "\\n");
}

export interface WifiPayload {
  ssid: string;
  password?: string;
  /** Authentication type. `nopass` for an open network. */
  security?: "WPA" | "WEP" | "nopass";
  hidden?: boolean;
}

/** `WIFI:T:WPA;S:ssid;P:password;H:true;;` */
export function wifiPayload(p: WifiPayload): string {
  const sec = p.security ?? (p.password ? "WPA" : "nopass");
  const parts = [`T:${sec}`, `S:${escapeWifi(p.ssid)}`];
  if (sec !== "nopass" && p.password) parts.push(`P:${escapeWifi(p.password)}`);
  if (p.hidden) parts.push("H:true");
  return `WIFI:${parts.join(";")};;`;
}

export interface VcardPayload {
  name?: string;
  org?: string;
  title?: string;
  tel?: string;
  email?: string;
  url?: string;
  address?: string;
  note?: string;
}

/** A vCard 3.0 payload. */
export function vcardPayload(p: VcardPayload): string {
  const lines = ["BEGIN:VCARD", "VERSION:3.0"];
  if (p.name) {
    const parts = p.name.trim().split(/\s+/);
    const last = parts.length > 1 ? parts[parts.length - 1]! : "";
    const first = parts.length > 1 ? parts.slice(0, -1).join(" ") : p.name;
    lines.push(`N:${escapeVcard(last)};${escapeVcard(first)};;;`);
    lines.push(`FN:${escapeVcard(p.name)}`);
  }
  if (p.org) lines.push(`ORG:${escapeVcard(p.org)}`);
  if (p.title) lines.push(`TITLE:${escapeVcard(p.title)}`);
  if (p.tel) lines.push(`TEL;TYPE=CELL:${p.tel}`);
  if (p.email) lines.push(`EMAIL:${p.email}`);
  if (p.url) lines.push(`URL:${p.url}`);
  if (p.address) lines.push(`ADR;TYPE=HOME:;;${escapeVcard(p.address)};;;;`);
  if (p.note) lines.push(`NOTE:${escapeVcard(p.note)}`);
  lines.push("END:VCARD");
  return lines.join("\n");
}

export interface EmailPayload {
  to: string;
  subject?: string;
  body?: string;
}

/** A `mailto:` payload with optional subject/body. */
export function emailPayload(p: EmailPayload): string {
  const params: string[] = [];
  if (p.subject) params.push(`subject=${encodeURIComponent(p.subject)}`);
  if (p.body) params.push(`body=${encodeURIComponent(p.body)}`);
  return `mailto:${p.to}${params.length ? "?" + params.join("&") : ""}`;
}

/** A `tel:` payload. */
export function telPayload(number: string): string {
  return `tel:${number.replace(/\s+/g, "")}`;
}

export interface SmsPayload {
  number: string;
  message?: string;
}

/** An `SMSTO:` payload (widely supported by scanner apps). */
export function smsPayload(p: SmsPayload): string {
  const num = p.number.replace(/\s+/g, "");
  return p.message ? `SMSTO:${num}:${p.message}` : `SMSTO:${num}`;
}

/** A `geo:` payload. Optional altitude appended as a third component. */
export function geoPayload(lat: number, lng: number, altitude?: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error("geo requires finite lat/lng");
  return altitude !== undefined ? `geo:${lat},${lng},${altitude}` : `geo:${lat},${lng}`;
}

/** Normalise a URL payload, adding `https://` when no scheme is present. */
export function urlPayload(url: string): string {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url) ? url : `https://${url}`;
}

/** Escape an iCalendar text value (RFC 5545: \ ; , and newlines). */
export function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

export interface CalendarPayload {
  title: string;
  /** Event start; a `Date` or anything `new Date()` accepts (ISO recommended). */
  start: Date | string;
  /** Event end (optional). */
  end?: Date | string;
  location?: string;
  description?: string;
  /** All-day event: emit `VALUE=DATE` (no time component). */
  allDay?: boolean;
}

/**
 * A VEVENT payload (RFC 5545). Timed events are written in UTC
 * (`YYYYMMDDTHHMMSSZ`); all-day events use `DTSTART;VALUE=DATE:YYYYMMDD`.
 */
export function calendarPayload(p: CalendarPayload): string {
  const toDate = (v: Date | string): Date => (v instanceof Date ? v : new Date(v));
  const start = toDate(p.start);
  if (Number.isNaN(start.getTime())) throw new Error("calendar requires a valid start date");
  const fmtUtc = (d: Date): string => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const fmtDate = (d: Date): string => d.toISOString().slice(0, 10).replace(/-/g, "");

  const lines = ["BEGIN:VEVENT", `SUMMARY:${escapeIcs(p.title)}`];
  if (p.allDay) {
    lines.push(`DTSTART;VALUE=DATE:${fmtDate(start)}`);
    if (p.end !== undefined) {
      const e = toDate(p.end);
      if (!Number.isNaN(e.getTime())) lines.push(`DTEND;VALUE=DATE:${fmtDate(e)}`);
    }
  } else {
    lines.push(`DTSTART:${fmtUtc(start)}`);
    if (p.end !== undefined) {
      const e = toDate(p.end);
      if (!Number.isNaN(e.getTime())) lines.push(`DTEND:${fmtUtc(e)}`);
    }
  }
  if (p.location) lines.push(`LOCATION:${escapeIcs(p.location)}`);
  if (p.description) lines.push(`DESCRIPTION:${escapeIcs(p.description)}`);
  lines.push("END:VEVENT");
  return lines.join("\n");
}
