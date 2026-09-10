import { test, expect } from "vitest";
import {
  detect, parseInput, serialize, convert, flatten, unflatten, inferTypes, inferSchema,
  toExcel, fromExcel, parseLines, parseYaml, stringifyYaml, parseToml, stringifyToml, ConvertError,
} from "./index";

const rows = [
  { id: 1, name: "Ada", ok: true, born: new Date(Date.UTC(1815, 11, 10)), score: 9.5 },
  { id: 2, name: "Linus", ok: false, born: new Date(Date.UTC(1969, 11, 28)), score: 8 },
];

/* ------------------------------ detect ------------------------------ */

test("detect: json (array + object)", () => {
  expect(detect('[{"a":1}]')).toBe("json");
  expect(detect('  {"a":1}')).toBe("json");
});
test("detect: ndjson", () => {
  expect(detect('{"a":1}\n{"a":2}\n')).toBe("ndjson");
});
test("detect: csv / tsv / semicolon csv", () => {
  expect(detect("a,b\n1,2\n3,4")).toBe("csv");
  expect(detect("a\tb\n1\t2")).toBe("tsv");
  expect(detect("a;b\n1;2")).toBe("csv");
});
test("detect: xlsx by PK magic", () => {
  expect(detect(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBe("xlsx");
  expect(detect(toExcel(rows))).toBe("xlsx");
});
test("detect: yaml (block map + sequence of maps)", () => {
  expect(detect("name: Ada\nage: 36")).toBe("yaml");
  expect(detect("- id: 1\n  name: Ada\n- id: 2\n  name: Linus")).toBe("yaml");
});
test("detect: toml", () => {
  expect(detect('[server]\nhost = "localhost"\nport = 8080')).toBe("toml");
  expect(detect('[[users]]\nid = 1\nname = "Ada"')).toBe("toml");
});
test("detect: markdown pipe table", () => {
  expect(detect("| a | b |\n| --- | --- |\n| 1 | 2 |")).toBe("markdown");
});
test("detect: html", () => {
  expect(detect("<table><tr><th>a</th></tr></table>")).toBe("html");
  expect(detect("<!DOCTYPE html><html><body></body></html>")).toBe("html");
});
test("detect: sql", () => {
  expect(detect(`INSERT INTO "t" ("a") VALUES (1);`)).toBe("sql");
});
test("detect: empty / prose → null", () => {
  expect(detect("")).toBe(null);
  expect(detect("   \n  ")).toBe(null);
  expect(detect("Just a plain sentence with words.")).toBe(null);
});

/* ------------------------------ json ------------------------------ */

test("json: array of objects round trip", async () => {
  const src = [{ a: 1, b: "x" }, { a: 2, b: "y" }];
  const out = await convert(JSON.stringify(src), { to: "json", pretty: false });
  expect(JSON.parse(out as string)).toEqual(src);
});
test("json: nested → flatten → unflatten equality", async () => {
  const nested = [{ id: 1, address: { city: "Kathmandu", geo: { lat: 27.7 } }, items: [{ sku: "A" }, { sku: "B" }] }];
  const flat = await convert(JSON.stringify(nested), { to: "json", flatten: true, pretty: false });
  const flatRows = JSON.parse(flat as string) as Record<string, unknown>[];
  expect(flatRows[0]).toEqual({ id: 1, "address.city": "Kathmandu", "address.geo.lat": 27.7, "items.0.sku": "A", "items.1.sku": "B" });
  const back = await convert(flat as string, { to: "json", unflatten: true, pretty: false });
  expect(JSON.parse(back as string)).toEqual(nested);
});
test("json: object-of-arrays → multi-table, and back to keyed object", async () => {
  const src = { users: [{ id: 1 }], orders: [{ id: 9, total: 5 }] };
  const tables = await parseInput(JSON.stringify(src), "json");
  expect(tables.map((t) => t.name)).toEqual(["users", "orders"]);
  const out = await serialize(tables, "json", { pretty: false });
  expect(JSON.parse(out as string)).toEqual(src);
});
test("json: single object → one row; array of arrays → header row", async () => {
  expect((await parseInput('{"a":1,"b":2}', "json"))[0]!.rows).toEqual([{ a: 1, b: 2 }]);
  expect((await parseInput('[["a","b"],[1,2]]', "json"))[0]!.rows).toEqual([{ a: 1, b: 2 }]);
});
test("json: invalid input throws ConvertError", async () => {
  await expect(parseInput("{oops", "json")).rejects.toBeInstanceOf(ConvertError);
});

/* ------------------------------ csv / tsv ------------------------------ */

test("csv: parse with inference (numbers, booleans, iso + dd-mm-yyyy dates, header row)", async () => {
  const [t] = await parseInput("id,name,ok,born,when,zip\n1,Ada,true,1815-12-10,10-12-1815,007\n2,Linus,false,1969-12-28,28/12/1969,90210", "csv");
  expect(t!.rows[0]).toEqual({ id: 1, name: "Ada", ok: true, born: new Date(Date.UTC(1815, 11, 10)), when: new Date(Date.UTC(1815, 11, 10)), zip: "007" });
  expect(t!.rows[1]!.id).toBe(2);
  expect(t!.rows[1]!.ok).toBe(false);
  expect(t!.rows[1]!.zip).toBe("90210");
});
test("csv: infer:false keeps strings; blank in typed column → null", async () => {
  const [raw] = await parseInput("n\n1\n2", "csv", { infer: false });
  expect(raw!.rows).toEqual([{ n: "1" }, { n: "2" }]);
  const [typed] = await parseInput("n\n1\n\n3", "csv");
  expect(typed!.rows.map((r) => r.n)).toEqual([1, 3]);
  const [blank] = await parseInput("n,m\n1,\n2,x", "csv");
  expect(blank!.rows[0]).toEqual({ n: 1, m: "" });
});
test("csv: serialize is injection-safe by default", async () => {
  const out = (await serialize([{ rows: [{ f: "=1+1", g: "+SUM(A1)", h: "safe" }] }], "csv")) as string;
  expect(out).toBe("f,g,h\n'=1+1,'+SUM(A1),safe");
  const raw = (await serialize([{ rows: [{ f: "=1+1" }] }], "csv", { escapeFormulas: false })) as string;
  expect(raw).toBe("f\n=1+1");
});
test("csv: dates, quoting, BOM", async () => {
  const out = (await serialize([{ rows: [{ born: rows[0]!.born, note: 'say "hi", ok' }] }], "csv", { bom: true })) as string;
  expect(out.charCodeAt(0)).toBe(0xfeff);
  expect(out.slice(1)).toBe('born,note\n1815-12-10,"say ""hi"", ok"');
});
test("tsv: round trip", async () => {
  const tsv = (await serialize([{ rows: [{ a: 1, b: "x y" }] }], "tsv")) as string;
  expect(tsv).toBe("a\tb\n1\tx y");
  const [t] = await parseInput(tsv, "tsv");
  expect(t!.rows).toEqual([{ a: 1, b: "x y" }]);
  expect((await convert(tsv, { to: "csv" })) as string).toBe("a,b\n1,x y");
});

/* ------------------------------ xlsx ------------------------------ */

test("xlsx: json → xlsx bytes → json keeps numbers, booleans and Dates", async () => {
  const bytes = (await serialize([{ name: "People", rows }], "xlsx")) as Uint8Array;
  expect(bytes[0]).toBe(0x50);
  const tables = await parseInput(bytes);
  expect(tables[0]!.name).toBe("People");
  const r = tables[0]!.rows;
  expect(r[0]!.id).toBe(1);
  expect(r[0]!.name).toBe("Ada");
  expect(r[0]!.ok).toBe(true);
  expect(r[0]!.score).toBe(9.5);
  expect(r[0]!.born).toBeInstanceOf(Date);
  expect((r[0]!.born as Date).toISOString()).toBe("1815-12-10T00:00:00.000Z");
  expect(r[1]!.born).toBeInstanceOf(Date);
});
test("xlsx: toExcel / fromExcel helpers, multi-sheet, sheet pick by name & index", async () => {
  const bytes = toExcel([{ name: "A", rows: [{ x: 1 }] }, { name: "B", rows: [{ y: 2 }] }]);
  const tables = await fromExcel(bytes);
  expect(tables.map((t) => t.name)).toEqual(["A", "B"]);
  expect(await fromExcel(bytes, { sheet: "B" })).toEqual([{ y: 2 }]);
  expect(await fromExcel(bytes, { sheet: 1 })).toEqual([{ y: 2 }]);
  await expect(fromExcel(bytes, { sheet: "nope" })).rejects.toBeInstanceOf(ConvertError);
});
test("xlsx: csv → xlsx → csv round trip via convert", async () => {
  const bytes = await convert("id,name\n1,Ada\n2,Linus", { to: "xlsx" });
  expect(bytes).toBeInstanceOf(Uint8Array);
  const csv = await convert(bytes, { to: "csv" });
  expect(csv).toBe("id,name\n1,Ada\n2,Linus");
});

/* ------------------------------ ndjson ------------------------------ */

test("ndjson: parse + serialize", async () => {
  const [t] = await parseInput('{"a":1}\n\n{"a":2,"b":"x"}\n');
  expect(t!.rows).toEqual([{ a: 1 }, { a: 2, b: "x" }]);
  const out = await serialize(t ? [t] : [], "ndjson");
  expect(out).toBe('{"a":1,"b":null}\n{"a":2,"b":"x"}');
});
test("ndjson: multiple tables get a _table marker", async () => {
  const out = (await serialize([{ name: "u", rows: [{ a: 1 }] }, { name: "o", rows: [{ b: 2 }] }], "ndjson")) as string;
  expect(out.split("\n").map((l) => JSON.parse(l)._table)).toEqual(["u", "o"]);
});

/* ------------------------------ markdown ------------------------------ */

test("markdown: round trip incl. escaped pipe and heading name", async () => {
  const src = [{ name: "a|b", n: 3, note: "line1\nline2" }];
  const md = (await serialize([{ name: "Things", rows: src }], "markdown")) as string;
  expect(md).toBe("### Things\n\n| name | n | note |\n| --- | --- | --- |\n| a\\|b | 3 | line1<br>line2 |\n");
  const [t] = await parseInput(md);
  expect(t!.name).toBe("Things");
  expect(t!.rows).toEqual(src);
});
test("markdown: two tables in one document", async () => {
  const md = "| a |\n|---|\n| 1 |\n\ntext\n\n| b |\n| :--- |\n| x |\n";
  const tables = await parseInput(md, "markdown");
  expect(tables).toHaveLength(2);
  expect(tables[0]!.rows).toEqual([{ a: 1 }]);
  expect(tables[1]!.rows).toEqual([{ b: "x" }]);
});

/* ------------------------------ html ------------------------------ */

test("html: parse table with <th> headers, entities and caption", async () => {
  const html = `<html><body><table id="x"><caption>Cap</caption><thead><tr><th>Name</th><th>Qty</th></tr></thead>
    <tbody><tr><td>Tom &amp; Jerry</td><td>2</td></tr><tr><td>&lt;b&gt;</td><td>3</td></tr></tbody></table></body></html>`;
  const [t] = await parseInput(html);
  expect(t!.name).toBe("Cap");
  expect(t!.rows).toEqual([{ Name: "Tom & Jerry", Qty: 2 }, { Name: "<b>", Qty: 3 }]);
});
test("html: parse table with no <th> uses first row; serialize escapes <", async () => {
  const [t] = await parseInput("<table><tr><td>a</td></tr><tr><td>1</td></tr></table>", "html");
  expect(t!.rows).toEqual([{ a: 1 }]);
  const out = (await serialize([{ rows: [{ "a<b": "<script>alert(1)</script>", q: 'x"y' }] }], "html", { pretty: false })) as string;
  expect(out).toBe('<table><thead><tr><th>a&lt;b</th><th>q</th></tr></thead><tbody><tr><td>&lt;script&gt;alert(1)&lt;/script&gt;</td><td>x&quot;y</td></tr></tbody></table>');
  const [back] = await parseInput(out, "html");
  expect(back!.rows).toEqual([{ "a<b": "<script>alert(1)</script>", q: 'x"y' }]);
});

/* ------------------------------ sql ------------------------------ */

test("sql: serialize quotes, NULL, booleans, dates and DDL", async () => {
  const out = (await serialize(
    [{ name: "people", rows: [{ id: 1, name: "O'Hara", ok: true, born: rows[0]!.born, score: 9.5, nick: null, "odd col": "x" }, { id: 2, name: "B", ok: false, born: rows[1]!.born, score: 8, nick: "b", "odd col": undefined }] }],
    "sql",
    { ddl: true },
  )) as string;
  expect(out).toBe(
    `CREATE TABLE "people" ("id" INTEGER, "name" TEXT, "ok" BOOLEAN, "born" TIMESTAMP, "score" REAL, "nick" TEXT, "odd col" TEXT);\n` +
    `INSERT INTO "people" ("id", "name", "ok", "born", "score", "nick", "odd col") VALUES (1, 'O''Hara', TRUE, '1815-12-10', 9.5, NULL, 'x');\n` +
    `INSERT INTO "people" ("id", "name", "ok", "born", "score", "nick", "odd col") VALUES (2, 'B', FALSE, '1969-12-28', 8, 'b', NULL);\n`,
  );
});
test("sql: parse INSERTs back (grouped by table, DDL columns, multi-row VALUES)", async () => {
  const sql = `CREATE TABLE t2 (x INTEGER, y TEXT);
    INSERT INTO "people" ("id", "name", "ok") VALUES (1, 'O''Hara', TRUE), (2, 'B', NULL);
    insert into t2 values (-5, 'q');
    INSERT INTO people (id, name, ok) VALUES (3, 'C', FALSE);`;
  const tables = await parseInput(sql);
  expect(tables.map((t) => t.name)).toEqual(["people", "t2"]);
  expect(tables[0]!.rows).toEqual([{ id: 1, name: "O'Hara", ok: true }, { id: 2, name: "B", ok: null }, { id: 3, name: "C", ok: false }]);
  expect(tables[1]!.rows).toEqual([{ x: -5, y: "q" }]);
});
test("sql: round trip through convert with tableName", async () => {
  const sql = (await convert('[{"a":1,"b":"x"}]', { to: "sql", tableName: "items" })) as string;
  expect(sql).toBe(`INSERT INTO "items" ("a", "b") VALUES (1, 'x');\n`);
  expect(JSON.parse((await convert(sql, { to: "json", pretty: false })) as string)).toEqual([{ a: 1, b: "x" }]);
});

/* ------------------------------ yaml / toml ------------------------------ */

test("yaml: round trip (array of objects) and codec exports", async () => {
  const src = [{ id: 1, name: "Ada", tags: ["x", "y"], meta: { ok: true } }];
  const yaml = (await convert(JSON.stringify(src), { to: "yaml" })) as string;
  expect(detect(yaml)).toBe("yaml");
  expect(JSON.parse((await convert(yaml, { to: "json", pretty: false })) as string)).toEqual(src);
  expect(parseYaml(stringifyYaml({ a: 1, b: "two" }))).toEqual({ a: 1, b: "two" });
});
test("yaml: object-of-arrays document → multi-table", async () => {
  const tables = await parseInput("users:\n  - id: 1\n  - id: 2\norders:\n  - id: 9\n", "yaml");
  expect(tables.map((t) => [t.name, t.rows.length])).toEqual([["users", 2], ["orders", 1]]);
});
test("toml: round trip via [[table]] arrays", async () => {
  const src = [{ id: 1, name: "Ada", ok: true }, { id: 2, name: "Linus", ok: false }];
  const toml = (await convert(JSON.stringify(src), { to: "toml", tableName: "users" })) as string;
  expect(toml).toContain("[[users]]");
  expect(detect(toml)).toBe("toml");
  const tables = await parseInput(toml);
  expect(tables[0]!.name).toBe("users");
  expect(tables[0]!.rows).toEqual(src);
  expect(parseToml(stringifyToml({ a: 1, s: { b: "x" } }))).toEqual({ a: 1, s: { b: "x" } });
});

/* ------------------------------ transforms ------------------------------ */

test("columns: select + reorder", async () => {
  const out = await convert(JSON.stringify(rows.map((r) => ({ id: r.id, name: r.name, ok: r.ok }))), { to: "csv", columns: ["name", "id"] });
  expect(out).toBe("name,id\nAda,1\nLinus,2");
});
test("rename: keys renamed, order preserved, works with columns", async () => {
  const out = await convert('[{"a":1,"b":2,"c":3}]', { to: "csv", columns: ["c", "a"], rename: { a: "alpha" } });
  expect(out).toBe("c,alpha\n3,1");
  const json = await convert('[{"a":1,"b":2}]', { to: "json", rename: { b: "beta" }, pretty: false });
  expect(json).toBe('[{"a":1,"beta":2}]');
});
test("sheet: pick by name and by index", async () => {
  const src = JSON.stringify({ users: [{ id: 1 }], orders: [{ id: 9 }] });
  expect(await convert(src, { to: "csv", sheet: "orders" })).toBe("id\n9");
  expect(await convert(src, { to: "csv", sheet: 0 })).toBe("id\n1");
  await expect(convert(src, { to: "csv", sheet: "nope" })).rejects.toBeInstanceOf(ConvertError);
});
test("convert accepts Row[] / Table[] directly", async () => {
  expect(await convert([{ a: 1 }], { to: "csv" })).toBe("a\n1");
  expect(await convert([{ name: "t", rows: [{ a: 1 }] }], { to: "sql" })).toBe(`INSERT INTO "t" ("a") VALUES (1);\n`);
});
test("flatten / unflatten standalone", () => {
  const flat = flatten({ a: { b: [1, { c: 2 }] }, "x.y": 3, d: new Date(0) });
  expect(flat).toEqual({ "a.b.0": 1, "a.b.1.c": 2, '["x.y"]': 3, d: new Date(0) });
  expect(unflatten(flat)).toEqual({ a: { b: [1, { c: 2 }] }, "x.y": 3, d: new Date(0) });
  expect(() => unflatten({ "__proto__.polluted": 1 })).toThrow(ConvertError);
});

/* ------------------------------ inference ------------------------------ */

test("inferTypes: whole column must agree; mixed columns stay strings", () => {
  const out = inferTypes([{ n: "1", m: "1", b: "TRUE", d: "2024-02-29" }, { n: "2.5", m: "x", b: "false", d: "2024-13-01" }]);
  expect(out).toEqual([{ n: 1, m: "1", b: true, d: "2024-02-29" }, { n: 2.5, m: "x", b: false, d: "2024-13-01" }]);
  expect(inferTypes([{ id: "12345678901234567890" }])[0]!.id).toBe("12345678901234567890");
});
test("inferSchema: types, nullable, samples", () => {
  const schema = inferSchema([{ id: 1, name: "Ada", when: new Date(0), ok: true, meta: { a: 1 }, gone: null }, { id: 2, name: null, when: new Date(1), ok: false, meta: [1], gone: null }]);
  expect(schema).toEqual([
    { name: "id", type: "number", nullable: false, samples: [1, 2] },
    { name: "name", type: "string", nullable: true, samples: ["Ada"] },
    { name: "when", type: "date", nullable: false, samples: [new Date(0), new Date(1)] },
    { name: "ok", type: "boolean", nullable: false, samples: [true, false] },
    { name: "meta", type: "object", nullable: false, samples: [{ a: 1 }, [1]] },
    { name: "gone", type: "null", nullable: true, samples: [] },
  ]);
  expect(inferSchema([{ v: 1 }, { v: "x" }])[0]!.type).toBe("string");
});

/* ------------------------------ streaming ------------------------------ */

test("parseLines: csv generator with quoted newlines, per-cell inference, onRow", () => {
  const csv = 'id,name\n1,"Ada\nLovelace"\n2,Linus\n\n3,true\n';
  const seen: unknown[] = [];
  const it = parseLines(csv, "csv", (row, i) => seen.push([i, row.id]));
  expect(typeof it.next).toBe("function");
  const out = [...it];
  expect(out).toEqual([{ id: 1, name: "Ada\nLovelace" }, { id: 2, name: "Linus" }, { id: 3, name: true }]);
  expect(seen).toEqual([[0, 1], [1, 2], [2, 3]]);
  expect([...parseLines("n\n1", "csv", { infer: false })]).toEqual([{ n: "1" }]);
});
test("parseLines: ndjson generator is lazy", () => {
  const it = parseLines('{"a":1}\n{"a":2}\nnot json', "ndjson");
  expect(it.next().value).toEqual({ a: 1 });
  expect(it.next().value).toEqual({ a: 2 });
  expect(() => it.next()).toThrow();
});
