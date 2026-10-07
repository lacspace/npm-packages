/**
 * RFC 5322 address-list parsing (groups, comments, quoted names, encoded
 * words, missing angle brackets) and formatting.
 */

import type { Address } from "./types";

import { MimeError, assertNoCRLF, decodeWords, encodeWord, foldList } from "./words";

/** Parse one mailbox's text (already split from the list). */
function parseMailbox(text: string, group: string | undefined): Address | null {
  const s = text.trim();
  if (!s) return null;
  let display = "";
  let addr: string | null = null;
  const comments: string[] = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === '"') {
      let j = i + 1;
      let v = "";
      while (j < s.length && s[j] !== '"') {
        if (s[j] === "\\" && j + 1 < s.length) j++;
        v += s[j];
        j++;
      }
      display += v;
      i = j + 1;
      continue;
    }
    if (c === "(") {
      let depth = 1;
      let j = i + 1;
      let v = "";
      while (j < s.length && depth > 0) {
        if (s[j] === "\\" && j + 1 < s.length) {
          v += s[j + 1];
          j += 2;
          continue;
        }
        if (s[j] === "(") depth++;
        else if (s[j] === ")") {
          depth--;
          if (depth === 0) break;
        }
        v += s[j];
        j++;
      }
      comments.push(v);
      display += " ";
      i = j + 1;
      continue;
    }
    if (c === "<") {
      const end = s.indexOf(">", i + 1);
      const inner = end < 0 ? s.slice(i + 1) : s.slice(i + 1, end);
      addr = inner;
      i = end < 0 ? s.length : end + 1;
      continue;
    }
    display += c;
    i++;
  }

  const clean = (v: string) => decodeWords(v).replace(/\s+/g, " ").trim();
  let name = "";
  let address = "";
  if (addr !== null) {
    address = addr.replace(/\s+/g, "").replace(/^mailto:/i, "");
    // obsolete source route: <@a.example,@b.example:user@c.example>
    if (address.startsWith("@") && address.includes(":")) address = address.slice(address.lastIndexOf(":") + 1);
    name = clean(display);
  } else {
    const tokens = display.trim().split(/\s+/).filter(Boolean);
    let at = -1;
    for (let k = tokens.length - 1; k >= 0; k--)
      if (tokens[k]!.includes("@")) {
        at = k;
        break;
      }
    if (at >= 0) {
      address = tokens[at]!;
      tokens.splice(at, 1);
      name = clean(tokens.join(" "));
    } else if (tokens.length === 1 && !comments.length) {
      address = tokens[0]!;
    } else {
      name = clean(tokens.join(" "));
    }
  }
  if (!name && comments.length) name = clean(comments.join(" "));
  name = name.replace(/^'(.*)'$/, "$1").trim();
  if (!address && !name) return null;
  const out: Address = { name, address };
  if (group !== undefined) out.group = group;
  return out;
}

/**
 * Parse an RFC 5322 address list: `"Doe, Jane" <j@x>, b@y (Bob), Team: a@x, c@y;`.
 * Groups are flattened (each member carries `group`), comments become names
 * when no display name exists, encoded words in names are decoded. Never throws.
 */
export function parseAddressList(input: string | undefined | null): Address[] {
  if (!input) return [];
  const out: Address[] = [];
  let group: string | undefined;
  let cur = "";
  let q = false;
  let depth = 0;
  let angle = false;
  const flush = () => {
    const a = parseMailbox(cur, group);
    if (a) out.push(a);
    cur = "";
  };
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (q) {
      if (c === "\\" && i + 1 < input.length) {
        cur += c + input[++i];
        continue;
      }
      if (c === '"') q = false;
      cur += c;
      continue;
    }
    if (depth > 0) {
      if (c === "\\" && i + 1 < input.length) {
        cur += c + input[++i];
        continue;
      }
      if (c === "(") depth++;
      else if (c === ")") depth--;
      cur += c;
      continue;
    }
    if (c === '"') q = true;
    else if (c === "(") depth = 1;
    else if (c === "<") angle = true;
    else if (c === ">") angle = false;
    else if (!angle && c === ":" && group === undefined && !cur.includes("@")) {
      group = decodeWords(cur.replace(/"/g, "")).trim();
      cur = "";
      continue;
    } else if (!angle && c === ";" && group !== undefined) {
      flush();
      group = undefined;
      continue;
    } else if (!angle && c === ",") {
      flush();
      continue;
    }
    cur += c;
  }
  flush();
  return out;
}

/** Parse a single mailbox; `null` when there is none. */
export function parseAddress(input: string): Address | null {
  return parseAddressList(input)[0] ?? null;
}

/** Address input accepted by the builder. */
export type AddressInput = string | { name?: string; address: string } | Array<string | { name?: string; address: string }>;

/** Normalise a builder address input to a list of validated addresses. */
export function toAddressList(input: AddressInput | undefined): Address[] {
  if (!input) return [];
  const arr = Array.isArray(input) ? input : [input];
  const out: Address[] = [];
  for (const a of arr) {
    if (typeof a === "string") {
      assertNoCRLF(a, "address");
      out.push(...parseAddressList(a).map((x) => ({ name: x.name, address: x.address })));
    } else {
      assertNoCRLF(a.address, "email address");
      if (a.name) assertNoCRLF(a.name, "address name");
      out.push({ name: a.name ?? "", address: a.address.trim() });
    }
  }
  for (const a of out) if (/[<>,;\s]/.test(a.address)) throw new MimeError(`invalid email address: ${a.address}`);
  return out;
}

// RFC 5322 §3.2.3 specials: a display name with any of them must be quoted.
const SPECIALS = /[()<>[\]:;@\\,."]/;

/**
 * Format an address for a header: names with specials are quoted, non-ASCII
 * names become RFC 2047 encoded words. Throws on CR/LF.
 */
export function formatAddress(a: Address | { name?: string; address: string } | string): string {
  const addr = typeof a === "string" ? parseAddress(a) ?? { name: "", address: a } : a;
  assertNoCRLF(addr.address, "email address");
  const name = addr.name ?? "";
  assertNoCRLF(name, "address name");
  if (!name) return addr.address;
  if (/[^\x20-\x7e]/.test(name)) return `${encodeWord(name)} <${addr.address}>`;
  const n = SPECIALS.test(name) ? `"${name.replace(/[\\"]/g, "\\$&")}"` : name;
  return `${n} <${addr.address}>`;
}

/** Format a list of addresses as one (folded) header value. */
export function formatAddressList(list: Array<Address | { name?: string; address: string } | string>): string {
  return foldList(list.map((a) => formatAddress(a)));
}
