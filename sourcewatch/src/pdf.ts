/**
 * Pure-JS PDF text extraction. Zero dependencies; uses the platform DecompressionStream for Flate.
 * Forgiving by design: it scans the file for `N G obj` objects (no xref needed), unpacks object
 * streams, walks the page tree, and runs a small content-stream interpreter that maps glyph codes
 * to Unicode via ToUnicode CMaps or simple-font encodings. It never throws; it returns what it got.
 */

// ---------------------------------------------------------------- values

class PName {
  constructor(public v: string) {}
}
class PStr {
  constructor(public v: string) {} // latin1: one char per byte
}
class PRef {
  constructor(public n: number, public g: number) {}
}
class POp {
  constructor(public v: string) {}
}
class PDict {
  constructor(public m: Record<string, PVal> = {}) {}
  get(k: string): PVal | undefined {
    return this.m[k];
  }
}
type PVal = number | boolean | null | PName | PStr | PRef | PDict | PVal[];

interface PObj {
  val: PVal;
  /** Stream data as [start, end) into `src` bytes. */
  stream?: { src: Uint8Array; start: number; end: number };
  pos: number; // ordering for incremental-update precedence
}

// ---------------------------------------------------------------- lexer

const WS = new Uint8Array(256);
for (const c of [0, 9, 10, 12, 13, 32]) WS[c] = 1;
const DELIM = new Uint8Array(256);
for (const c of "()<>[]{}/%") DELIM[c.charCodeAt(0)] = 1;

const MAX_DEPTH = 64;

class Lexer {
  constructor(public s: string, public p = 0, public end = s.length) {}

  skipWs(): void {
    const s = this.s;
    while (this.p < this.end) {
      const c = s.charCodeAt(this.p);
      if (WS[c]) this.p++;
      else if (c === 37 /* % */) {
        while (this.p < this.end) {
          const d = s.charCodeAt(this.p);
          if (d === 10 || d === 13) break;
          this.p++;
        }
      } else break;
    }
  }

  /** Next raw token: number | PName | PStr | POp (keywords and delimiters "[", "]", "<<", ">>", "{", "}"). */
  token(): number | PName | PStr | POp | undefined {
    this.skipWs();
    if (this.p >= this.end) return undefined;
    const s = this.s;
    const c = s[this.p]!;
    if (c === "/") {
      let q = this.p + 1;
      while (q < this.end) {
        const d = s.charCodeAt(q);
        if (WS[d] || DELIM[d]) break;
        q++;
      }
      let name = s.slice(this.p + 1, q);
      this.p = q;
      if (name.indexOf("#") >= 0) name = name.replace(/#([0-9a-fA-F]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
      return new PName(name);
    }
    if (c === "(") return this.literal();
    if (c === "<") {
      if (s[this.p + 1] === "<") {
        this.p += 2;
        return new POp("<<");
      }
      return this.hex();
    }
    if (c === ">") {
      if (s[this.p + 1] === ">") {
        this.p += 2;
        return new POp(">>");
      }
      this.p++;
      return new POp(">");
    }
    if (c === "[" || c === "]" || c === "{" || c === "}") {
      this.p++;
      return new POp(c);
    }
    if (c === ")") {
      this.p++;
      return new POp(")");
    }
    let q = this.p;
    while (q < this.end) {
      const d = s.charCodeAt(q);
      if (WS[d] || DELIM[d]) break;
      q++;
    }
    if (q === this.p) q++;
    const word = s.slice(this.p, q);
    this.p = q;
    const c0 = word.charCodeAt(0);
    if ((c0 >= 48 && c0 <= 57) || c0 === 43 || c0 === 45 || c0 === 46) {
      const n = parseFloat(word.replace(/^([+-])[+-]+/, "$1").replace(/(\d)-.*$/, "$1"));
      if (!Number.isNaN(n)) return n;
      if (/^[+\-.]+$/.test(word)) return 0;
    }
    return new POp(word);
  }

  private literal(): PStr {
    const s = this.s;
    let p = this.p + 1;
    let depth = 1;
    let out = "";
    while (p < this.end) {
      const c = s[p]!;
      if (c === "\\") {
        const n = s[p + 1];
        p += 2;
        switch (n) {
          case "n": out += "\n"; break;
          case "r": out += "\r"; break;
          case "t": out += "\t"; break;
          case "b": out += "\b"; break;
          case "f": out += "\f"; break;
          case "(": out += "("; break;
          case ")": out += ")"; break;
          case "\\": out += "\\"; break;
          case "\r":
            if (s[p] === "\n") p++;
            break;
          case "\n":
            break;
          case undefined:
            break;
          default:
            if (n >= "0" && n <= "7") {
              let oct = n;
              for (let k = 0; k < 2 && s[p]! >= "0" && s[p]! <= "7"; k++) oct += s[p++];
              out += String.fromCharCode(parseInt(oct, 8) & 0xff);
            } else out += n;
        }
        continue;
      }
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) {
          p++;
          break;
        }
      }
      out += c;
      p++;
    }
    this.p = p;
    return new PStr(out);
  }

  private hex(): PStr {
    const s = this.s;
    let p = this.p + 1;
    let digits = "";
    while (p < this.end && s[p] !== ">") {
      const c = s.charCodeAt(p);
      if ((c >= 48 && c <= 57) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102)) digits += s[p];
      p++;
    }
    this.p = p + 1;
    if (digits.length % 2) digits += "0";
    let out = "";
    for (let i = 0; i < digits.length; i += 2) out += String.fromCharCode(parseInt(digits.substr(i, 2), 16));
    return new PStr(out);
  }

  /** Parse one value. `refs` enables `n g R` lookahead (object syntax, not content streams). */
  value(refs: boolean, depth = 0): PVal | POp | undefined {
    const t = this.token();
    if (t === undefined) return undefined;
    if (typeof t === "number") {
      if (refs && Number.isInteger(t) && t >= 0) {
        const save = this.p;
        const g = this.token();
        if (typeof g === "number" && Number.isInteger(g)) {
          const r = this.token();
          if (r instanceof POp && r.v === "R") return new PRef(t, g);
        }
        this.p = save;
      }
      return t;
    }
    if (!(t instanceof POp)) return t;
    if (depth > MAX_DEPTH) return null;
    if (t.v === "[") {
      const arr: PVal[] = [];
      for (let guard = 0; guard < 1e6; guard++) {
        const save = this.p;
        const v = this.value(refs, depth + 1);
        if (v === undefined) break;
        if (v instanceof POp) {
          if (v.v === "]") break;
          if (v.v === ">>" || v.v === "endobj" || v.v === "stream") {
            this.p = save;
            break;
          }
          if (v.v === "true" || v.v === "false") arr.push(v.v === "true");
          else if (v.v === "null") arr.push(null);
          continue;
        }
        arr.push(v);
      }
      return arr;
    }
    if (t.v === "<<") {
      const d = new PDict();
      for (let guard = 0; guard < 1e6; guard++) {
        const save = this.p;
        const k = this.value(refs, depth + 1);
        if (k === undefined) break;
        if (k instanceof POp) {
          if (k.v === ">>") break;
          if (k.v === "endobj" || k.v === "stream") {
            this.p = save;
            break;
          }
          continue;
        }
        if (!(k instanceof PName)) continue;
        const save2 = this.p;
        const v = this.value(refs, depth + 1);
        if (v === undefined) break;
        if (v instanceof POp) {
          if (v.v === ">>") {
            d.m[k.v] = null;
            break;
          }
          if (v.v === "true" || v.v === "false") d.m[k.v] = v.v === "true";
          else if (v.v === "null") d.m[k.v] = null;
          else {
            this.p = save2;
            if (v.v === "endobj" || v.v === "stream") break;
            this.token();
          }
          continue;
        }
        d.m[k.v] = v;
      }
      return d;
    }
    if (t.v === "true") return true;
    if (t.v === "false") return false;
    if (t.v === "null") return null;
    return t;
  }
}

