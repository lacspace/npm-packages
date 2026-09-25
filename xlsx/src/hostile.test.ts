import { describe, test, expect } from "vitest";
import { deflateRawSync } from "node:zlib";
import { aoaToXlsx, readWorkbook, sheetToAoa, XlsxReadError } from "./index";

// ---- tiny ZIP helpers (test-only) -------------------------------------------
type Entry = { name: string; method: number; comp: Uint8Array; size: number };
function crc32(b: Uint8Array): number {
  let crc = 0xffffffff;
  for (const x of b) { crc ^= x; for (let k = 0; k < 8; k++) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1; }
  return (crc ^ 0xffffffff) >>> 0;
}
function readEntries(zip: Uint8Array): Entry[] {
  const b = Buffer.from(zip);
  const eocd = b.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const out: Entry[] = [];
  let p = b.readUInt32LE(eocd + 16);
  for (let i = 0; i < b.readUInt16LE(eocd + 10); i++) {
    const nl = b.readUInt16LE(p + 28), el = b.readUInt16LE(p + 30), cl = b.readUInt16LE(p + 32), lo = b.readUInt32LE(p + 42);
    const start = lo + 30 + b.readUInt16LE(lo + 26) + b.readUInt16LE(lo + 28);
    out.push({ name: b.subarray(p + 46, p + 46 + nl).toString(), method: b.readUInt16LE(p + 10), size: b.readUInt32LE(p + 24), comp: b.subarray(start, start + b.readUInt32LE(p + 20)) });
    p += 46 + nl + el + cl;
  }
  return out;
}
function writeZip(entries: Entry[], crcs: Map<string, number>): Uint8Array {
  const parts: Buffer[] = [], central: Buffer[] = [];
  let off = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name), crc = crcs.get(e.name) ?? 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(e.method, 8); lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(e.comp.length, 18); lh.writeUInt32LE(e.size, 22); lh.writeUInt16LE(name.length, 26);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(e.method, 10); ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(e.comp.length, 20); ch.writeUInt32LE(e.size, 24); ch.writeUInt16LE(name.length, 28); ch.writeUInt32LE(off, 42);
    parts.push(lh, name, Buffer.from(e.comp)); central.push(ch, name);
    off += 30 + name.length + e.comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return new Uint8Array(Buffer.concat([...parts, cd, end]));
}
const text = (e: Entry) => Buffer.from(e.method === 0 ? e.comp : require("node:zlib").inflateRawSync(e.comp)).toString();
function patch(zip: Uint8Array, name: string, edit: (xml: string) => string): Uint8Array {
  const crcs = new Map<string, number>();
  const entries = readEntries(zip).map((e) => {
    if (e.name !== name) return e;
    const data = Buffer.from(edit(text(e)));
    crcs.set(name, crc32(data));
    return { name, method: 0, comp: data, size: data.length };
  });
  return writeZip(entries, crcs);
}
function addDeflated(zip: Uint8Array, name: string, raw: Uint8Array): Uint8Array {
  const entries = readEntries(zip).filter((e) => e.name !== name);
  entries.push({ name, method: 8, comp: deflateRawSync(raw, { level: 9 }), size: raw.length });
  return writeZip(entries, new Map([[name, crc32(raw)]]));
}

// ---- decompression bombs -------------------------------------------------------
describe("decompression limits", () => {
  const base = aoaToXlsx([["a", 1], ["b", 2]]);

  test("an entry the reader never parses is never inflated", async () => {
    // Corrupt DEFLATE data: inflating it would throw, so a clean read proves it was skipped.
    const entries = readEntries(base);
    entries.push({ name: "xl/media/image1.png", method: 8, comp: new Uint8Array([0xff, 0xff, 0xff, 0xff, 0x00]), size: 1 << 30 });
    const bomb = writeZip(entries, new Map());
    const wb = await readWorkbook(bomb, { maxUncompressedBytes: 1024 * 1024 });
    expect(sheetToAoa(wb.sheet()!)).toEqual([["a", 1], ["b", 2]]);
  });

  test("a worksheet that expands past maxUncompressedBytes is refused", async () => {
    const huge = Buffer.alloc(32 * 1024 * 1024, " ");
    const bomb = addDeflated(base, "xl/worksheets/sheet1.xml", huge);
    await expect(readWorkbook(bomb, { maxUncompressedBytes: 4 * 1024 * 1024 })).rejects.toThrow(XlsxReadError);
    await expect(readWorkbook(bomb, { maxUncompressedBytes: 4 * 1024 * 1024 })).rejects.toThrow(/maxUncompressedBytes/);
  });

  test("normal workbooks read fine under a tight budget", async () => {
    const rows = Array.from({ length: 500 }, (_, i) => [`row ${i}`, i, i * 1.5]);
    const wb = await readWorkbook(aoaToXlsx(rows), { maxUncompressedBytes: 512 * 1024 });
    expect(sheetToAoa(wb.sheet()!)).toHaveLength(500);
  });
});

// ---- dates -------------------------------------------------------------------
describe("Excel date systems", () => {
  const withSerial = (serial: number) =>
    patch(aoaToXlsx([[new Date(Date.UTC(2020, 0, 1))]]), "xl/worksheets/sheet1.xml", (xml) => xml.replace(/<v>[^<]+<\/v>/, `<v>${serial}</v>`));

  test("a 1900-system serial matches the date Excel shows (45000 = 2023-03-15)", async () => {
    const wb = await readWorkbook(withSerial(45000));
    expect((sheetToAoa(wb.sheet()!)[0]![0] as Date).toISOString()).toBe("2023-03-15T00:00:00.000Z");
  });

  test("workbooks in the 1904 date system are read 1,462 days later", async () => {
    // 43538 in the 1904 system is 2023-03-15 too.
    const zip = patch(withSerial(43538), "xl/workbook.xml", (xml) => xml.replace(/<workbook\b([^>]*)>/, '<workbook$1><workbookPr date1904="1"/>'));
    const wb = await readWorkbook(zip);
    expect((sheetToAoa(wb.sheet()!)[0]![0] as Date).toISOString()).toBe("2023-03-15T00:00:00.000Z");
  });

  test("dates before 1 March 1900 follow Excel's phantom leap day", async () => {
    // Excel: serial 1 = 1900-01-01, 59 = 1900-02-28, 61 = 1900-03-01.
    const read = async (serial: number) => (sheetToAoa((await readWorkbook(withSerial(serial))).sheet()!)[0]![0] as Date).toISOString().slice(0, 10);
    expect(await read(1)).toBe("1900-01-01");
    expect(await read(59)).toBe("1900-02-28");
    expect(await read(61)).toBe("1900-03-01");
    for (const d of ["1900-01-01", "1900-02-28", "1900-03-01", "1955-07-04"]) {
      const wb = await readWorkbook(aoaToXlsx([[new Date(`${d}T00:00:00Z`)]]));
      expect((sheetToAoa(wb.sheet()!)[0]![0] as Date).toISOString().slice(0, 10)).toBe(d);
    }
  });

  test("the writer stores Excel's serial for early dates", async () => {
    const zip = aoaToXlsx([[new Date("1900-01-01T00:00:00Z")], [new Date("1900-03-01T00:00:00Z")]]);
    const sheet = text(readEntries(zip).find((e) => e.name === "xl/worksheets/sheet1.xml")!);
    expect([...sheet.matchAll(/<v>([^<]+)<\/v>/g)].map((m) => Number(m[1]))).toEqual([1, 61]);
  });
});
