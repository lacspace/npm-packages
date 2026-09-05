/**
 * @lacspace/xlsx
 *
 * Write real Excel (.xlsx) files with ZERO dependencies and no headless
 * anything. Every other option is heavy (SheetJS, exceljs); a .xlsx is just a
 * ZIP of a few XML parts, so we build the bytes directly — the same trick as
 * @lacspace/pdf. "Export to Excel" for any dashboard, on Node, edge or browser.
 *
 * - Objects → sheet (headers from keys or explicit columns), or array-of-arrays
 * - Correct types: string / number / boolean / Date (real Excel dates)
 * - Bold headers, column widths, multiple sheets
 * - Output as Uint8Array (stream it, download it, save it)
 */

/* ------------------------------ zip (store) ------------------------------ */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const enc = new TextEncoder();

interface ZipEntry { name: string; data: Uint8Array; crc: number; offset: number; }

/** Build a ZIP archive using the STORE method (no compression) — valid .xlsx. */
function zip(files: { name: string; content: string }[]): Uint8Array {
  const chunks: number[] = [];
  const entries: ZipEntry[] = [];
  const u16 = (n: number): void => { chunks.push(n & 0xff, (n >>> 8) & 0xff); };
  const u32 = (n: number): void => { chunks.push(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff); };
  const bytes = (b: Uint8Array): void => { for (let i = 0; i < b.length; i++) chunks.push(b[i]!); };

  for (const f of files) {
    const data = enc.encode(f.content);
    const nameBytes = enc.encode(f.name);
    const crc = crc32(data);
    const offset = chunks.length;
    u32(0x04034b50);            // local file header signature
    u16(20);                    // version needed
    u16(0);                     // flags
    u16(0);                     // method: store
    u16(0); u16(0);             // mod time, date (fixed)
    u32(crc);
    u32(data.length);           // compressed size
    u32(data.length);           // uncompressed size
    u16(nameBytes.length);
    u16(0);                     // extra len
    bytes(nameBytes);
    bytes(data);
    entries.push({ name: f.name, data, crc, offset });
  }

  const cdStart = chunks.length;
  for (const e of entries) {
    const nameBytes = enc.encode(e.name);
    u32(0x02014b50);            // central dir signature
    u16(20); u16(20);           // version made by / needed
    u16(0); u16(0);             // flags / method
    u16(0); u16(0);             // time / date
    u32(e.crc);
    u32(e.data.length); u32(e.data.length);
    u16(nameBytes.length);
    u16(0); u16(0);             // extra / comment len
    u16(0); u16(0);             // disk start / internal attrs
    u32(0);                     // external attrs
    u32(e.offset);
    bytes(nameBytes);
  }
  const cdSize = chunks.length - cdStart;

  u32(0x06054b50);             // end of central directory
  u16(0); u16(0);              // disk numbers
  u16(entries.length); u16(entries.length);
  u32(cdSize);
  u32(cdStart);
  u16(0);                      // comment len

  return new Uint8Array(chunks);
}

/* ------------------------------ helpers ------------------------------ */

function xmlEsc(s: string): string {
  // Strip control chars illegal in XML 1.0 (keep tab \x09, LF \x0A, CR \x0D);
  // otherwise Excel rejects the file with a "repair" prompt.
  return s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** 0-based column index → spreadsheet letters (0→A, 26→AA). */
export function columnLetter(index: number): string {
  let s = "";
  let i = index + 1;
  while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); }
  return s;
}

const EPOCH_OFFSET = 25569; // days between 1899-12-30 and 1970-01-01
const toSerial = (d: Date): number => d.getTime() / 86400000 + EPOCH_OFFSET;

export type CellValue = string | number | boolean | Date | null | undefined;

export interface Column {
  /** Header label shown in row 1. */
  header: string;
  /** Object key to read from each row (defaults to `header`). */
  key?: string;
  /** Column width in characters. */
  width?: number;
}

export interface SheetOptions {
  columns?: Column[];
  /** Emit a bold header row. Default true for object rows, false for arrays. */
  header?: boolean;
}

interface Sheet { name: string; rows: CellValue[][]; headerRow: boolean; widths: (number | undefined)[]; }

