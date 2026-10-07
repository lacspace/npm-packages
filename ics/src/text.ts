/** Content-line level helpers: unfolding, folding, TEXT escaping, parameter parsing. */

const encoder = /* @__PURE__ */ new TextEncoder();

/** UTF-8 byte length of a string. */
export function byteLength(s: string): number {
  return encoder.encode(s).length;
}

function utf8Len(cp: number): number {
  return cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
}

/**
 * Unfold content lines (RFC 5545 §3.1): a line break followed by a single
 * space or tab is removed. Accepts CRLF, LF or bare CR.
 *
 * Pass the raw **bytes** (`Uint8Array`) when you have them: some producers
 * fold by octets and split a multi-byte UTF-8 character across the fold, so
 * the fold has to be removed before UTF-8 decoding. A string that was
 * already decoded with a split character contains U+FFFD and cannot be
 * repaired. Strips a leading BOM.
 */
export function unfold(input: string | Uint8Array): string {
  let text: string;
  if (typeof input === "string") {
    text = input;
  } else {
    const out = new Uint8Array(input.length);
    let n = 0;
    for (let i = 0; i < input.length; i++) {
      const b = input[i]!;
      if (b === 0x0d && input[i + 1] === 0x0a && (input[i + 2] === 0x20 || input[i + 2] === 0x09)) {
        i += 2;
        continue;
      }
      if ((b === 0x0a || b === 0x0d) && (input[i + 1] === 0x20 || input[i + 1] === 0x09)) {
        i += 1;
        continue;
      }
      out[n++] = b;
    }
    text = new TextDecoder("utf-8").decode(out.subarray(0, n));
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text.replace(/(?:\r\n|\n|\r)[ \t]/g, "");
}

/**
 * Fold one content line at 75 octets (RFC 5545 §3.1) with CRLF + space.
 * Counts UTF-8 bytes and never splits a multi-byte character (or a
 * surrogate pair). Continuation lines start with a space, which counts
 * toward their 75 octets. Returns the line without a trailing CRLF.
 */
export function fold(line: string, limit = 75): string {
  if (byteLength(line) <= limit) return line;
  const parts: string[] = [];
  let cur = "";
  let curBytes = 0;
  let max = limit;
  for (const ch of line) {
    const len = utf8Len(ch.codePointAt(0)!);
    if (curBytes + len > max) {
      parts.push(cur);
      cur = "";
      curBytes = 0;
      max = limit - 1;
    }
    cur += ch;
    curBytes += len;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}

/** Escape a TEXT value: `\` `;` `,` and newlines (RFC 5545 §3.3.11). */
export function escapeText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

/** Reverse {@link escapeText}. Also accepts `\N` and Outlook's stray `\:`. */
export function unescapeText(s: string): string {
  return s.replace(/\\([\\;,nN:])/g, (_m, c: string) => (c === "n" || c === "N" ? "\n" : c));
}

/** Split a TEXT list on unescaped commas (CATEGORIES etc.), then unescape each item. */
export function splitTextList(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "\\" && i + 1 < s.length) {
      cur += c + s[i + 1];
      i++;
    } else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map(unescapeText).map((x) => x.trim()).filter(Boolean);
}

export interface ContentLine {
  /** Upper-cased property name. */
  name: string;
  /** Upper-cased parameter names → values (quotes removed, RFC 6868 decoded). */
  params: Record<string, string[]>;
  /** Raw value (still TEXT-escaped). */
  value: string;
}

function caret(s: string): string {
  return s.replace(/\^([n'^])/g, (_m, c: string) => (c === "n" ? "\n" : c === "'" ? '"' : "^"));
}

/** Parse one unfolded content line; returns null if it is not `name[;params]:value`. */
export function parseContentLine(line: string): ContentLine | null {
  const m = /^([A-Za-z0-9-]+)/.exec(line);
  if (!m) return null;
  const name = m[1]!.toUpperCase();
  let i = name.length;
  const params: Record<string, string[]> = {};
  while (i < line.length && line[i] === ";") {
    i++;
    const pm = /^([A-Za-z0-9-]+)=/.exec(line.slice(i));
    if (!pm) {
      // Bare parameter without "=" (malformed) — skip to next ; or :
      const stop = line.slice(i).search(/[;:]/);
      if (stop < 0) return null;
      i += stop;
      continue;
    }
    const pname = pm[1]!.toUpperCase();
    i += pm[0].length;
    const values: string[] = [];
    for (;;) {
      let v = "";
      if (line[i] === '"') {
        const end = line.indexOf('"', i + 1);
        if (end < 0) return null;
        v = line.slice(i + 1, end);
        i = end + 1;
      } else {
        while (i < line.length && line[i] !== "," && line[i] !== ";" && line[i] !== ":") v += line[i++];
      }
      values.push(caret(v));
      if (line[i] === ",") {
        i++;
        continue;
      }
      break;
    }
    (params[pname] ??= []).push(...values);
  }
  if (line[i] !== ":") return null;
  return { name, params, value: line.slice(i + 1) };
}

/** Format a parameter value, quoting when it contains `:`, `;` or `,`. */
export function paramValue(v: string): string {
  const clean = v.replace(/[\r\n]+/g, " ").replace(/"/g, "'");
  return /[:;,]/.test(clean) ? `"${clean}"` : clean;
}
