/**
 * RFC 2047 encoded words (decode + encode) and header folding helpers.
 */

import { decodeBase64, decodeCharset, encodeBase64, utf8 } from "./bytes";

/** Thrown by the builder for unsafe input (CR/LF injection, bad header names). */
export class MimeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MimeError";
  }
}

/**
 * Reject any value containing CR or LF — prevents header injection through
 * untrusted subjects, names, addresses, filenames or custom headers.
 */
export function assertNoCRLF(value: string, label: string): string {
  if (/[\r\n]/.test(value)) throw new MimeError(`${label} must not contain CR or LF characters`);
  return value;
}

const WORD_RE = /=\?([^?\s]+)\?([BbQq])\?([^?]*)\?=/g;

function qDecode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "_") out.push(32);
    else if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(s.charCodeAt(i) & 0xff);
  }
  return Uint8Array.from(out);
}


type Seg = { word: false; text: string } | { word: true; charset: string; bytes: Uint8Array };

/**
 * Decode RFC 2047 encoded words (`=?charset?B|Q?…?=`) in a header value.
 * Whitespace between adjacent encoded words is removed, and adjacent words in
 * the same charset are joined at the byte level before decoding, so a
 * multibyte character split across two words survives. Never throws.
 */
export function decodeWords(input: string): string {
  if (!input || input.indexOf("=?") < 0) return input ?? "";
  const segs: Seg[] = [];
  let last = 0;
  WORD_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD_RE.exec(input))) {
    if (m.index > last) segs.push({ word: false, text: input.slice(last, m.index) });
    const charset = m[1]!.replace(/\*.*$/, "").toLowerCase();
    const bytes = m[2]!.toUpperCase() === "B" ? decodeBase64(m[3]!) : qDecode(m[3]!);
    segs.push({ word: true, charset, bytes });
    last = m.index + m[0].length;
  }
  if (last < input.length) segs.push({ word: false, text: input.slice(last) });

  // drop pure-whitespace text between two encoded words
  const cleaned: Seg[] = [];
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!;
    if (!s.word && /^\s*$/.test(s.text) && segs[i - 1]?.word && segs[i + 1]?.word) continue;
    cleaned.push(s);
  }
  // merge adjacent words in the same charset
  let out = "";
  for (let i = 0; i < cleaned.length; i++) {
    const s = cleaned[i]!;
    if (!s.word) {
      out += s.text;
      continue;
    }
    const chunks: Uint8Array[] = [s.bytes];
    let len = s.bytes.length;
    while (i + 1 < cleaned.length) {
      const n = cleaned[i + 1]!;
      if (!n.word || n.charset !== s.charset) break;
      chunks.push(n.bytes);
      len += n.bytes.length;
      i++;
    }
    const all = new Uint8Array(len);
    let o = 0;
    for (const c of chunks) {
      all.set(c, o);
      o += c.length;
    }
    out += decodeCharset(all, s.charset);
  }
  return out;
}

/**
 * RFC 2047 encoded word(s) `=?UTF-8?B?…?=`. Each word is ≤ 75 chars; longer
 * text becomes several words split between characters, joined by folding
 * whitespace (CRLF + space).
 */
export function encodeWord(str: string): string {
  const words: string[] = [];
  let chunk = "";
  let bytes = 0;
  for (const ch of str) {
    const n = utf8(ch).length;
    if (bytes + n > 45 && chunk) {
      words.push(chunk);
      chunk = "";
      bytes = 0;
    }
    chunk += ch;
    bytes += n;
  }
  if (chunk || !words.length) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${encodeBase64(w)}?=`).join("\r\n ");
}

/** Encode a header value only when it has non-ASCII text, else fold it. */
export function encodeHeader(value: string): string {
  if (/[^\x20-\x7e\t]/.test(value)) return encodeWord(value);
  return foldText(value);
}

/**
 * Fold an ASCII unstructured header value at spaces so lines stay near 78
 * columns. A single word too long to fold (> 997) is encoded instead.
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

/** Join items with `, `, folding before a line would overflow. */
export function foldList(items: string[], first = 72, sep = ","): string {
  let out = "";
  let lineLen = 0;
  let limit = first;
  items.forEach((item, i) => {
    const piece = i === 0 ? item : `${sep} ${item}`;
    if (i > 0 && lineLen + piece.length > limit) {
      out += `${sep}\r\n ` + item;
      lineLen = item.length + 1;
      limit = 77;
    } else {
      out += piece;
      lineLen += piece.length;
    }
  });
  return out;
}
