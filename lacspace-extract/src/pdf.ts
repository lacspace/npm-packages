/**
 * A compact, zero-dependency PDF text extractor. It inflates FlateDecode content
 * streams (via node:zlib), parses the text-showing operators (Tj/TJ/'/") and
 * reconstructs readable text with line breaks. It handles ordinary text-based
 * PDFs — NOT scanned/image PDFs (those need OCR) or exotic CID font encodings.
 */
import { inflateSync, inflateRawSync } from "node:zlib";

export interface PdfText {
  text: string;
  pageCount: number;
  /** True when the PDF is encrypted (text may be empty/garbled — see README). */
  encrypted?: boolean;
}

/** A single page's extracted text. */
export interface PdfPage {
  page: number;
  text: string;
}

/** Document metadata pulled from the Info dict (or XMP as a fallback). */
export interface PdfMeta {
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creator?: string;
  producer?: string;
  created?: string;
  modified?: string;
  pageCount: number;
  encrypted: boolean;
}

const OCTAL: Record<string, string> = {};

/** Decode a PDF literal string `(...)`, handling escapes + octal. */
function decodeLiteral(tok: string): string {
  const body = tok.slice(1, -1);
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]!;
    if (ch !== "\\") { out += ch; continue; }
    const n = body[i + 1]!;
    if (n === "n") { out += "\n"; i++; }
    else if (n === "r") { out += "\r"; i++; }
    else if (n === "t") { out += "\t"; i++; }
    else if (n === "b") { out += "\b"; i++; }
    else if (n === "f") { out += "\f"; i++; }
    else if (n === "(" || n === ")" || n === "\\") { out += n; i++; }
    else if (n >= "0" && n <= "7") {
      let oct = "";
      let j = i + 1;
      while (j < body.length && oct.length < 3 && body[j]! >= "0" && body[j]! <= "7") { oct += body[j]!; j++; }
      out += String.fromCharCode(parseInt(oct, 8) & 0xff);
      i = j - 1;
    } else if (n === "\n") { i++; } // line continuation
    else { out += n; i++; }
  }
  return out;
}

/** Decode a PDF hex string `<...>` (UTF-16BE when it starts with a BOM). */
function decodeHex(tok: string): string {
  const hex = tok.slice(1, -1).replace(/\s+/g, "");
  const padded = hex.length % 2 ? hex + "0" : hex;
  const bytes: number[] = [];
  for (let i = 0; i < padded.length; i += 2) bytes.push(parseInt(padded.slice(i, i + 2), 16));
  if (bytes[0] === 0xfe && bytes[1] === 0xff) {
    let out = "";
    for (let i = 2; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes[i]! << 8) | bytes[i + 1]!);
    return out;
  }
  return bytes.map((b) => String.fromCharCode(b)).join("");
}

/** Decode a TJ array `[(a) -250 (b)]` — strings joined, big negatives → space. */
function decodeArray(tok: string): string {
  let out = "";
  const re = /\((?:[^()\\]|\\.)*\)|<[0-9A-Fa-f\s]*>|-?\d+(?:\.\d+)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(tok))) {
    const t = m[0];
    if (t[0] === "(") out += decodeLiteral(t);
    else if (t[0] === "<") out += decodeHex(t);
    else if (parseFloat(t) <= -180) out += " ";
  }
  return out;
}

/** Parse a decoded content stream into text. */
function parseContent(content: string): string {
  let out = "";
  let buf = "";
  let arr = "";
  const re = /\((?:[^()\\]|\\.)*\)|<[0-9A-Fa-f\s]*>|\[(?:[^\][\\]|\\.)*\]|Tj|TJ|T\*|Td|TD|Tm|'|"|BT|ET/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content))) {
    const t = m[0];
    if (t[0] === "(") buf = decodeLiteral(t);
    else if (t[0] === "<") buf = decodeHex(t);
    else if (t[0] === "[") arr = t;
    else if (t === "Tj") { out += buf; buf = ""; }
    else if (t === "'" || t === '"') { out += "\n" + buf; buf = ""; }
    else if (t === "TJ") { out += arr ? decodeArray(arr) : ""; arr = ""; }
    else if (t === "T*" || t === "Td" || t === "TD") out += "\n";
    else if (t === "ET") out += "\n";
  }
  return out;
}