// ---------------------------------------------------------------- helpers

function latin1(bytes: Uint8Array, start = 0, end = bytes.length): string {
  let out = "";
  const CH = 8192;
  for (let i = start; i < end; i += CH) {
    out += String.fromCharCode.apply(null, bytes.subarray(i, Math.min(end, i + CH)) as unknown as number[]);
  }
  return out;
}

function concat(chunks: Uint8Array[], total?: number): Uint8Array {
  const len = total ?? chunks.reduce((a, c) => a + c.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const c of chunks) {
    if (o + c.length > len) {
      out.set(c.subarray(0, len - o), o);
      break;
    }
    out.set(c, o);
    o += c.length;
  }
  return out;
}

const MAX_INFLATE = 64 * 1024 * 1024;

async function runDecompress(format: string, data: Uint8Array): Promise<Uint8Array> {
  let ds: DecompressionStream;
  try {
    ds = new DecompressionStream(format as CompressionFormat);
  } catch {
    return new Uint8Array(0);
  }
  const writer = ds.writable.getWriter();
  const reader = ds.readable.getReader();
  const w = writer
    .write(data as unknown as BufferSource)
    .then(() => writer.close())
    .catch(() => undefined);
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
      if (total > MAX_INFLATE) {
        reader.cancel().catch(() => undefined);
        break;
      }
    }
  } catch {
    /* corrupt / trailing junk: keep what we have */
  }
  await w;
  return concat(chunks, Math.min(total, MAX_INFLATE));
}

async function inflate(data: Uint8Array): Promise<Uint8Array> {
  if (data.length < 2) return new Uint8Array(0);
  const zlibHeader = (data[0]! & 0x0f) === 8 && ((data[0]! << 8) | data[1]!) % 31 === 0;
  if (zlibHeader) {
    const out = await runDecompress("deflate", data);
    if (out.length) return out;
    return runDecompress("deflate-raw", data.subarray(2));
  }
  return runDecompress("deflate-raw", data);
}

function asciiHex(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let hi = -1;
  for (const c of data) {
    if (c === 62) break; // >
    let v = -1;
    if (c >= 48 && c <= 57) v = c - 48;
    else if (c >= 65 && c <= 70) v = c - 55;
    else if (c >= 97 && c <= 102) v = c - 87;
    if (v < 0) continue;
    if (hi < 0) hi = v;
    else {
      out.push((hi << 4) | v);
      hi = -1;
    }
  }
  if (hi >= 0) out.push(hi << 4);
  return Uint8Array.from(out);
}