/* ------------------------------ cell rendering ------------------------------ */

function cellXml(ref: string, value: CellValue, style: number): string {
  const s = style ? ` s="${style}"` : "";
  if (value === null || value === undefined || value === "") return `<c r="${ref}"${s}/>`;
  if (typeof value === "number") return Number.isFinite(value) ? `<c r="${ref}"${s}><v>${value}</v></c>` : `<c r="${ref}"${s}/>`;
  if (typeof value === "boolean") return `<c r="${ref}"${s} t="b"><v>${value ? 1 : 0}</v></c>`;
  if (value instanceof Date) return `<c r="${ref}" s="2"><v>${toSerial(value)}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(String(value))}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const cols = sheet.widths.some((w) => w !== undefined)
    ? `<cols>${sheet.widths.map((w, i) => (w !== undefined ? `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>` : "")).join("")}</cols>`
    : "";
  const rows = sheet.rows.map((row, r) => {
    const cells = row.map((v, c) => cellXml(`${columnLetter(c)}${r + 1}`, v, sheet.headerRow && r === 0 ? 1 : 0)).join("");
    return `<row r="${r + 1}">${cells}</row>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${cols}<sheetData>${rows}</sheetData></worksheet>`;
}

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

/* ------------------------------ workbook ------------------------------ */

/**
 * Build a multi-sheet workbook and export it to .xlsx bytes.
 *
 * @example
 * new Workbook()
 *   .sheet("Users", [{ name: "Ada", signups: 12, joined: new Date() }])
 *   .toBytes();
 */
export class Workbook {
  private sheets: Sheet[] = [];

  /** Add a sheet from an array of objects, or an array-of-arrays. */
  sheet(name: string, rows: Record<string, CellValue>[] | CellValue[][], opts: SheetOptions = {}): this {
    const isObjects = rows.length > 0 && !Array.isArray(rows[0]);
    let data: CellValue[][];
    let headerRow: boolean;
    let widths: (number | undefined)[] = [];

    if (isObjects) {
      const objRows = rows as Record<string, CellValue>[];
      const columns: Column[] = opts.columns ?? [...new Set(objRows.flatMap((r) => Object.keys(r)))].map((k): Column => ({ header: k, key: k }));
      headerRow = opts.header ?? true;
      widths = columns.map((c) => c.width);
      const body = objRows.map((r) => columns.map((c) => r[c.key ?? c.header]));
      data = headerRow ? [columns.map((c) => c.header), ...body] : body;
    } else {
      data = (rows as CellValue[][]).map((r) => [...r]);
      headerRow = opts.header ?? false;
      widths = opts.columns?.map((c) => c.width) ?? [];
    }
    this.sheets.push({ name: sanitizeSheetName(name, this.sheets.length), rows: data, headerRow, widths });
    return this;
  }

  /** Serialize the workbook to .xlsx bytes. */
  toBytes(): Uint8Array {
    if (this.sheets.length === 0) this.sheet("Sheet1", []);
    const sheetFiles = this.sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, content: sheetXml(s) }));
    const sheetsList = this.sheets.map((s, i) => `<sheet name="${xmlEsc(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("");
    const stylesRid = this.sheets.length + 1;

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${this.sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`;

    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;

    const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheetsList}</sheets></workbook>`;

    const workbookRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${this.sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${stylesRid}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

    return zip([
      { name: "[Content_Types].xml", content: contentTypes },
      { name: "_rels/.rels", content: rootRels },
      { name: "xl/workbook.xml", content: workbook },
      { name: "xl/_rels/workbook.xml.rels", content: workbookRels },
      { name: "xl/styles.xml", content: STYLES_XML },
      ...sheetFiles,
    ]);
  }

  /** Base64 of the .xlsx bytes. */
  toBase64(): string {
    return bytesToBase64(this.toBytes());
  }
}

function sanitizeSheetName(name: string, index: number): string {
  const clean = name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim();
  return clean || `Sheet${index + 1}`;
}

/* ------------------------------ functional ------------------------------ */

/** Array of objects → .xlsx bytes (one sheet, bold header from keys/columns). */
export function jsonToXlsx(rows: Record<string, CellValue>[], opts: SheetOptions & { sheetName?: string } = {}): Uint8Array {
  return new Workbook().sheet(opts.sheetName ?? "Sheet1", rows, opts).toBytes();
}

/** Array of arrays → .xlsx bytes. */
export function aoaToXlsx(rows: CellValue[][], opts: SheetOptions & { sheetName?: string } = {}): Uint8Array {
  return new Workbook().sheet(opts.sheetName ?? "Sheet1", rows, opts).toBytes();
}

/* ------------------------------ base64 ------------------------------ */

const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
function bytesToBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!, b1 = bytes[i + 1], b2 = bytes[i + 2];
    const t = (b0 << 16) | ((b1 ?? 0) << 8) | (b2 ?? 0);
    out += B64[(t >> 18) & 63]! + B64[(t >> 12) & 63]!;
    out += b1 === undefined ? "=" : B64[(t >> 6) & 63]!;
    out += b2 === undefined ? "=" : B64[t & 63]!;
  }
  return out;
}