function inflate(raw: Buffer): Buffer | null {
  try { return inflateSync(raw); } catch { /* try raw */ }
  try { return inflateRawSync(raw); } catch { return null; }
}

/** Pull the decoded content streams (skipping images/fonts) out of a PDF. */
function contentStreams(latin: string, buf: Buffer): string[] {
  const streams: string[] = [];
  let idx = 0;
  while ((idx = latin.indexOf("stream", idx)) !== -1) {
    if (latin.slice(idx - 3, idx) === "end") { idx += 6; continue; }
    const dictStart = latin.lastIndexOf("<<", idx);
    const dict = dictStart >= 0 ? latin.slice(dictStart, idx) : "";
    const skip = /\/(Image|Font|FontFile|XObject)\b/.test(dict) && !/\/Subtype\s*\/Form/.test(dict);
    const isFlate = /\/FlateDecode/.test(dict);
    let dataStart = idx + 6;
    if (latin[dataStart] === "\r") dataStart++;
    if (latin[dataStart] === "\n") dataStart++;
    const end = latin.indexOf("endstream", dataStart);
    if (end === -1) break;
    if (!skip) {
      const raw = buf.subarray(dataStart, end);
      const decoded = isFlate ? inflate(raw) : raw;
      if (decoded) {
        const s = decoded.toString("latin1");
        if (/BT|Tj|TJ/.test(s)) streams.push(s);
      }
    }
    idx = end + 9;
  }
  return streams;
}

/**
 * Tidy raw extracted text: trim trailing space, drop leading indent, collapse
 * repeated blank lines — but PRESERVE internal multi-spaces so column layouts
 * survive for best-effort table detection.
 */
function cleanText(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/\t/g, "    ").replace(/\s+$/, "").replace(/^\s+/, ""))
    .filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim();
}

/** True if the trailer declares an `/Encrypt` dictionary. */
export function pdfIsEncrypted(latin: string): boolean {
  return /\/Encrypt\s+\d+\s+\d+\s+R/.test(latin) || /\/Encrypt\s*<</.test(latin);
}

/** Extract readable text from a PDF byte buffer. Never throws. */
export function extractPdfText(bytes: Uint8Array): PdfText {
  const buf = Buffer.from(bytes);
  const latin = buf.toString("latin1");
  const encrypted = pdfIsEncrypted(latin);
  let text = "";
  try {
    for (const s of contentStreams(latin, buf)) {
      const t = parseContent(s);
      if (t.trim()) text += t + "\n";
    }
  } catch {
    /* return whatever we got */
  }
  const pageCount = (latin.match(/\/Type\s*\/Page[^s]/g) ?? []).length || 1;
  void OCTAL;
  const out: PdfText = { text: cleanText(text), pageCount };
  if (encrypted) out.encrypted = true;
  return out;
}

// ── Object model (for per-page extraction & metadata) ────────────────────────

interface PdfObj { num: number; dict: string; stream?: Buffer; flate: boolean }

/** Parse every `N G obj … endobj` into a map keyed by object number. */
function parseObjects(latin: string, buf: Buffer): Map<number, PdfObj> {
  const objs = new Map<number, PdfObj>();
  const re = /(\d+)\s+(\d+)\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(latin))) {
    const num = Number(m[1]);
    const bodyStart = m.index + m[0].length;
    const end = latin.indexOf("endobj", bodyStart);
    if (end === -1) continue;
    const streamKw = latin.indexOf("stream", bodyStart);
    const hasStream = streamKw !== -1 && streamKw < end;
    const dict = latin.slice(bodyStart, hasStream ? streamKw : end);
    const obj: PdfObj = { num, dict, flate: /\/FlateDecode/.test(dict) };
    if (hasStream) {
      let ds = streamKw + 6;
      if (latin[ds] === "\r") ds++;
      if (latin[ds] === "\n") ds++;
      const se = latin.indexOf("endstream", ds);
      if (se !== -1) obj.stream = buf.subarray(ds, se);
    }
    if (!objs.has(num)) objs.set(num, obj);
  }
  return objs;
}