function ascii85(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let i = 0;
  if (data[0] === 60 && data[1] === 126) i = 2; // <~
  const group: number[] = [];
  for (; i < data.length; i++) {
    const c = data[i]!;
    if (c === 126) break; // ~>
    if (WS[c]) continue;
    if (c === 122 && group.length === 0) {
      out.push(0, 0, 0, 0);
      continue;
    }
    if (c < 33 || c > 117) continue;
    group.push(c - 33);
    if (group.length === 5) {
      let v = 0;
      for (const g of group) v = v * 85 + g;
      out.push((v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255);
      group.length = 0;
    }
  }
  if (group.length > 1) {
    const n = group.length;
    while (group.length < 5) group.push(84);
    let v = 0;
    for (const g of group) v = v * 85 + g;
    const bytes = [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    out.push(...bytes.slice(0, n - 1));
  }
  return Uint8Array.from(out);
}

function lzw(data: Uint8Array, early: number): Uint8Array {
  const out: number[] = [];
  let dict: number[][] = [];
  const reset = () => {
    dict = [];
    for (let i = 0; i < 256; i++) dict.push([i]);
    dict.push([], []);
  };
  reset();
  let bits = 9;
  let buf = 0;
  let nbuf = 0;
  let prev: number[] | null = null;
  for (let i = 0; i < data.length; i++) {
    buf = ((buf << 8) | data[i]!) >>> 0;
    nbuf += 8;
    while (nbuf >= bits) {
      const code = (buf >>> (nbuf - bits)) & ((1 << bits) - 1);
      nbuf -= bits;
      if (code === 256) {
        reset();
        bits = 9;
        prev = null;
        continue;
      }
      if (code === 257) return Uint8Array.from(out);
      let entry: number[];
      if (code < dict.length && dict[code]!.length) entry = dict[code]!;
      else if (prev) entry = prev.concat(prev[0]!);
      else return Uint8Array.from(out);
      for (const b of entry) out.push(b);
      if (prev) dict.push(prev.concat(entry[0]!));
      prev = entry;
      const size = dict.length + early;
      if (size >= 2048) bits = 12;
      else if (size >= 1024) bits = 11;
      else if (size >= 512) bits = 10;
      if (out.length > MAX_INFLATE) return Uint8Array.from(out);
    }
  }
  return Uint8Array.from(out);
}

function runLength(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (let i = 0; i < data.length; ) {
    const n = data[i++]!;
    if (n === 128) break;
    if (n < 128) {
      for (let k = 0; k <= n && i < data.length; k++) out.push(data[i++]!);
    } else {
      const b = data[i++] ?? 0;
      for (let k = 0; k < 257 - n; k++) out.push(b);
    }
  }
  return Uint8Array.from(out);
}

function unpredict(data: Uint8Array, parms: PDict | null): Uint8Array {
  if (!parms) return data;
  const predictor = num(parms.get("Predictor"), 1);
  if (predictor < 2) return data;
  const colors = num(parms.get("Colors"), 1);
  const bpc = num(parms.get("BitsPerComponent"), 8);
  const columns = num(parms.get("Columns"), 1);
  const bpp = Math.max(1, Math.ceil((colors * bpc) / 8));
  const rowLen = Math.ceil((colors * bpc * columns) / 8);
  if (predictor === 2) {
    if (bpc !== 8) return data;
    const out = Uint8Array.from(data);
    for (let r = 0; r < out.length; r += rowLen) {
      for (let i = bpp; i < rowLen && r + i < out.length; i++) out[r + i] = (out[r + i]! + out[r + i - bpp]!) & 255;
    }
    return out;
  }
  const rows = Math.floor(data.length / (rowLen + 1));
  const out = new Uint8Array(rows * rowLen);
  let prev = new Uint8Array(rowLen);
  for (let r = 0; r < rows; r++) {
    const type = data[r * (rowLen + 1)]!;
    const row = data.subarray(r * (rowLen + 1) + 1, (r + 1) * (rowLen + 1));
    const cur = new Uint8Array(rowLen);
    for (let i = 0; i < rowLen; i++) {
      const left = i >= bpp ? cur[i - bpp]! : 0;
      const up = prev[i]!;
      const ul = i >= bpp ? prev[i - bpp]! : 0;
      let v = row[i] ?? 0;
      switch (type) {
        case 1: v += left; break;
        case 2: v += up; break;
        case 3: v += (left + up) >> 1; break;
        case 4: {
          const p = left + up - ul;
          const pa = Math.abs(p - left), pb = Math.abs(p - up), pc = Math.abs(p - ul);
          v += pa <= pb && pa <= pc ? left : pb <= pc ? up : ul;
          break;
        }
      }
      cur[i] = v & 255;
    }
    out.set(cur, r * rowLen);
    prev = cur;
  }
  return out;
}

function num(v: PVal | undefined, d: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : d;
}

const IMAGE_FILTERS = new Set(["DCTDecode", "DCT", "JPXDecode", "CCITTFaxDecode", "CCF", "JBIG2Decode", "Crypt"]);

// ---------------------------------------------------------------- document

class Doc {
  s: string;
  objs = new Map<number, PObj>();
  trailers: { pos: number; d: PDict }[] = [];
  private streamCache = new Map<PObj, Promise<Uint8Array | null>>();
  encrypted = false;

  constructor(public bytes: Uint8Array) {
    this.s = latin1(bytes);
  }

  private put(n: number, o: PObj): void {
    const cur = this.objs.get(n);
    if (!cur || cur.pos <= o.pos) this.objs.set(n, o);
  }

  scan(): void {
    const s = this.s;
    const re = /(\d+)\s+(\d+)\s+obj\b/g;
    let count = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(s)) && count++ < 2_000_000) {
      if (m.index > 0 && s.charCodeAt(m.index - 1) >= 48 && s.charCodeAt(m.index - 1) <= 57) continue;
      const n = parseInt(m[1]!, 10);
      const lex = new Lexer(s, re.lastIndex);
      let val: PVal | POp | undefined;
      try {
        val = lex.value(true);
      } catch {
        continue;
      }
      if (val instanceof POp || val === undefined) val = null;
      const obj: PObj = { val, pos: m.index };
      const save = lex.p;
      const kw = lex.token();
      if (kw instanceof POp && kw.v === "stream") {
        let start = lex.p;
        if (s[start] === "\r") start++;
        if (s[start] === "\n") start++;
        let end = -1;
        const len = val instanceof PDict ? val.get("Length") : undefined;
        if (typeof len === "number" && len >= 0 && start + len <= s.length) {
          const tail = s.slice(start + len, start + len + 32);
          if (/^\s*endstream/.test(tail)) end = start + len;
        }
        if (end < 0) {
          const e = s.indexOf("endstream", start);
          end = e < 0 ? s.length : e;
          if (e >= 0) {
            if (s[end - 1] === "\n") end--;
            if (s[end - 1] === "\r") end--;
          }
        }
        obj.stream = { src: this.bytes, start, end: Math.max(start, end) };
        re.lastIndex = Math.max(re.lastIndex, end);
      } else {
        lex.p = save;
        re.lastIndex = Math.max(re.lastIndex, lex.p);
      }
      this.put(n, obj);
      if (val instanceof PDict && val.get("Type") instanceof PName && (val.get("Type") as PName).v === "XRef") {
        this.trailers.push({ pos: m.index, d: val });
      }
    }
    const tre = /trailer\s*<</g;
    while ((m = tre.exec(s))) {
      const lex = new Lexer(s, m.index + 7);
      const v = lex.value(true);
      if (v instanceof PDict) this.trailers.push({ pos: m.index, d: v });
    }
    this.trailers.sort((a, b) => a.pos - b.pos);
    this.encrypted = this.trailers.some((t) => t.d.get("Encrypt") !== undefined);
  }

  async loadObjectStreams(): Promise<void> {
    const streams = [...this.objs.values()].filter(
      (o) => o.stream && o.val instanceof PDict && (o.val.get("Type") as PName | undefined)?.v === "ObjStm",
    );
    for (const o of streams.slice(0, 10000)) {
      const d = o.val as PDict;
      const data = await this.streamData(o);
      if (!data) continue;
      const s = latin1(data);
      const n = num(this.get(d.get("N")), 0);
      const first = num(this.get(d.get("First")), 0);
      const head = new Lexer(s, 0, Math.min(first, s.length));
      const pairs: [number, number][] = [];
      for (let i = 0; i < n && i < 100000; i++) {
        const a = head.token();
        const b = head.token();
        if (typeof a !== "number" || typeof b !== "number") break;
        pairs.push([a, b]);
      }
      for (let i = 0; i < pairs.length; i++) {
        const [objNum, off] = pairs[i]!;
        const lex = new Lexer(s, first + off, i + 1 < pairs.length ? first + pairs[i + 1]![1] : s.length);
        let v: PVal | POp | undefined;
        try {
          v = lex.value(true);
        } catch {
          continue;
        }
        if (v instanceof POp || v === undefined) continue;
        this.put(objNum, { val: v, pos: o.pos });
      }
    }
  }

  /** Resolve references (bounded). */
  get(v: PVal | undefined): PVal | undefined {
    for (let i = 0; i < 32 && v instanceof PRef; i++) v = this.objs.get(v.n)?.val;
    return v instanceof PRef ? undefined : v;
  }
  dict(v: PVal | undefined): PDict | null {
    const r = this.get(v);
    return r instanceof PDict ? r : null;
  }
  obj(v: PVal | undefined): PObj | undefined {
    for (let i = 0; i < 32 && v instanceof PRef; i++) {
      const o = this.objs.get(v.n);
      if (!o) return undefined;
      if (!(o.val instanceof PRef)) return o;
      v = o.val;
    }
    return undefined;
  }

  streamData(o: PObj | undefined): Promise<Uint8Array | null> {
    if (!o || !o.stream) return Promise.resolve(null);
    let p = this.streamCache.get(o);
    if (!p) {
      p = this.decode(o).catch(() => null);
      this.streamCache.set(o, p);
    }
    return p;
  }

  private async decode(o: PObj): Promise<Uint8Array | null> {
    const { src, start, end } = o.stream!;
    let data: Uint8Array = src.subarray(start, end);
    const d = o.val instanceof PDict ? o.val : new PDict();
    const fv = this.get(d.get("Filter"));
    const filters = (Array.isArray(fv) ? fv : fv === undefined || fv === null ? [] : [fv]).map((f) => this.get(f));
    const pv = this.get(d.get("DecodeParms") ?? d.get("DP"));
    const parms = Array.isArray(pv) ? pv.map((p) => this.dict(p)) : [this.dict(pv)];
    for (let i = 0; i < filters.length; i++) {
      const f = filters[i];
      if (!(f instanceof PName)) return null;
      const parm = parms[i] ?? null;
      switch (f.v) {
        case "FlateDecode":
        case "Fl":
          data = unpredict(await inflate(data), parm);
          break;
        case "LZWDecode":
        case "LZW":
          data = unpredict(lzw(data, num(parm?.get("EarlyChange"), 1)), parm);
          break;
        case "ASCIIHexDecode":
        case "AHx":
          data = asciiHex(data);
          break;
        case "ASCII85Decode":
        case "A85":
          data = ascii85(data);
          break;
        case "RunLengthDecode":
        case "RL":
          data = runLength(data);
          break;
        default:
          if (IMAGE_FILTERS.has(f.v)) return null;
          return null;
      }
    }
    return data;
  }

  root(): PDict | null {
    for (let i = this.trailers.length - 1; i >= 0; i--) {
      const r = this.dict(this.trailers[i]!.d.get("Root"));
      if (r) return r;
    }
    for (const o of this.objs.values()) {
      if (o.val instanceof PDict && (o.val.get("Type") as PName | undefined)?.v === "Catalog") return o.val;
    }
    return null;
  }

  /** Pages in page-tree order (with inherited Resources); falls back to file order of /Type /Page objects. */
  pages(): { page: PDict; res: PDict | null }[] {
    const out: { page: PDict; res: PDict | null }[] = [];
    const seen = new Set<PDict>();
    const walk = (node: PDict | null, res: PDict | null, depth: number): void => {
      if (!node || seen.has(node) || depth > 64 || out.length > 5000) return;
      seen.add(node);
      const own = this.dict(node.get("Resources"));
      const r = own ?? res;
      const kids = this.get(node.get("Kids"));
      const type = (this.get(node.get("Type")) as PName | undefined)?.v;
      if (Array.isArray(kids) && type !== "Page") {
        for (const k of kids) walk(this.dict(k), r, depth + 1);
      } else if (type === "Page" || node.get("Contents") !== undefined) {
        out.push({ page: node, res: r });
      }
    };
    const root = this.root();
    if (root) walk(this.dict(root.get("Pages")), null, 0);
    if (out.length === 0) {
      const list = [...this.objs.values()]
        .filter((o) => o.val instanceof PDict && (o.val.get("Type") as PName | undefined)?.v === "Page")
        .sort((a, b) => a.pos - b.pos);
      for (const o of list) {
        const pg = o.val as PDict;
        let res = this.dict(pg.get("Resources"));
        let parent = this.dict(pg.get("Parent"));
        for (let i = 0; !res && parent && i < 32; i++) {
          res = this.dict(parent.get("Resources"));
          parent = this.dict(parent.get("Parent"));
        }
        out.push({ page: pg, res });
      }
    }
    return out;
  }
}

