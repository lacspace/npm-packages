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
  if (m) return { name: m[1]!.replace(/^"|"$/g, ""), address: m[2]!.trim() };
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
export function formatAddress(a: Address): string {
  if (!a.name) return a.address;
  const needsQuote = /[",;<>@]/.test(a.name);
  const name = needsQuote ? `"${a.name.replace(/"/g, '\\"')}"` : a.name;
  return /[^\x20-\x7e]/.test(a.name) ? `${encodeWord(a.name)} <${a.address}>` : `${name} <${a.address}>`;
}

/** Format a list of addresses as a single comma-separated header value. */
export function formatAddressList(list: Array<string | Address>): string {
  return list.map((a) => formatAddress(toAddress(a))).join(", ");
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
  return `=?UTF-8?B?${Buffer.from(str, "utf8").toString("base64")}?=`;
}

/** Public alias of {@link encodeWord}. */
export const encodeMimeWord = encodeWord;

/** Encode a header value only if it contains non-ASCII characters. */
export function encodeHeader(value: string): string {
  return /[^\x20-\x7e]/.test(value) ? encodeWord(value) : value;
}
