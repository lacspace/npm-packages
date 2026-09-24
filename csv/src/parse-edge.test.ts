import { test, expect } from "vitest";
import { parse, parseAuto, stringify } from "./index";

// Two ways parse() silently produced wrong data from ordinary real-world input.

// Excel prefixes every CSV it exports with U+FEFF. Left in place it became part
// of the first header, so `row.name` was undefined for every Excel-written file.
test("a UTF-8 BOM is stripped so the first header is usable", () => {
  const rows = parse<Record<string, string>>("﻿name,age\r\nAda,36\r\n");
  expect(Object.keys(rows[0]!)).toEqual(["name", "age"]);
  expect(rows[0]!.name).toBe("Ada");
});

test("parseAuto strips the BOM too, and still detects the delimiter", () => {
  const rows = parseAuto<Record<string, string>>("﻿name;age\r\nAda;36\r\n");
  expect(rows[0]).toEqual({ name: "Ada", age: "36" });
});

test("a BOM in header:false mode does not leak into the first cell", () => {
  expect(parse("﻿a,b\r\n1,2\r\n", { header: false })).toEqual([["a", "b"], ["1", "2"]]);
});

test("input without a BOM is unaffected", () => {
  expect(parse<Record<string, string>>("name,age\r\nAda,36\r\n")[0]).toEqual({ name: "Ada", age: "36" });
});

// RFC 4180: a quoted field is quoted in full, so a quote may only OPEN a field
// at its start. One that turns up mid-field — `5" tall` — is a literal. Treating
// it as an opener swallowed every following row into one unterminated field.
test("a quote in the middle of an unquoted field is a literal character", () => {
  const rows = parse('a,b\r\n5" tall,ok\r\nnext,row\r\n', { header: false });
  expect(rows).toEqual([["a", "b"], ['5" tall', "ok"], ["next", "row"]]);
});

test("a mid-field quote does not eat the rest of the file", () => {
  const rows = parse('h\r\n12"\r\nx\r\ny\r\nz\r\n', { header: false });
  expect(rows).toHaveLength(5); // header + 4 data rows, not 2
  expect(rows[1]).toEqual(['12"']);
});

test("properly quoted fields still work in full", () => {
  const rows = parse('a,b\r\n"say ""hi""",x\r\n"multi\nline",y\r\n"with,comma",z\r\n', { header: false });
  expect(rows).toEqual([["a", "b"], ['say "hi"', "x"], ["multi\nline", "y"], ["with,comma", "z"]]);
});

test("stringify -> parse round-trips a value that contains a mid quote", () => {
  const rows = [{ h: '5" tall', n: 'say "hi"', c: "x,y", l: "l1\nl2" }];
  expect(parse(stringify(rows))).toEqual(rows);
});