// ---------------------------------------------------------------- fonts

const WIN_ANSI_HIGH: Record<number, string> = {
  0x80: "€", 0x82: "‚", 0x83: "ƒ", 0x84: "„", 0x85: "…", 0x86: "†", 0x87: "‡", 0x88: "ˆ", 0x89: "‰",
  0x8a: "Š", 0x8b: "‹", 0x8c: "Œ", 0x8e: "Ž", 0x91: "‘", 0x92: "’", 0x93: "“", 0x94: "”", 0x95: "•",
  0x96: "–", 0x97: "—", 0x98: "˜", 0x99: "™", 0x9a: "š", 0x9b: "›", 0x9c: "œ", 0x9e: "ž", 0x9f: "Ÿ",
};

const GLYPHS: Record<string, string> = {
  space: " ", exclam: "!", quotedbl: '"', numbersign: "#", dollar: "$", percent: "%", ampersand: "&",
  quotesingle: "'", quoteright: "’", quoteleft: "‘", parenleft: "(", parenright: ")", asterisk: "*",
  plus: "+", comma: ",", hyphen: "-", minus: "−", period: ".", slash: "/", zero: "0", one: "1", two: "2",
  three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9", colon: ":",
  semicolon: ";", less: "<", equal: "=", greater: ">", question: "?", at: "@", bracketleft: "[",
  backslash: "\\", bracketright: "]", asciicircum: "^", underscore: "_", grave: "`", braceleft: "{",
  bar: "|", braceright: "}", asciitilde: "~", quotedblleft: "“", quotedblright: "”", quotesinglbase: "‚",
  quotedblbase: "„", endash: "–", emdash: "—", bullet: "•", ellipsis: "…", copyright: "©",
  registered: "®", trademark: "™", degree: "°", nbspace: "\u00A0", nonbreakingspace: "\u00A0",
  fi: "fi", fl: "fl", ff: "ff", ffi: "ffi", ffl: "ffl", dagger: "†", daggerdbl: "‡", section: "§",
  paragraph: "¶", periodcentered: "·", middot: "·", sterling: "£", Euro: "€", euro: "€", cent: "¢",
  yen: "¥", multiply: "×", divide: "÷", plusminus: "±", guillemotleft: "«", guillemotright: "»",
  exclamdown: "¡", questiondown: "¿", onehalf: "½", onequarter: "¼", threequarters: "¾",
  dotlessi: "ı", germandbls: "ß", sfthyphen: "\u00AD", tab: " ",
};

