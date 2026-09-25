/**
 * RFC 5322 address parsing/formatting + RFC 2047 encoded-word header encoding.
 *
 * Pure, dependency-free helpers shared by the SMTP client and the MIME builder,
 * and exported so callers can parse, validate and format addresses themselves.
 */

import type { Address, AddressInput } from "./index";

import { SmtpError } from "./index";

/**
 * Reject any value containing a CR or LF character. Prevents SMTP command and
 * MIME header injection (CRLF injection) via untrusted addresses, headers,
 * subjects, or attachment filenames.
 */
export function assertNoCRLF(value: string, label: string): string {
  if (/[\r\n]/.test(value)) {
    throw new SmtpError(`${label} must not contain CR or LF characters`);
  }
  return value;
}

/* ------------------------------ addresses ------------------------------ */

/** Coerce a string/Address into a validated {@link Address} (throws on CRLF). */
export function toAddress(input: string | Address): Address {
  const a: Address = typeof input === "string" ? parseAddress(input) : input;
  assertNoCRLF(a.address, "email address");
  if (a.name !== undefined) assertNoCRLF(a.name, "address name");
  return a;
}

/**
 * Parse a single RFC 5322 mailbox — `"Name <user@host>"`, `user@host`, or a
 * bare `<user@host>` — into `{ name?, address }`. Surrounding quotes on the
 * display name are stripped.
 */
export function parseAddress(input: string): Address {
  const m = input.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (m) {
    const raw = m[1]!;
    const quoted = /^".*"$/.test(raw);
    const name = quoted ? raw.slice(1, -1).replace(/\\(.)/g, "$1") : raw;
    return { name, address: m[2]!.trim() };
  }
  return { address: input.trim() };
}

/**
 * Parse a comma-separated address list (`"A <a@x>, b@y"`) into an array of
 * {@link Address}, respecting quoted display names and `<>` so commas inside
 * them are not treated as separators.
 */
export function parseAddressList(input: string): Address[] {
  const out: string[] = [];
  let depth = 0;
  let quoted = false;
  let cur = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === '"' && input[i - 1] !== "\\") quoted = !quoted;
    if (!quoted && ch === "<") depth++;
    if (!quoted && ch === ">") depth = Math.max(0, depth - 1);
    if (ch === "," && !quoted && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean).map(parseAddress);
}

/** Normalise an {@link AddressInput} to a validated list of {@link Address}. */
export function toList(input?: AddressInput): Address[] {
  if (!input) return [];
  return (Array.isArray(input) ? input : [input]).map(toAddress);
}

/**
 * Format an {@link Address} as a header value. Display names with special
 * characters are quoted; non-ASCII names are RFC 2047 encoded-word encoded.
 */
// RFC 5322 §3.2.3 "specials": a display name containing any of them must be a
// quoted-string, or "Team: Sales <a@x>" reads as the start of an address group.
const SPECIALS = /[()<>[\]:;@\\,."]/;

export function formatAddress(a: Address): string {
  if (!a.name) return a.address;
  if (/[^\x20-\x7e]/.test(a.name)) return `${encodeWord(a.name)} <${a.address}>`;
  const name = SPECIALS.test(a.name) ? `"${a.name.replace(/[\\"]/g, "\\$&")}"` : a.name;
  return `${name} <${a.address}>`;
}

/** Format a list of addresses as a single comma-separated header value. */
export function formatAddressList(list: Array<string | Address>): string {
  return foldList(list.map((a) => formatAddress(toAddress(a))));
}

/* ------------------------------ validation ------------------------------ */

const EMAIL_RE = /^[^\s@",]+(?:\.[^\s@",]+)*@[^\s@.,]+(?:\.[^\s@.,]+)+$/;

/** Loose but practical RFC 5322 mailbox check on the `local@domain` part. */
export function isValidEmail(email: string): boolean {
  if (typeof email !== "string" || /[\r\n]/.test(email)) return false;
  return EMAIL_RE.test(email.trim());
}

/**
 * Validate an envelope: at least one recipient and, when required, a `from`.
 * Returns the list of invalid addresses (empty = valid).
 */
export function invalidAddresses(inputs: AddressInput): string[] {
  return toList(inputs)
    .map((a) => a.address)
    .filter((addr) => !isValidEmail(addr));
}

/* ------------------------------ encoding ------------------------------ */

/**
 * RFC 2047 encoded-word (`=?UTF-8?B?…?=`) — encode a header value's non-ASCII
 * content as base64 so it survives 7-bit transports (subjects, display names).
 */
export function encodeWord(str: string): string {
  // RFC 2047 §2: an encoded-word is at most 75 characters. 45 UTF-8 bytes
  // base64-encode to 60, plus the 12-character wrapper = 72. Longer text becomes
  // several words, split between characters (never inside one), separated by
  // folding whitespace, which decoders drop when joining adjacent words.
  const words: string[] = [];
  let chunk = "";
  let bytes = 0;
  for (const ch of str) {
    const n = Buffer.byteLength(ch, "utf8");
    if (bytes + n > 45 && chunk) {
      words.push(chunk);
      chunk = "";
      bytes = 0;
    }
    chunk += ch;
    bytes += n;
  }
  if (chunk || !words.length) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join("\r\n ");
}

/** Public alias of {@link encodeWord}. */
export const encodeMimeWord = encodeWord;

/** Encode a header value only if it contains non-ASCII characters. */
export function encodeHeader(value: string): string {
  if (/[^\x20-\x7e]/.test(value)) return encodeWord(value);
  return foldText(value);
}

/**
 * Fold an unstructured ASCII header value at spaces so lines stay near 78
 * characters (RFC 5322 §2.1.1 limits them to 998). A single word too long to
 * fold is encoded instead, since encoded words can be split anywhere.
 */
export function foldText(value: string, first = 69): string {
  if (value.length <= first) return value;
  const out: string[] = [];
  let line = "";
  let limit = first;
  for (const word of value.split(/(?= )/)) {
    if (line && line.length + word.length > limit) {
      out.push(line);
      line = word;
      limit = 77;
    } else line += word;
  }
  out.push(line);
  if (out.some((l) => l.length > 997)) return encodeWord(value);
  return out.join("\r\n");
}

/** Join formatted addresses, starting a new folded line before one would overflow. */
export function foldList(items: string[], first = 72): string {
  let out = "";
  let lineLen = 0;
  let limit = first;
  items.forEach((item, i) => {
    const piece = i === 0 ? item : `, ${item}`;
    if (i > 0 && lineLen + piece.length > limit) {
      out += ",\r\n " + item;
      lineLen = item.length + 1;
      limit = 77;
    } else {
      out += piece;
      lineLen += piece.length;
    }
  });
  return out;
}
