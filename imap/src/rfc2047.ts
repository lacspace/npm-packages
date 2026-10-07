/** RFC 2047 encoded-word and RFC 2231 parameter decoding (just what IMAP structures need). */

const decoders = new Map<string, TextDecoder | null>();

export function decodeCharset(bytes: Uint8Array, charset: string): string {
  let cs = charset.trim().toLowerCase().replace(/\*.*$/, "");
  if (cs === "utf8") cs = "utf-8";
  if (cs === "" || cs === "us-ascii" || cs === "ascii") cs = "utf-8";
  if (cs === "ks_c_5601-1987") cs = "euc-kr";
  let d = decoders.get(cs);
  if (d === undefined) {
    try {
      d = new TextDecoder(cs);
    } catch {
      d = null;
    }
    decoders.set(cs, d);
  }
  if (d) return d.decode(bytes);
  return Buffer.from(bytes).toString("latin1");
}

function qDecode(s: string): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    const c = s[i]!;
    if (c === "_") out.push(0x20);
    else if (c === "=" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else out.push(c.charCodeAt(0) & 0xff);
  }
  return Uint8Array.from(out);
}

const WORD = /=\?([^?\s]+)\?([BbQq])\?([^?\s]*)\?=/g;

/** Decode `=?utf-8?B?...?=` words; adjacent words (whitespace only between) are joined, bytes merged per charset. */
export function decodeWords(input: string): string {
  if (!input || input.indexOf("=?") === -1) return input;
  let out = "";
  let last = 0;
  let pendingCharset: string | null = null;
  let pendingBytes: Uint8Array[] = [];
  const flush = () => {
    if (pendingCharset !== null) {
      out += decodeCharset(Buffer.concat(pendingBytes), pendingCharset);
      pendingCharset = null;
      pendingBytes = [];
    }
  };
  WORD.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = WORD.exec(input))) {
    const between = input.slice(last, m.index);
    const adjacent = pendingCharset !== null && /^[ \t\r\n]*$/.test(between);
    const charset = m[1]!.toLowerCase().replace(/\*.*$/, "");
    const bytes = m[2]!.toUpperCase() === "B" ? Buffer.from(m[3]!, "base64") : qDecode(m[3]!);
    if (adjacent && charset === pendingCharset) {
      pendingBytes.push(bytes);
    } else {
      flush();
      if (!adjacent) out += between;
      pendingCharset = charset;
      pendingBytes = [bytes];
    }
    last = m.index + m[0].length;
  }
  flush();
  out += input.slice(last);
  return out;
}

function percentDecode(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] === "%" && /^[0-9A-Fa-f]{2}$/.test(s.slice(i + 1, i + 3))) {
      out.push(parseInt(s.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      // keep UTF-16 → UTF-8 for any raw non-ASCII
      out.push(...Buffer.from(s[i]!, "utf8"));
    }
  }
  return out;
}

/** Lowercase keys, RFC 2231 continuations/charsets merged, RFC 2047 words decoded. */
export function decodeParams(pairs: [string, string][]): Record<string, string> {
  const out: Record<string, string> = {};
  const ext = new Map<string, { idx: number; encoded: boolean; value: string }[]>();
  for (const [rawKey, value] of pairs) {
    const key = rawKey.toLowerCase();
    const m = /^(.+?)\*(\d+)?(\*)?$/.exec(key);
    if (!m) {
      out[key] = decodeWords(value);
      continue;
    }
    const name = m[1]!;
    const idx = m[2] === undefined ? 0 : Number(m[2]);
    const encoded = m[2] === undefined ? true : !!m[3];
    let list = ext.get(name);
    if (!list) ext.set(name, (list = []));
    list.push({ idx, encoded, value });
  }
  for (const [name, list] of ext) {
    list.sort((a, b) => a.idx - b.idx);
    let charset = "utf-8";
    const bytes: number[] = [];
    list.forEach((seg, i) => {
      let v = seg.value;
      if (seg.encoded) {
        if (i === 0) {
          const q = /^([^']*)'([^']*)'(.*)$/s.exec(v);
          if (q) {
            if (q[1]) charset = q[1];
            v = q[3]!;
          }
        }
        bytes.push(...percentDecode(v));
      } else {
        bytes.push(...Buffer.from(v, "utf8"));
      }
    });
    out[name] = decodeCharset(Uint8Array.from(bytes), charset);
  }
  return out;
}