function glyphToUnicode(name: string): string | undefined {
  if (GLYPHS[name] !== undefined) return GLYPHS[name];
  if (/^[A-Za-z]$/.test(name)) return name;
  let m = /^uni((?:[0-9A-Fa-f]{4})+)$/.exec(name);
  if (m) {
    let s = "";
    for (let i = 0; i < m[1]!.length; i += 4) s += String.fromCharCode(parseInt(m[1]!.substr(i, 4), 16));
    return s;
  }
  m = /^u([0-9A-Fa-f]{4,6})$/.exec(name);
  if (m) {
    const cp = parseInt(m[1]!, 16);
    return cp <= 0x10ffff && (cp < 0xd800 || cp > 0xdfff) ? String.fromCodePoint(cp) : undefined;
  }
  if (name.includes(".")) return glyphToUnicode(name.slice(0, name.indexOf(".")));
  if (name.includes("_")) {
    const parts = name.split("_").map(glyphToUnicode);
    return parts.every((p) => p !== undefined) ? parts.join("") : undefined;
  }
  return undefined;
}

interface Range {
  len: number;
  lo: number[];
  hi: number[];
}

interface Font {
  composite: boolean;
  /** code key -> unicode (from ToUnicode). Key = value + len * 2^32. */
  uni: Map<number, string> | null;
  ranges: Range[];
  /** Simple fonts: 256 entries. */
  simple: (string | undefined)[] | null;
  widths: (code: number) => number; // in 1/1000 em
  spaceCode: number; // byte value used for word spacing (simple fonts: 32)
}

const key = (val: number, len: number) => val + len * 4294967296;

