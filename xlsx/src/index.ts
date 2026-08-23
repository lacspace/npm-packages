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
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