/* ======================================================================== *
 *                                READER                                    *
 *                                                                          *
 * Read real Excel (.xlsx) files back into JS — zero dependencies, works on *
 * Node >=18, browsers and edge. Handles both STORE (method 0) and DEFLATE  *
 * (method 8) ZIP entries; real Excel exports are DEFLATE-compressed, so we *
 * inflate with the Web-standard `DecompressionStream("deflate-raw")`.      *
 * Because that API is async, the reader entry points return Promises.      *
 * ======================================================================== */

/** Thrown when the input is not a valid / readable .xlsx workbook. */
export class XlsxReadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XlsxReadError";
  }
}

/** A value read out of a worksheet cell. */
export type ReadCell = string | number | boolean | Date | null;

/** A single parsed worksheet: its name and a dense grid of cells. */
export interface ReadSheet {
  name: string;
  rows: ReadCell[][];
}

/** A fully parsed workbook, with ordered sheets and a lookup helper. */
export interface ParsedWorkbook {
  sheetNames: string[];
  sheets: ReadSheet[];
  /** Get a sheet by name, or the first sheet when no name is given. */
  sheet(name?: string): ReadSheet | undefined;
}

/** Options for turning a sheet grid into an array of row objects. */
export interface SheetToJsonOptions {
  /**
   * `true`/omitted → use the first row as keys.
   * `string[]` → use these keys (data starts at row 0).
   * `false` → keys are the column letters (A, B, C …).
   */
  header?: boolean | string[];
  /** For `xlsxToJson`: which sheet to read — name or 0-based index. */
  sheet?: string | number;
  /** Value substituted for blank cells (default `null`). */
  blankValue?: ReadCell;
}

const dec = new TextDecoder();

/* ------------------------------ binary in ------------------------------ */

function toU8(input: Uint8Array | ArrayBuffer | ArrayBufferView): Uint8Array {
  // Buffer (Node) is a Uint8Array subclass, so it is covered by this branch.
  if (input instanceof Uint8Array) return input;
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  throw new XlsxReadError("Unsupported input: expected Uint8Array, ArrayBuffer, or Buffer");
}

const u16le = (b: Uint8Array, o: number): number => b[o]! | (b[o + 1]! << 8);
const u32le = (b: Uint8Array, o: number): number =>
  (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;

/* ------------------------------ deflate ------------------------------ */

/** Inflate a raw-DEFLATE blob using the Web-standard DecompressionStream. */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const DS: typeof DecompressionStream | undefined = (globalThis as { DecompressionStream?: typeof DecompressionStream })
    .DecompressionStream;
  if (typeof DS !== "function") {
    throw new XlsxReadError(
      "DecompressionStream is unavailable in this runtime — DEFLATE-compressed .xlsx files need Node >=18, a browser, or an edge runtime.",
    );
  }
  const ds = new DS("deflate-raw");
  const writer = ds.writable.getWriter();
  // Fire-and-forget: the reader loop below drains the output as we write.
  void writer.write(data as unknown as BufferSource);
  void writer.close();
  const reader = ds.readable.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      total += value.length;
    }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