async function parseCMap(doc: Doc, o: PObj | undefined): Promise<{ map: Map<number, string>; ranges: Range[] } | null> {
  const data = await doc.streamData(o);
  if (!data) return null;
  const lex = new Lexer(latin1(data));
  const map = new Map<number, string>();
  const ranges: Range[] = [];
  const bytesOf = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
  const valOf = (s: string) => {
    let v = 0;
    for (let i = 0; i < s.length && i < 4; i++) v = v * 256 + s.charCodeAt(i);
    return v;
  };
  const utf16 = (s: string): string => {
    if (s.length === 1) return s;
    let out = "";
    for (let i = 0; i + 1 < s.length; i += 2) out += String.fromCharCode((s.charCodeAt(i) << 8) | s.charCodeAt(i + 1));
    return out;
  };
  let guard = 0;
  for (;;) {
    if (guard++ > 5_000_000) break;
    const t = lex.token();
    if (t === undefined) break;
    if (!(t instanceof POp)) continue;
    if (t.v === "begincodespacerange") {
      for (;;) {
        const a = lex.token();
        if (!(a instanceof PStr)) break;
        const b = lex.token();
        if (!(b instanceof PStr)) break;
        ranges.push({ len: a.v.length, lo: bytesOf(a.v), hi: bytesOf(b.v) });
      }
    } else if (t.v === "beginbfchar") {
      for (;;) {
        const a = lex.token();
        if (!(a instanceof PStr)) break;
        const b = lex.token();
        if (b instanceof PStr) map.set(key(valOf(a.v), a.v.length), utf16(b.v));
        else if (b instanceof PName) {
          const u = glyphToUnicode(b.v);
          if (u !== undefined) map.set(key(valOf(a.v), a.v.length), u);
        } else break;
      }
    } else if (t.v === "beginbfrange") {
      for (;;) {
        const a = lex.token();
        if (!(a instanceof PStr)) break;
        const b = lex.token();
        if (!(b instanceof PStr)) break;
        const lo = valOf(a.v);
        const hi = Math.min(valOf(b.v), lo + 65535);
        const len = a.v.length;
        const save = lex.p;
        const dst = lex.token();
        if (dst instanceof PStr) {
          const base = utf16(dst.v);
          if (!base.length) continue;
          const head = base.slice(0, -1);
          const last = base.charCodeAt(base.length - 1);
          for (let c = lo; c <= hi; c++) map.set(key(c, len), head + String.fromCharCode((last + (c - lo)) & 0xffff));
        } else if (dst instanceof POp && dst.v === "[") {
          lex.p = save;
          const arr = lex.value(false);
          if (Array.isArray(arr)) {
            for (let c = lo, i = 0; c <= hi && i < arr.length; c++, i++) {
              const e = arr[i];
              if (e instanceof PStr) map.set(key(c, len), utf16(e.v));
            }
          }
        } else break;
      }
    }
  }
  return { map, ranges };
}

function simpleEncoding(doc: Doc, fontDict: PDict): (string | undefined)[] {
  const base: (string | undefined)[] = new Array(256);
  for (let i = 32; i < 256; i++) base[i] = i >= 0x80 && i <= 0x9f ? WIN_ANSI_HIGH[i] : String.fromCharCode(i);
  const enc = doc.get(fontDict.get("Encoding"));
  const applyDiff = (diff: PVal | undefined) => {
    const arr = doc.get(diff);
    if (!Array.isArray(arr)) return;
    let code = 0;
    for (const e of arr) {
      const v = doc.get(e);
      if (typeof v === "number") code = v;
      else if (v instanceof PName) {
        if (code >= 0 && code < 256) {
          const u = glyphToUnicode(v.v);
          if (u !== undefined) base[code] = u;
        }
        code++;
      }
    }
  };
  if (enc instanceof PDict) applyDiff(enc.get("Differences"));
  return base;
}

async function loadFont(doc: Doc, ref: PVal | undefined): Promise<Font> {
  const fd = doc.dict(ref) ?? new PDict();
  const subtype = (doc.get(fd.get("Subtype")) as PName | undefined)?.v;
  const composite = subtype === "Type0";
  let uni: Map<number, string> | null = null;
  let ranges: Range[] = [];
  const tu = fd.get("ToUnicode");
  if (tu !== undefined) {
    const cm = await parseCMap(doc, doc.obj(tu));
    if (cm && cm.map.size) {
      uni = cm.map;
      ranges = cm.ranges;
    }
  }
  if (!ranges.length) ranges = [composite ? { len: 2, lo: [0, 0], hi: [255, 255] } : { len: 1, lo: [0], hi: [255] }];
  let widths: (code: number) => number = () => (composite ? 1000 : 500);
  if (composite) {
    const desc = doc.get(fd.get("DescendantFonts"));
    const cid = doc.dict(Array.isArray(desc) ? desc[0] : undefined);
    if (cid) {
      const dw = num(doc.get(cid.get("DW")), 1000);
      const w = doc.get(cid.get("W"));
      const table = new Map<number, number>();
      if (Array.isArray(w)) {
        for (let i = 0; i < w.length && table.size < 200000; ) {
          const a = doc.get(w[i]);
          const b = doc.get(w[i + 1]);
          if (typeof a !== "number") break;
          if (Array.isArray(b)) {
            b.forEach((x, k) => table.set(a + k, num(doc.get(x), dw)));
            i += 2;
          } else if (typeof b === "number") {
            const c = num(doc.get(w[i + 2]), dw);
            for (let k = a; k <= b && k - a < 65536; k++) table.set(k, c);
            i += 3;
          } else break;
        }
      }
      widths = (code) => table.get(code) ?? dw;
    }
  } else {
    const first = num(doc.get(fd.get("FirstChar")), 0);
    const wa = doc.get(fd.get("Widths"));
    if (Array.isArray(wa)) {
      const ws = wa.map((x) => num(doc.get(x), 0));
      const missing = num(doc.get(doc.dict(fd.get("FontDescriptor"))?.get("MissingWidth")), 0);
      widths = (code) => ws[code - first] ?? missing;
    }
  }
  return {
    composite,
    uni,
    ranges,
    simple: composite ? null : simpleEncoding(doc, fd),
    widths,
    spaceCode: 32,
  };
}

