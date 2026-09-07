import { test, expect } from "vitest";
import {
  parseCsv,
  csvToAoa,
  aoaToCsv,
  csvToXlsx,
  xlsxToCsv,
  xlsxToJson,
} from "./index";

test("parseCsv reads plain rows and quoted fields with embedded delimiter/quote/newline", () => {
  const csv = 'a,b,c\r\n"x,y","he said ""hi""","line1\nline2"';
  expect(parseCsv(csv)).toEqual([
    ["a", "b", "c"],
    ["x,y", 'he said "hi"', "line1\nline2"],
  ]);
});

test("parseCsv handles CRLF and a final row without a trailing newline", () => {
  expect(parseCsv("a,b\r\nc,d")).toEqual([["a", "b"], ["c", "d"]]);
  expect(parseCsv("a,b\r\nc,d\r\n")).toEqual([["a", "b"], ["c", "d"]]);
});

test("parseCsv supports a custom delimiter and empty input", () => {
  expect(parseCsv("a;b;c", { delimiter: ";" })).toEqual([["a", "b", "c"]]);
  expect(parseCsv("")).toEqual([]);
});

test("parseCsv rejects a multi-character delimiter", () => {
  expect(() => parseCsv("a,b", { delimiter: "||" })).toThrow();
});

test("csvToAoa coerces numbers/booleans/blanks by default", () => {
  const aoa = csvToAoa("name,qty,active,note\nAda,12,true,\nBob,0,false,hi");
  expect(aoa).toEqual([
    ["name", "qty", "active", "note"],
    ["Ada", 12, true, null],
    ["Bob", 0, false, "hi"],
  ]);
});

test("csvToAoa preserves non-canonical numerics as strings, and typed:false keeps everything a string", () => {
  const typed = csvToAoa("id\n007\n3.140\n1e3");
  expect(typed).toEqual([["id"], ["007"], ["3.140"], ["1e3"]]);
  const raw = csvToAoa("qty\n12\ntrue\n", { typed: false });
  expect(raw).toEqual([["qty"], ["12"], ["true"]]);
});

test("aoaToCsv serializes types and quotes fields that need it", () => {
  const csv = aoaToCsv(
    [
      ["name", "when", "flag", "note"],
      ["Ada", new Date(Date.UTC(2024, 0, 15)), true, 'a,b "c"'],
    ],
    { newline: "\n" },
  );
  expect(csv).toBe('name,when,flag,note\nAda,2024-01-15,true,"a,b ""c"""');
});

test("aoaToCsv emits full ISO for a date-time and empty for null", () => {
  const csv = aoaToCsv([[new Date(Date.UTC(2024, 0, 15, 9, 30)), null]], { newline: "\n" });
  expect(csv).toBe("2024-01-15T09:30:00.000Z,");
});

test("CSV round-trips through the typed grid", () => {
  const original = "name,qty,active\nAda,12,true\nBob,7,false";
  const back = aoaToCsv(csvToAoa(original), { newline: "\n" });
  expect(back).toBe(original);
});

test("csvToXlsx -> xlsxToJson round-trips with a header row", async () => {
  const bytes = csvToXlsx("name,age,active\nAda,36,true\nBob,41,false", { header: true });
  const rows = await xlsxToJson(bytes);
  expect(rows).toEqual([
    { name: "Ada", age: 36, active: true },
    { name: "Bob", age: 41, active: false },
  ]);
});

test("csvToXlsx -> xlsxToCsv round-trips the text (values preserved)", async () => {
  const bytes = csvToXlsx("a,b,c\n1,2,3\n4,5,6");
  const csv = await xlsxToCsv(bytes, { newline: "\n" });
  expect(csv).toBe("a,b,c\n1,2,3\n4,5,6");
});

test("xlsxToCsv selects a sheet by name and by index", async () => {
  const bytes = csvToXlsx("x\n1", { sheetName: "Only" });
  expect(await xlsxToCsv(bytes, { sheet: "Only", newline: "\n" })).toBe("x\n1");
  expect(await xlsxToCsv(bytes, { sheet: 0, newline: "\n" })).toBe("x\n1");
});

test("csvToXlsx with a custom delimiter parses correctly", async () => {
  const bytes = csvToXlsx("name;score\nAda;99", { delimiter: ";", header: true });
  const rows = await xlsxToJson(bytes);
  expect(rows).toEqual([{ name: "Ada", score: 99 }]);
});