/* ------------------------------ unzip ------------------------------ */

/**
 * Parse a ZIP archive via its End-Of-Central-Directory + central directory
 * (robust against the exact local-header layout), returning name → bytes.
 */
async function unzip(b: Uint8Array): Promise<Map<string, Uint8Array>> {
  const map = new Map<string, Uint8Array>();

  // Locate the EOCD record by scanning backwards (a trailing comment may push
  // it away from the very end; the comment can be up to 65535 bytes).
  let eocd = -1;
  const min = Math.max(0, b.length - 22 - 0xffff);
  for (let i = b.length - 22; i >= min; i--) {
    if (u32le(b, i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new XlsxReadError("Not a valid .xlsx/ZIP: End-Of-Central-Directory not found");

  const count = u16le(b, eocd + 10);
  const cdOffset = u32le(b, eocd + 16);

  let ptr = cdOffset;
  for (let i = 0; i < count; i++) {
    if (u32le(b, ptr) !== 0x02014b50) throw new XlsxReadError("Corrupt ZIP: bad central-directory signature");
    const method = u16le(b, ptr + 10);
    const compSize = u32le(b, ptr + 20);
    const nameLen = u16le(b, ptr + 28);
    const extraLen = u16le(b, ptr + 30);
    const commentLen = u16le(b, ptr + 32);
    const localOffset = u32le(b, ptr + 42);
    const name = dec.decode(b.subarray(ptr + 46, ptr + 46 + nameLen));

    // Read the local header to find where the compressed data actually begins
    // (its name/extra lengths can differ from the central-directory entry).
    if (u32le(b, localOffset) !== 0x04034b50) throw new XlsxReadError("Corrupt ZIP: bad local-header signature");
    const lNameLen = u16le(b, localOffset + 26);
    const lExtraLen = u16le(b, localOffset + 28);
    const dataStart = localOffset + 30 + lNameLen + lExtraLen;
    const comp = b.subarray(dataStart, dataStart + compSize);

    let data: Uint8Array;
    if (method === 0) data = comp;
    else if (method === 8) data = await inflateRaw(comp);
    else throw new XlsxReadError(`Unsupported ZIP compression method ${method} for entry "${name}"`);

    map.set(name, data);
    ptr += 46 + nameLen + extraLen + commentLen;
  }
  return map;
}

/* ------------------------------ xml helpers ------------------------------ */

const XML_NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

/** Decode XML entities, including numeric (`&#65;` / `&#x41;`). */
function decodeXml(s: string): string {
  if (s.indexOf("&") === -1) return s;
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, e: string) => {
    if (e[0] === "#") {
      const code = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return XML_NAMED[e] ?? m;
  });
}

/** Read the value of attribute `name` from a run of tag attributes. */
function attr(attrs: string, name: string): string | undefined {
  const re = new RegExp(`(?:^|\\s)${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*=\\s*"([^"]*)"`);
  const m = re.exec(attrs);
  return m ? decodeXml(m[1]!) : undefined;
}

/** Inner text of the first `<tag>…</tag>` (or `""` for a self-closing tag). */
function firstTag(xml: string, tag: string): string | undefined {
  const re = new RegExp(`<${tag}\\b[^>]*?(?:/>|>([\\s\\S]*?)</${tag}>)`);
  const m = re.exec(xml);
  if (!m) return undefined;
  return m[1] === undefined ? "" : m[1];
}

/** Concatenate every `<t>` run inside a fragment (handles rich text). */
function concatT(xml: string): string {
  let out = "";
  const re = /<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out += m[1] === undefined ? "" : decodeXml(m[1]);
  return out;
}

/** Column ref (e.g. "AB") + row from a cell reference (e.g. "AB12"). */
function parseRef(ref: string): { col: number; row: number } {
  const m = /^([A-Za-z]+)([0-9]+)$/.exec(ref);
  if (!m) return { col: 0, row: 1 };
  const letters = m[1]!.toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
  return { col: col - 1, row: parseInt(m[2]!, 10) };
}

/* ------------------------------ parts ------------------------------ */

interface SheetDef { name: string; rid: string; }

/** Ordered `<sheet>` list (name + relationship id) from xl/workbook.xml. */
function parseWorkbookSheets(xml: string): SheetDef[] {
  const out: SheetDef[] = [];
  const re = /<sheet\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const a = m[1]!;
    const name = attr(a, "name") ?? `Sheet${out.length + 1}`;
    const rid = attr(a, "r:id") ?? attr(a, "id") ?? "";
    out.push({ name, rid });
  }
  return out;
}

/** rId → target path map from xl/_rels/workbook.xml.rels. */
function parseRels(xml: string): Map<string, string> {
  const map = new Map<string, string>();
  const re = /<Relationship\b([^>]*)\/?>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const a = m[1]!;
    const id = attr(a, "Id");
    const target = attr(a, "Target");
    if (id && target) map.set(id, target);
  }
  return map;
}