/** Split a string into codes using the codespace ranges. */
function codes(font: Font, s: string): { code: number; len: number }[] {
  const out: { code: number; len: number }[] = [];
  let i = 0;
  const lens = [...new Set(font.ranges.map((r) => r.len))].sort((a, b) => a - b);
  while (i < s.length) {
    let done = false;
    for (const len of lens) {
      if (i + len > s.length) continue;
      for (const r of font.ranges) {
        if (r.len !== len) continue;
        let ok = true;
        for (let k = 0; k < len; k++) {
          const b = s.charCodeAt(i + k);
          if (b < r.lo[k]! || b > r.hi[k]!) {
            ok = false;
            break;
          }
        }
        if (ok) {
          let v = 0;
          for (let k = 0; k < len; k++) v = v * 256 + s.charCodeAt(i + k);
          out.push({ code: v, len });
          i += len;
          done = true;
          break;
        }
      }
      if (done) break;
    }
    if (!done) {
      const len = font.composite ? Math.min(2, s.length - i) : 1;
      let v = 0;
      for (let k = 0; k < len; k++) v = v * 256 + s.charCodeAt(i + k);
      out.push({ code: v, len });
      i += len;
    }
  }
  return out;
}

function decodeGlyph(font: Font, code: number, len: number): string {
  if (font.uni) {
    const u = font.uni.get(key(code, len));
    if (u !== undefined) return u;
  }
  if (font.simple && len === 1) return font.simple[code] ?? "";
  return ""; // composite without mapping: undecodable, emit nothing
}

// ---------------------------------------------------------------- interpreter

type M = [number, number, number, number, number, number];
const ID: M = [1, 0, 0, 1, 0, 0];
const mul = (a: M, b: M): M => [
  a[0] * b[0] + a[1] * b[2],
  a[0] * b[1] + a[1] * b[3],
  a[2] * b[0] + a[3] * b[2],
  a[2] * b[1] + a[3] * b[3],
  a[4] * b[0] + a[5] * b[2] + b[4],
  a[4] * b[1] + a[5] * b[3] + b[5],
];

interface Out {
  parts: string[];
  chars: number;
  last?: { x: number; y: number; size: number };
  ops: number;
}

const MAX_OPS = 5_000_000;
const MAX_CHARS = 8_000_000;

function emitBreak(out: Out, s: string): void {
  const prev = out.parts[out.parts.length - 1];
  if (!prev) return;
  const end = prev[prev.length - 1];
  if (s === "\n" && end !== "\n") out.parts.push("\n");
  else if (s === " " && end !== " " && end !== "\n") out.parts.push(" ");
}

