/**
 * Message splitting and canonicalization (RFC 6376 §3.4).
 *
 * Internally the message is held as a "binary string": one JS char per octet
 * (char codes 0–255). That keeps hashing byte-exact for 8-bit and UTF-8
 * content while letting the canonicalization work with ordinary string ops.
 */

export type Canon = "simple" | "relaxed";

/** One header field as it appears in the message. */
export interface HeaderField {
  /** Field name exactly as written (may include whitespace before the colon). */
  name: string;
  /** Lower-cased, trimmed field name used for matching. */
  key: string;
  /** Everything after the first colon, folding CRLFs included, no terminating CRLF. */
  value: string;
}

const WSP_RUN = /[ \t]+/g;

/** ASCII-only lower-casing (header names are ASCII; avoids touching latin1 octets). */
export function asciiLower(s: string): string {
  return s.replace(/[A-Z]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 32));
}

/** Encode any input to a binary string (one char per octet). */
export function toBinary(raw: string | Uint8Array): string {
  if (typeof raw === "string") {
    // eslint-disable-next-line no-control-regex
    if (!/[^\x00-\xff]/.test(raw)) return raw;
    return bytesToBinary(new TextEncoder().encode(raw));
  }
  return bytesToBinary(raw);
}

export function bytesToBinary(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
  }
  return out;
}

export function binaryToBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/** Normalise bare LF line endings to CRLF (leaves existing CRLF alone). */
export function toCrlf(s: string): string {
  return s.replace(/\r?\n/g, "\r\n");
}

/** Split a CRLF message into its header block (without the blank line) and body. */
export function splitMessage(msg: string): { header: string; body: string } {
  if (msg.startsWith("\r\n")) return { header: "", body: msg.slice(2) };
  const i = msg.indexOf("\r\n\r\n");
  if (i < 0) {
    // No body separator: everything is header (strip a final CRLF).
    return { header: msg.endsWith("\r\n") ? msg.slice(0, -2) : msg, body: "" };
  }
  return { header: msg.slice(0, i), body: msg.slice(i + 4) };
}

/** Parse a header block into fields, keeping each field's raw folding. */
export function parseHeaderFields(header: string): HeaderField[] {
  if (!header) return [];
  const lines = header.split("\r\n");
  const raws: string[] = [];
  for (const line of lines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && raws.length) {
      raws[raws.length - 1] += "\r\n" + line;
    } else {
      raws.push(line);
    }
  }
  const out: HeaderField[] = [];
  for (const raw of raws) {
    const c = raw.indexOf(":");
    if (c < 0) continue; // not a header field (malformed line) — ignore
    const name = raw.slice(0, c);
    out.push({ name, key: asciiLower(name.replace(/[ \t]+$/, "")), value: raw.slice(c + 1) });
  }
  return out;
}

/**
 * Canonicalize one header field. Returns `name:value\r\n`.
 *
 * - `simple`: the field exactly as it appears (name, colon, value incl. folding).
 * - `relaxed`: name lower-cased with trailing WSP removed; value unfolded,
 *   WSP runs collapsed to one SP, leading/trailing WSP removed.
 */
export function canonicalizeHeader(name: string, value: string, mode: Canon = "relaxed"): string {
  if (mode === "simple") return `${name}:${value}\r\n`;
  const n = asciiLower(name.replace(/[ \t]+$/, "").replace(/^[ \t]+/, ""));
  const v = value
    .replace(/\r\n(?=[ \t])/g, "")
    .replace(/\r|\n/g, "")
    .replace(WSP_RUN, " ")
    .replace(/^ /, "")
    .replace(/ $/, "");
  return `${n}:${v}\r\n`;
}

/**
 * Canonicalize a message body (RFC 6376 §3.4.3–3.4.4), optionally truncated
 * to `length` octets of canonical output (the l= tag).
 *
 * - `simple`: trailing empty lines removed; an empty body becomes a single CRLF.
 * - `relaxed`: WSP at line ends removed, WSP runs collapsed, trailing empty
 *   lines removed; an empty body stays empty.
 */
export function canonicalizeBody(body: string, mode: Canon = "relaxed", length?: number): string {
  let b = toCrlf(body);
  if (mode === "relaxed") {
    b = b
      .split("\r\n")
      .map((line) => line.replace(WSP_RUN, " ").replace(/ $/, ""))
      .join("\r\n");
    b = b.replace(/(\r\n)+$/, "");
    if (b.length) b += "\r\n";
  } else {
    b = b.replace(/(\r\n)+$/, "");
    b += "\r\n";
  }
  if (length !== undefined && length >= 0 && length < b.length) b = b.slice(0, length);
  return b;
}

/**
 * Pick header instances for an h= list: each name takes the bottom-most
 * not-yet-used instance (RFC 6376 §5.4.2). Missing instances yield `null`
 * (they contribute nothing to the hash).
 */
export function selectHeaders(
  fields: HeaderField[],
  names: string[],
  exclude?: HeaderField,
): (HeaderField | null)[] {
  const used = new Set<number>();
  if (exclude) {
    const x = fields.indexOf(exclude);
    if (x >= 0) used.add(x);
  }
  return names.map((n) => {
    const key = asciiLower(n.trim());
    for (let i = fields.length - 1; i >= 0; i--) {
      if (!used.has(i) && fields[i]!.key === key) {
        used.add(i);
        return fields[i]!;
      }
    }
    return null;
  });
}