/** Resolve a workbook-relative rel target to a full part path. */
function resolveTarget(target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  return "xl/" + target.replace(/^\.\//, "");
}

/** Shared-string table: each `<si>` flattened to a single string. */
function parseSharedStrings(xml: string | undefined): string[] {
  if (!xml) return [];
  const out: string[] = [];
  const re = /<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) out.push(m[1] === undefined ? "" : concatT(m[1]));
  return out;
}

/**
 * A cellXfs style index is a "date" style when its numFmtId is a builtin
 * date/time format (14–22, 45–47) or a custom numFmt whose code has date
 * tokens. Returns the set of date style indices.
 */
function parseDateStyles(xml: string | undefined): Set<number> {
  const dateStyles = new Set<number>();
  if (!xml) return dateStyles;

  // Custom formats: numFmtId → whether the code looks like a date/time.
  const customIsDate = new Map<number, boolean>();
  const numFmtRe = /<numFmt\b([^>]*)\/?>/g;
  let nm: RegExpExecArray | null;
  while ((nm = numFmtRe.exec(xml))) {
    const a = nm[1]!;
    const idRaw = attr(a, "numFmtId");
    const code = attr(a, "formatCode");
    if (idRaw === undefined || code === undefined) continue;
    customIsDate.set(parseInt(idRaw, 10), isDateFormatCode(code));
  }

  const isBuiltinDate = (id: number): boolean => (id >= 14 && id <= 22) || (id >= 45 && id <= 47);

  // Walk cellXfs only (not cellStyleXfs), preserving xf order = style index.
  const block = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml);
  if (!block) return dateStyles;
  const xfRe = /<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g;
  let xm: RegExpExecArray | null;
  let idx = 0;
  while ((xm = xfRe.exec(block[1]!))) {
    const idRaw = attr(xm[1]!, "numFmtId");
    const id = idRaw === undefined ? 0 : parseInt(idRaw, 10);
    if (isBuiltinDate(id) || customIsDate.get(id) === true) dateStyles.add(idx);
    idx++;
  }
  return dateStyles;
}

/** Heuristic: does a numFmt format code represent a date/time? */
function isDateFormatCode(code: string): boolean {
  // Drop escaped chars, quoted literals and [bracketed] color/condition tokens,
  // then look for the date/time placeholder letters y m d h s.
  const stripped = code
    .replace(/\\./g, "")
    .replace(/"[^"]*"/g, "")
    .replace(/\[[^\]]*\]/g, "");
  return /[yYmMdDhHsS]/.test(stripped);
}

const READ_EPOCH_OFFSET = 25569; // days between 1899-12-30 and 1970-01-01
const serialToDate = (serial: number): Date => new Date(Math.round((serial - READ_EPOCH_OFFSET) * 86400000));

/* ------------------------------ worksheet ------------------------------ */