function refsIn(s: string, key: string): number[] {
  // Match "/Key N 0 R" or "/Key [ N 0 R M 0 R ]".
  const single = s.match(new RegExp(`/${key}\\s+(\\d+)\\s+\\d+\\s+R`));
  const arr = s.match(new RegExp(`/${key}\\s*\\[([^\\]]*)\\]`));
  const out: number[] = [];
  if (arr) { const r = /(\d+)\s+\d+\s+R/g; let mm: RegExpExecArray | null; while ((mm = r.exec(arr[1]!))) out.push(Number(mm[1])); }
  else if (single) out.push(Number(single[1]));
  return out;
}

/** Resolve the ordered list of Page object numbers by walking the page tree. */
function pageOrder(objs: Map<number, PdfObj>, latin: string): number[] {
  const order: number[] = [];
  const seen = new Set<number>();
  const rootRef = latin.match(/\/Root\s+(\d+)\s+\d+\s+R/);
  let pagesRoot: number | undefined;
  if (rootRef) { const cat = objs.get(Number(rootRef[1])); if (cat) pagesRoot = refsIn(cat.dict, "Pages")[0]; }
  const walk = (num: number, depth: number): void => {
    if (depth > 50 || seen.has(num)) return;
    seen.add(num);
    const obj = objs.get(num);
    if (!obj) return;
    if (/\/Type\s*\/Pages\b/.test(obj.dict)) { for (const kid of refsIn(obj.dict, "Kids")) walk(kid, depth + 1); }
    else if (/\/Type\s*\/Page\b/.test(obj.dict)) order.push(num);
  };
  if (pagesRoot !== undefined) walk(pagesRoot, 0);
  if (order.length) return order;
  // Fallback: every /Type /Page object in numeric order.
  return [...objs.values()].filter((o) => /\/Type\s*\/Page\b/.test(o.dict) && !/\/Type\s*\/Pages\b/.test(o.dict)).map((o) => o.num);
}

/** Decode a page's concatenated content streams into text. */
function pageText(pageNum: number, objs: Map<number, PdfObj>): string {
  const page = objs.get(pageNum);
  if (!page) return "";
  let content = "";
  for (const ref of refsIn(page.dict, "Contents")) {
    const c = objs.get(ref);
    if (!c?.stream) continue;
    const decoded = c.flate ? inflate(c.stream) : c.stream;
    if (decoded) content += decoded.toString("latin1") + "\n";
  }
  return cleanText(parseContent(content));
}

/**
 * Parse a page-range spec like "2-5", "3", "2,4,6", "3-" (open-ended) into a
 * sorted, de-duplicated, 1-based page-number list bounded by `total`.
 */
export function parsePageRange(spec: string, total: number): number[] {
  const set = new Set<number>();
  for (const part of spec.split(",").map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)(?:\s*-\s*(\d+)?)?$/);
    if (!m) continue;
    const from = Number(m[1]);
    const to = m[2] !== undefined ? Number(m[2]) : (part.includes("-") ? total : from);
    for (let i = from; i <= Math.min(to, total); i++) if (i >= 1) set.add(i);
  }
  return [...set].sort((a, b) => a - b);
}

/**
 * Extract text page-by-page. Pass `range` (e.g. "2-5") to limit which pages.
 * Falls back to a single whole-document page if the page tree can't be parsed.
 */
