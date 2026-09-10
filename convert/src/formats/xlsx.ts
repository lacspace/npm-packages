import { Workbook, readWorkbook, sheetToJson, type CellValue, type Column } from "@lacspace/xlsx";
import type { Row, Table, ParseOptions, SerializeOptions } from "../types";
import { inferTypes } from "../infer";
import { columnsOf, dateToIso, isDate, plainValue, safeSet } from "../util";

export async function parseXlsx(bytes: Uint8Array, opts: ParseOptions): Promise<Table[]> {
  const wb = await readWorkbook(bytes);
  return wb.sheets.map((sheet) => {
    const raw = sheetToJson(sheet, { header: true, blankValue: null });
    const rows: Row[] = raw.map((r) => {
      const o: Row = {};
      for (const k of Object.keys(r)) safeSet(o, k, r[k]);
      return o;
    });
    return { name: sheet.name, rows: opts.infer ? inferTypes(rows) : rows };
  });
}

function toCell(v: unknown, opts: SerializeOptions): CellValue {
  if (v === null || v === undefined) return null;
  if (isDate(v)) return opts.dateFormat === "iso" ? dateToIso(v) : opts.dateFormat === "excel" ? (plainValue(v, "excel") as number) : v;
  if (typeof v === "number" || typeof v === "boolean" || typeof v === "string") return v;
  const p = plainValue(v, "iso", "json");
  return p === null ? null : typeof p === "object" ? JSON.stringify(p) : p;
}

export function buildWorkbook(tables: Table[], opts: SerializeOptions): Workbook {
  const wb = new Workbook();
  tables.forEach((t, i) => {
    const cols = opts.columns ?? columnsOf(t.rows);
    const cellRows = t.rows.map((r) => {
      const o: Record<string, CellValue> = {};
      for (const c of cols) safeSet(o, c, toCell(r[c], opts));
      return o;
    });
    const columns: Column[] = cols.map((c) => {
      const col: Column = { header: c, key: c };
      const vals = cellRows.map((r) => r[c]).filter((v) => v !== null && v !== undefined && v !== "");
      if (vals.length > 0 && vals.every((v) => isDate(v))) {
        const dateOnly = vals.every((v) => (v as Date).getTime() % 86_400_000 === 0);
        col.numFmt = dateOnly ? "yyyy-mm-dd" : "yyyy-mm-dd hh:mm:ss";
      }
      return col;
    });
    wb.sheet(t.name ?? (tables.length === 1 ? "Sheet1" : `${opts.tableName ?? "Sheet"}${i + 1}`), cellRows, { columns, header: true });
  });
  return wb;
}

export function serializeXlsx(tables: Table[], opts: SerializeOptions): Uint8Array {
  return buildWorkbook(tables, opts).toBytes();
}