function decodeCellValue(
  attrs: string,
  inner: string | undefined,
  shared: string[],
  dateStyles: Set<number>,
): ReadCell {
  const t = attr(attrs, "t");
  const sRaw = attr(attrs, "s");
  const style = sRaw === undefined ? 0 : parseInt(sRaw, 10);

  if (t === "e") return null; // error cell
  if (inner === undefined || inner === "") return null;

  if (t === "s") {
    const v = firstTag(inner, "v");
    if (v === undefined || v === "") return null;
    const i = parseInt(v, 10);
    return shared[i] ?? null;
  }
  if (t === "inlineStr") {
    const is = firstTag(inner, "is");
    return concatT(is ?? inner);
  }
  if (t === "str") {
    const v = firstTag(inner, "v");
    return v === undefined ? null : decodeXml(v);
  }
  if (t === "b") {
    const v = firstTag(inner, "v");
    return v === undefined ? null : v.trim() === "1";
  }
  // default / t="n": numeric (possibly a date serial)
  const v = firstTag(inner, "v");
  if (v === undefined || v === "") return null;
  const num = Number(v);
  if (!Number.isFinite(num)) return null;
  return dateStyles.has(style) ? serialToDate(num) : num;
}

/** Parse one worksheet XML into a dense, trailing-trimmed grid. */
function parseSheet(xml: string, shared: string[], dateStyles: Set<number>): ReadCell[][] {
  // sheetData scope only (avoid picking up anything outside it).
  const sd = /<sheetData\b[^>]*>([\s\S]*?)<\/sheetData>/.exec(xml);
  const body = sd ? sd[1]! : "";

  const rowMap = new Map<number, Map<number, ReadCell>>();
  let maxCol = -1;
  let maxRow = 0;
  let lastRow = 0;

  const rowRe = /<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g;
  let rm: RegExpExecArray | null;
  while ((rm = rowRe.exec(body))) {
    const rowAttrs = rm[1] ?? "";
    const rowInner = rm[2];
    const rRaw = attr(rowAttrs, "r");
    const rowNum = rRaw !== undefined ? parseInt(rRaw, 10) : lastRow + 1;
    lastRow = rowNum;
    if (rowNum > maxRow) maxRow = rowNum;
    if (rowInner === undefined || rowInner === "") continue;

    const cells = new Map<number, ReadCell>();
    let cursor = 0;
    const cellRe = /<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g;
    let cm: RegExpExecArray | null;
    while ((cm = cellRe.exec(rowInner))) {
      const cAttrs = cm[1] ?? "";
      const cInner = cm[2];
      const ref = attr(cAttrs, "r");
      let col: number;
      if (ref !== undefined) {
        col = parseRef(ref).col;
        cursor = col + 1;
      } else {
        col = cursor;
        cursor++;
      }
      const val = decodeCellValue(cAttrs, cInner, shared, dateStyles);
      cells.set(col, val);
      if (col > maxCol) maxCol = col;
    }
    if (cells.size) rowMap.set(rowNum, cells);
  }

  if (rowMap.size === 0 || maxCol < 0) return [];

  // Densify into rows[0..maxRow-1][0..maxCol].
  const grid: ReadCell[][] = [];
  for (let r = 1; r <= maxRow; r++) {
    const cells = rowMap.get(r);
    const row: ReadCell[] = new Array(maxCol + 1).fill(null);
    if (cells) for (const [c, v] of cells) row[c] = v;
    grid.push(row);
  }

  return trimGrid(grid);
}

/** Drop trailing all-empty rows and columns. */
function trimGrid(grid: ReadCell[][]): ReadCell[][] {
  const isEmpty = (v: ReadCell): boolean => v === null || v === "";

  let lastRow = -1;
  let lastCol = -1;
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]!;
    for (let c = 0; c < row.length; c++) {
      if (!isEmpty(row[c]!)) {
        if (r > lastRow) lastRow = r;
        if (c > lastCol) lastCol = c;
      }
    }
  }
  if (lastRow < 0 || lastCol < 0) return [];
  const out: ReadCell[][] = [];
  for (let r = 0; r <= lastRow; r++) {
    const row = grid[r]!;
    out.push(row.slice(0, lastCol + 1).map((v) => (v === undefined ? null : v)));
  }
  return out;
}

/* ------------------------------ public API ------------------------------ */

/**
 * Read a .xlsx workbook from bytes into ordered, parsed sheets.
 * Async because DEFLATE inflation uses the Web `DecompressionStream`.
 *
 * @example
 * const wb = await readWorkbook(await file.arrayBuffer());
 * const products = sheetToJson(wb.sheet("Products")!);
 */
