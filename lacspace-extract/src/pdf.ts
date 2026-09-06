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

/** Extract readable text from a PDF byte buffer. Never throws. */
export function extractPdfText(bytes: Uint8Array): PdfText {
  const buf = Buffer.from(bytes);
  const latin = buf.toString("latin1");
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
  // Tidy: trim trailing space, drop leading indent, collapse repeated blank
  // lines — but PRESERVE internal multi-spaces so column layouts survive for
  // best-effort table detection.
  const cleaned = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\t/g, "    ").replace(/\s+$/, "").replace(/^\s+/, ""))
    .filter((l, i, arr) => l !== "" || (i > 0 && arr[i - 1] !== ""))
    .join("\n")
    .trim();
  void OCTAL;
  return { text: cleaned, pageCount };
}
