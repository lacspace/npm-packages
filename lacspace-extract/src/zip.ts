/**
 * A tiny, zero-dependency ZIP reader. Office documents (DOCX/PPTX/XLSX) and
 * EPUB books are all ZIP archives of XML/HTML, so this is the foundation for
 * reading them. It parses the central directory (falling back to a local-file-
 * header scan) and inflates DEFLATE entries with `zlib.inflateRawSync`. Only
 * the two methods real office files use are supported: 0 (stored) and 8
 * (deflate). Never throws for a malformed archive — it returns what it can.
 */
import { inflateRawSync } from "node:zlib";

const SIG_LOCAL = 0x04034b50; // PK\x03\x04
const SIG_CDIR = 0x02014b50; // PK\x01\x02
const SIG_EOCD = 0x06054b50; // PK\x05\x06

export interface ZipEntry {
  name: string;
  data: Buffer;
  method: number;
}

/** Inflate (or pass through) one entry's compressed bytes. */
function decompress(raw: Buffer, method: number): Buffer | null {
  if (method === 0) return raw;
  if (method === 8) {
    try { return inflateRawSync(raw); } catch { return null; }
  }
  return null;
}

/** Locate the End Of Central Directory record by scanning from the tail. */
function findEocd(buf: Buffer): number {
  // The EOCD is at least 22 bytes; the comment (rare) may push it back <=64KB.
  const min = Math.max(0, buf.length - 22 - 0xffff);
  for (let i = buf.length - 22; i >= min; i--) {
    if (buf.readUInt32LE(i) === SIG_EOCD) return i;
  }
  return -1;
}

/** Read entries via the central directory (robust to data descriptors). */
function readViaCentralDir(buf: Buffer): ZipEntry[] | null {
  const eocd = findEocd(buf);
  if (eocd < 0) return null;
  let count = buf.readUInt16LE(eocd + 10);
  let cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset >= buf.length) return null;
  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < count && p + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(p) !== SIG_CDIR) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    // Read the local header to find where the data actually starts.
    if (localOffset + 30 <= buf.length && buf.readUInt32LE(localOffset) === SIG_LOCAL) {
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + lNameLen + lExtraLen;
      const raw = buf.subarray(dataStart, dataStart + compSize);
      const out = decompress(raw, method);
      if (out) entries.push({ name, data: out, method });
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries.length ? entries : null;
}

/** Fallback: walk local file headers in order (no data-descriptor support). */
function readViaLocalHeaders(buf: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];
  let p = 0;
  while (p + 30 <= buf.length && buf.readUInt32LE(p) === SIG_LOCAL) {
    const flags = buf.readUInt16LE(p + 6);
    const method = buf.readUInt16LE(p + 8);
    const compSize = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const extraLen = buf.readUInt16LE(p + 28);
    const name = buf.toString("utf8", p + 30, p + 30 + nameLen);
    const dataStart = p + 30 + nameLen + extraLen;
    // Bit 3 => sizes live in a trailing data descriptor; we can't scan those.
    if (flags & 0x08 || compSize === 0) break;
    const raw = buf.subarray(dataStart, dataStart + compSize);
    const out = decompress(raw, method);
    if (out) entries.push({ name, data: out, method });
    p = dataStart + compSize;
  }
  return entries;
}

/**
 * Read a ZIP archive into a name → bytes map. Handles stored + deflate entries.
 * Returns an empty map if the input isn't a readable ZIP.
 */
export function readZip(bytes: Uint8Array): Map<string, Buffer> {
  const buf = Buffer.from(bytes);
  const map = new Map<string, Buffer>();
  let entries: ZipEntry[] = [];
  try {
    entries = readViaCentralDir(buf) ?? readViaLocalHeaders(buf);
  } catch {
    try { entries = readViaLocalHeaders(buf); } catch { /* give up */ }
  }
  for (const e of entries) if (!map.has(e.name)) map.set(e.name, e.data);
  return map;
}

/** Read one entry as UTF-8 text, or "" if absent. */
export function zipText(zip: Map<string, Buffer>, name: string): string {
  return zip.get(name)?.toString("utf8") ?? "";
}