export function extractPdfPages(bytes: Uint8Array, opts: { range?: string } = {}): PdfPage[] {
  const buf = Buffer.from(bytes);
  const latin = buf.toString("latin1");
  let order: number[] = [];
  try { order = pageOrder(parseObjects(latin, buf), latin); } catch { /* fall through */ }
  const objs = (() => { try { return parseObjects(latin, buf); } catch { return new Map<number, PdfObj>(); } })();
  if (!order.length) {
    // Couldn't resolve the tree — return the whole document as one page.
    const whole = extractPdfText(bytes);
    const single: PdfPage[] = [{ page: 1, text: whole.text }];
    return opts.range ? single.filter((_, i) => parsePageRange(opts.range!, 1).includes(i + 1)) : single;
  }
  const wanted = opts.range ? new Set(parsePageRange(opts.range, order.length)) : null;
  const pages: PdfPage[] = [];
  order.forEach((num, i) => {
    const pageNo = i + 1;
    if (wanted && !wanted.has(pageNo)) return;
    pages.push({ page: pageNo, text: pageText(num, objs) });
  });
  return pages;
}

// ── Metadata ─────────────────────────────────────────────────────────────────

function dictString(dict: string, key: string): string | undefined {
  const re = new RegExp(`/${key}\\s*(\\((?:[^()\\\\]|\\\\.)*\\)|<[0-9A-Fa-f\\s]*>)`);
  const m = dict.match(re);
  if (!m) return undefined;
  const tok = m[1]!;
  const val = tok[0] === "(" ? decodeLiteral(tok) : decodeHex(tok);
  return val.trim() || undefined;
}

/** Normalise a PDF date `D:YYYYMMDDHHmmSS` → ISO-ish `YYYY-MM-DD HH:mm:SS`. */
function pdfDate(v?: string): string | undefined {
  if (!v) return undefined;
  const m = v.match(/D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
  if (!m) return v;
  const [, y, mo = "01", d = "01", h, mi, s] = m;
  const date = `${y}-${mo}-${d}`;
  return h ? `${date} ${h}:${mi ?? "00"}:${s ?? "00"}` : date;
}

/** Read document metadata from the Info dict, with an XMP fallback. */
export function pdfMeta(bytes: Uint8Array): PdfMeta {
  const buf = Buffer.from(bytes);
  const latin = buf.toString("latin1");
  const meta: PdfMeta = {
    pageCount: (latin.match(/\/Type\s*\/Page[^s]/g) ?? []).length || 1,
    encrypted: pdfIsEncrypted(latin),
  };
  try {
    const infoRef = latin.match(/\/Info\s+(\d+)\s+\d+\s+R/);
    if (infoRef) {
      const objs = parseObjects(latin, buf);
      const info = objs.get(Number(infoRef[1]));
      if (info) {
        meta.title = dictString(info.dict, "Title");
        meta.author = dictString(info.dict, "Author");
        meta.subject = dictString(info.dict, "Subject");
        meta.keywords = dictString(info.dict, "Keywords");
        meta.creator = dictString(info.dict, "Creator");
        meta.producer = dictString(info.dict, "Producer");
        meta.created = pdfDate(dictString(info.dict, "CreationDate"));
        meta.modified = pdfDate(dictString(info.dict, "ModDate"));
      }
    }
    // XMP fallback for any still-missing fields.
    const xmp = latin.match(/<x:xmpmeta[\s\S]*?<\/x:xmpmeta>/)?.[0];
    if (xmp) {
      meta.title ??= xmp.match(/<dc:title>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/)?.[1]?.trim();
      meta.author ??= xmp.match(/<dc:creator>[\s\S]*?<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/)?.[1]?.trim();
      meta.producer ??= xmp.match(/<pdf:Producer>([\s\S]*?)<\/pdf:Producer>/)?.[1]?.trim();
      meta.creator ??= xmp.match(/<xmp:CreatorTool>([\s\S]*?)<\/xmp:CreatorTool>/)?.[1]?.trim();
      meta.created ??= pdfDate(xmp.match(/<xmp:CreateDate>([\s\S]*?)<\/xmp:CreateDate>/)?.[1]?.trim());
      meta.modified ??= pdfDate(xmp.match(/<xmp:ModifyDate>([\s\S]*?)<\/xmp:ModifyDate>/)?.[1]?.trim());
    }
  } catch { /* best-effort */ }
  return meta;
}