export async function readWorkbook(input: Uint8Array | ArrayBuffer | ArrayBufferView): Promise<ParsedWorkbook> {
  const bytes = toU8(input);
  const entries = await unzip(bytes);
  const text = (name: string): string | undefined => {
    const b = entries.get(name);
    return b ? dec.decode(b) : undefined;
  };

  const wbXml = text("xl/workbook.xml");
  if (!wbXml) throw new XlsxReadError("Not a valid .xlsx: xl/workbook.xml is missing");

  const relMap = parseRels(text("xl/_rels/workbook.xml.rels") ?? "");
  const shared = parseSharedStrings(text("xl/sharedStrings.xml"));
  const dateStyles = parseDateStyles(text("xl/styles.xml"));
  const defs = parseWorkbookSheets(wbXml);

  const sheets: ReadSheet[] = [];
  defs.forEach((def, i) => {
    const target = def.rid ? relMap.get(def.rid) : undefined;
    let sheetXmlText = target ? text(resolveTarget(target)) : undefined;
    // Fallback: positional worksheet path when the rel is missing/unmatched.
    if (sheetXmlText === undefined) sheetXmlText = text(`xl/worksheets/sheet${i + 1}.xml`);
    const rows = sheetXmlText ? parseSheet(sheetXmlText, shared, dateStyles) : [];
    sheets.push({ name: def.name, rows });
  });

  const sheetNames = sheets.map((s) => s.name);
  return {
    sheetNames,
    sheets,
    sheet(name?: string): ReadSheet | undefined {
      if (name === undefined) return sheets[0];
      return sheets.find((s) => s.name === name);
    },
  };
}

/** A sheet's grid, unchanged — the array-of-arrays view. */
export function sheetToAoa(sheet: ReadSheet): ReadCell[][] {
  return sheet.rows.map((r) => r.slice());
}

/**
 * Turn a sheet grid into an array of row objects keyed by header.
 * Fully-empty rows are skipped.
 */
export function sheetToJson(sheet: ReadSheet, opts: SheetToJsonOptions = {}): Record<string, ReadCell>[] {
  const { header = true, blankValue = null } = opts;
  const rows = sheet.rows;
  if (rows.length === 0) return [];

  let keys: string[];
  let dataStart: number;
  if (Array.isArray(header)) {
    keys = header.slice();
    dataStart = 0;
  } else if (header === false) {
    const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
    keys = Array.from({ length: width }, (_, i) => columnLetter(i));
    dataStart = 0;
  } else {
    const first = rows[0]!;
    keys = first.map((v, i) => (v === null || v === "" ? columnLetter(i) : String(v)));
    dataStart = 1;
  }

  const out: Record<string, ReadCell>[] = [];
  for (let r = dataStart; r < rows.length; r++) {
    const row = rows[r]!;
    if (row.every((v) => v === null || v === "")) continue; // skip blank rows
    const obj: Record<string, ReadCell> = {};
    for (let c = 0; c < keys.length; c++) {
      const key = keys[c]!;
      const v = c < row.length ? row[c]! : null;
      obj[key] = v === null || v === "" ? blankValue : v;
    }
    out.push(obj);
  }
  return out;
}

/**
 * Convenience: read a workbook and return one sheet as row objects.
 * Picks the sheet by `opts.sheet` (name or 0-based index), default first.
 *
 * @example
 * const products = await xlsxToJson(buffer, { sheet: "Products" });
 */
export async function xlsxToJson(
  input: Uint8Array | ArrayBuffer | ArrayBufferView,
  opts: SheetToJsonOptions = {},
): Promise<Record<string, ReadCell>[]> {
  const wb = await readWorkbook(input);
  let sheet: ReadSheet | undefined;
  if (typeof opts.sheet === "number") sheet = wb.sheets[opts.sheet];
  else if (typeof opts.sheet === "string") sheet = wb.sheet(opts.sheet);
  else sheet = wb.sheets[0];
  if (!sheet) throw new XlsxReadError(`Sheet not found: ${String(opts.sheet)}`);
  return sheetToJson(sheet, opts);
}