async function runContent(
  doc: Doc,
  data: Uint8Array,
  res: PDict | null,
  ctm0: M,
  out: Out,
  fontCache: Map<PDict | PVal, Font>,
  depth: number,
  seenForms: Set<PObj>,
): Promise<void> {
  const lex = new Lexer(latin1(data));
  const stack: (PVal | POp)[] = [];
  let ctm = ctm0;
  const gstack: { ctm: M; font: Font | null; size: number; tc: number; tw: number; th: number; tl: number; rise: number }[] = [];
  let font: Font | null = null;
  let size = 1;
  let tc = 0, tw = 0, th = 1, tl = 0, rise = 0;
  let tm: M = ID;
  let lm: M = ID;
  const fonts = doc.dict(res?.get("Font"));
  const xobjs = doc.dict(res?.get("XObject"));

  const fontFor = async (name: string): Promise<Font | null> => {
    const ref = fonts?.get(name);
    if (ref === undefined) return null;
    const keyObj = (ref instanceof PRef ? doc.get(ref) : ref) ?? ref;
    let f = fontCache.get(keyObj as PDict);
    if (!f) {
      f = await loadFont(doc, ref);
      fontCache.set(keyObj as PDict, f);
    }
    return f;
  };

  const show = (s: string) => {
    if (out.chars > MAX_CHARS) return;
    const trm = mul([size * th, 0, 0, size, 0, rise], mul(tm, ctm));
    const x = trm[4], y = trm[5];
    const fsize = Math.hypot(trm[2], trm[3]) || Math.abs(size) || 1;
    if (out.last) {
      const dy = Math.abs(y - out.last.y);
      if (dy > 0.5 * Math.min(fsize, out.last.size)) emitBreak(out, "\n");
      else if (x - out.last.x > 0.2 * fsize || out.last.x - x > fsize * 1.5) emitBreak(out, " ");
    }
    let text = "";
    if (font) {
      for (const { code, len } of codes(font, s)) {
        text += decodeGlyph(font, code, len);
        const w = font.widths(code) / 1000;
        const adv = (w * size + tc + (len === 1 && code === font.spaceCode ? tw : 0)) * th;
        tm = mul([1, 0, 0, 1, adv, 0], tm);
      }
    }
    if (text) {
      out.parts.push(text.replace(/[\u0000-\u0008\u000B-\u001F]/g, ""));
      out.chars += text.length;
    }
    const end = mul([size * th, 0, 0, size, 0, rise], mul(tm, ctm));
    out.last = { x: end[4], y: end[5], size: fsize };
  };

  const nl = () => {
    lm = mul([1, 0, 0, 1, 0, -tl], lm);
    tm = lm;
  };

  for (;;) {
    if (++out.ops > MAX_OPS) return;
    const save = lex.p;
    const v = lex.value(false);
    if (v === undefined) break;
    if (!(v instanceof POp)) {
      stack.push(v);
      if (stack.length > 10000) stack.splice(0, 5000);
      continue;
    }
    if (v.v === "[" || v.v === "<<" || v.v === "]" || v.v === ">>" || v.v === "{" || v.v === "}") {
      // stray delimiter (value() consumed balanced ones); ignore
      if (lex.p === save) lex.p++;
      continue;
    }
    const op = v.v;
    const n = (i: number) => {
      const x = stack[stack.length - i];
      return typeof x === "number" ? x : 0;
    };
    try {
      switch (op) {
        case "q":
          if (gstack.length < 256) gstack.push({ ctm, font, size, tc, tw, th, tl, rise });
          break;
        case "Q": {
          const g = gstack.pop();
          if (g) ({ ctm, font, size, tc, tw, th, tl, rise } = g);
          break;
        }
        case "cm":
          ctm = mul([n(6), n(5), n(4), n(3), n(2), n(1)], ctm);
          break;
        case "BT":
          tm = ID;
          lm = ID;
          break;
        case "ET":
          break;
        case "Tf": {
          const nm = stack[stack.length - 2];
          size = n(1) || size;
          if (nm instanceof PName) font = await fontFor(nm.v);
          break;
        }
        case "Tc": tc = n(1); break;
        case "Tw": tw = n(1); break;
        case "Tz": th = n(1) / 100; break;
        case "TL": tl = n(1); break;
        case "Ts": rise = n(1); break;
        case "Td":
          lm = mul([1, 0, 0, 1, n(2), n(1)], lm);
          tm = lm;
          break;
        case "TD":
          tl = -n(1);
          lm = mul([1, 0, 0, 1, n(2), n(1)], lm);
          tm = lm;
          break;
        case "Tm":
          lm = [n(6), n(5), n(4), n(3), n(2), n(1)];
          tm = lm;
          break;
        case "T*":
          nl();
          break;
        case "Tj": {
          const s = stack[stack.length - 1];
          if (s instanceof PStr) show(s.v);
          break;
        }
        case "'": {
          nl();
          const s = stack[stack.length - 1];
          if (s instanceof PStr) show(s.v);
          break;
        }
        case '"': {
          tw = n(3);
          tc = n(2);
          nl();
          const s = stack[stack.length - 1];
          if (s instanceof PStr) show(s.v);
          break;
        }
        case "TJ": {
          const arr = stack[stack.length - 1];
          if (Array.isArray(arr)) {
            for (const e of arr) {
              if (e instanceof PStr) show(e.v);
              else if (typeof e === "number") {
                const adv = (-e / 1000) * size * th;
                tm = mul([1, 0, 0, 1, adv, 0], tm);
                if (e <= -200) emitBreak(out, " ");
                const end = mul([size * th, 0, 0, size, 0, rise], mul(tm, ctm));
                if (out.last) out.last = { x: end[4], y: end[5], size: out.last.size };
              }
            }
          }
          break;
        }
        case "Do": {
          const nm = stack[stack.length - 1];
          if (!(nm instanceof PName) || depth > 12) break;
          const xo = doc.obj(xobjs?.get(nm.v));
          if (!xo || seenForms.has(xo) || !(xo.val instanceof PDict)) break;
          if ((doc.get(xo.val.get("Subtype")) as PName | undefined)?.v !== "Form") break;
          const data2 = await doc.streamData(xo);
          if (!data2) break;
          const mtx = doc.get(xo.val.get("Matrix"));
          const fm: M = Array.isArray(mtx) && mtx.length === 6 ? (mtx.map((x) => num(doc.get(x), 0)) as M) : ID;
          seenForms.add(xo);
          await runContent(doc, data2, doc.dict(xo.val.get("Resources")) ?? res, mul(fm, ctm), out, fontCache, depth + 1, seenForms);
          seenForms.delete(xo);
          break;
        }
        case "BI": {
          // inline image: skip to ID, then binary data up to whitespace-delimited EI
          const s = lex.s;
          const idAt = s.indexOf("ID", lex.p);
          if (idAt < 0) {
            lex.p = lex.end;
            break;
          }
          const re = /[\s\0]EI(?=[\s\0]|$)/g;
          re.lastIndex = idAt + 3;
          const m = re.exec(s);
          lex.p = m ? m.index + 3 : lex.end;
          break;
        }
      }
    } catch {
      /* keep going */
    }
    stack.length = 0;
  }
}

/**
 * Extract the text of a PDF in page order. Pure JS; Flate via DecompressionStream.
 * Never throws: malformed or truncated input yields whatever text could be recovered (possibly "").
 * Encrypted PDFs, scanned (image-only) pages and composite fonts without a ToUnicode map yield no text.
 */
export async function pdfText(bytes: Uint8Array, opts: { maxPages?: number } = {}): Promise<string> {
  try {
    const doc = new Doc(bytes);
    doc.scan();
    if (doc.encrypted) return "";
    await doc.loadObjectStreams();
    const pages = doc.pages().slice(0, opts.maxPages ?? 2000);
    const out: Out = { parts: [], chars: 0, ops: 0 };
    const fontCache = new Map<PDict | PVal, Font>();
    for (const { page, res } of pages) {
      if (out.chars > MAX_CHARS || out.ops > MAX_OPS) break;
      const c = page.get("Contents");
      const cv = doc.get(c);
      const refs = Array.isArray(cv) ? cv : [c];
      const datas: Uint8Array[] = [];
      for (const r of refs) {
        const d = await doc.streamData(doc.obj(r) ?? (r instanceof PRef ? undefined : undefined));
        if (d) datas.push(d, Uint8Array.of(10));
      }
      if (!datas.length) continue;
      out.last = undefined;
      try {
        await runContent(doc, concat(datas), res, ID, out, fontCache, 0, new Set());
      } catch {
        /* next page */
      }
      out.parts.push("\n\n");
    }
    return out.parts
      .join("")
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  } catch {
    return "";
  }
}

/** True when the bytes start (within the first 1 KB) with the `%PDF-` signature. */
export function isPdf(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length - 5, 1024);
  for (let i = 0; i <= n; i++) {
    if (bytes[i] === 37 && bytes[i + 1] === 80 && bytes[i + 2] === 68 && bytes[i + 3] === 70 && bytes[i + 4] === 45) return true;
  }
  return false;
}
