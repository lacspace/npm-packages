/**
 * @lacspace/rss — public formatting helpers
 *
 * Zero-dependency helpers for building feeds by hand or extending the built-in
 * generators: correct XML escaping, a CDATA wrapper for HTML content, and date
 * formatting per feed format — RFC-822 for RSS (`pubDate`/`lastBuildDate`) and
 * RFC-3339 / ISO-8601 for Atom (`updated`) and JSON Feed (`date_published`).
 *
 * These mirror the escaping/date rules the generators use internally, so a feed
 * you hand-assemble with them stays byte-compatible with {@link rss}/{@link atom}.
 */

/** XML-escape a string for safe interpolation into element text or attributes. */
export function escapeXml(s: string): string {
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Wrap HTML in a CDATA section, safely splitting any literal `]]>`. */
export function cdata(s: string): string {
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

function parse(d: string | number | Date): Date {
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) throw new RangeError(`Invalid date: ${String(d)}`);
  return date;
}

/**
 * Format a date as RFC-822 — the wire format for RSS `<pubDate>` /
 * `<lastBuildDate>`. Accepts a `Date`, an ISO string, or an epoch-ms number.
 * @throws {RangeError} on an unparseable input.
 */
export function rfc822Date(d: string | number | Date): string {
  return parse(d).toUTCString();
}

/**
 * Format a date as RFC-3339 / ISO-8601 — the wire format for Atom `<updated>`
 * and JSON Feed `date_published`. Accepts a `Date`, an ISO string, or epoch-ms.
 * @throws {RangeError} on an unparseable input.
 */
export function rfc3339Date(d: string | number | Date): string {
  return parse(d).toISOString();
}
