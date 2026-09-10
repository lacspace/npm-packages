import { test, expect } from "vitest";
import { readWorkbook, sheetToAoa, type ReadCell } from "@lacspace/xlsx";
import {
  TEMPLATES,
  listTemplates,
  getTemplate,
  buildTemplate,
  templateToTables,
  toExcelFormula,
} from "./templates";

/** Decode the (STORE-method, uncompressed) .xlsx bytes to a searchable string. */
const asText = (bytes: Uint8Array): string => Buffer.from(bytes).toString("latin1");

const EXPECTED_IDS = [
  "invoice", "quotation", "purchase-order", "inventory", "price-list", "customers", "orders", "expenses", "payroll",
  "cashbook", "attendance", "budget", "sales-register", "timesheet", "project-tracker", "loan-schedule", "grade-book",
];

const num = (v: ReadCell | undefined): number => (typeof v === "number" ? v : Number.NaN);
const sum = (xs: number[]): number => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

/* ------------------------------ catalogue ------------------------------ */

test("listTemplates returns the 17 templates with id/name/description/category", () => {
  const list = listTemplates();
  expect(list).toHaveLength(17);
  expect(list.map((t) => t.id).sort()).toEqual([...EXPECTED_IDS].sort());
  for (const t of list) {
    expect(t.name.length).toBeGreaterThan(2);
    expect(t.description.length).toBeGreaterThan(20);
    expect(["finance", "sales", "inventory", "hr", "projects", "education", "personal"]).toContain(t.category);
  }
});

test("getTemplate finds known ids and returns undefined for unknown ones", () => {
  expect(getTemplate("invoice")?.name).toBe("Invoice");
  expect(getTemplate("nope")).toBeUndefined();
  expect(getTemplate("")).toBeUndefined();
});

test("buildTemplate throws a helpful error for an unknown id", () => {
  expect(() => buildTemplate("does-not-exist")).toThrow(/Unknown template "does-not-exist"/);
});

test("every template has 1–2 sheets, a formula column and 4–12 realistic sample rows", () => {
  for (const t of TEMPLATES) {
    expect(t.sheets.length).toBeGreaterThanOrEqual(1);
    expect(t.sheets.length).toBeLessThanOrEqual(2);
    expect(t.keywords.length).toBeGreaterThan(0);
    const main = t.sheets[0]!;
    expect(main.columns.some((col) => col.formula || col.excel)).toBe(true);
    expect(main.rows.length).toBeGreaterThanOrEqual(4);
    expect(main.rows.length).toBeLessThanOrEqual(12);
    // every sample row only uses declared keys
    const keys = new Set(main.columns.map((col) => col.key));
    for (const row of main.rows) for (const k of Object.keys(row)) expect(keys.has(k)).toBe(true);
  }
});

test("every row formula in the catalogue is expressible as an Excel A1 formula", () => {
  for (const t of TEMPLATES) {
    for (const sheet of t.sheets) {
      for (const col of sheet.columns) {
        if (col.formula && !col.excel) {
          expect(toExcelFormula(col.formula, sheet.columns, 2), `${t.id}.${col.key}`).toBeTypeOf("string");
        }
      }
    }
  }
});

/* ------------------------------ building ------------------------------ */

test.each(EXPECTED_IDS)("%s builds to valid .xlsx bytes whose sheet names match", async (id) => {
  const tpl = getTemplate(id)!;
  const bytes = buildTemplate(id);
  expect(bytes[0]).toBe(0x50); // P
  expect(bytes[1]).toBe(0x4b); // K
  const wb = await readWorkbook(bytes);
  expect(wb.sheetNames).toEqual(tpl.sheets.map((s) => s.name));
  const first = wb.sheets[0]!;
  expect(first.rows[0]).toEqual(tpl.sheets[0]!.columns.map((col) => col.header));
  // header + sample rows + 20 blank rows (+ totals row where declared)
  const expectedRows = 1 + tpl.sheets[0]!.rows.length + 20 + (tpl.sheets[0]!.totals ? 1 : 0);
  expect(first.rows.length).toBe(expectedRows);
});

test("invoice: first data row's Amount formula cell reads back with cached qty*rate and an A1 formula", async () => {
  const bytes = buildTemplate("invoice");
  const wb = await readWorkbook(bytes);
  const rows = sheetToAoa(wb.sheet("Invoice")!);
  const [item, , qty, rate, amount, taxRate, tax, total] = rows[1]!;
  expect(item).toBe("Web design");
  expect(amount).toBe(num(qty) * num(rate));
  expect(tax).toBe(Math.round(num(amount) * num(taxRate) * 100) / 100);
  expect(total).toBe(num(amount) + num(tax));
  const xml = asText(bytes);
  expect(xml).toContain('<c r="E2" s="4"><f>C2*D2</f><v>1800</v></c>');
  expect(xml).toContain("<f>ROUND(E2*F2,2)</f>");
  expect(xml).toContain("<f>E2+G2</f>");
});

test("invoice: totals row carries SUM over data + blank rows with a cached value equal to the JS sum", async () => {
  const bytes = buildTemplate("invoice");
  const wb = await readWorkbook(bytes);
  const rows = sheetToAoa(wb.sheet("Invoice")!);
  const totals = rows[rows.length - 1]!;
  expect(totals[0]).toBe("Total");
  const amounts = rows.slice(1, 6).map((r) => num(r[4]!));
  expect(totals[4]).toBe(sum(amounts));
  const xml = asText(bytes);
  // 5 sample + 20 blank rows → data lives in rows 2..26, totals in row 27
  expect(xml).toContain('<c r="E27" s="4"><f>SUM(E2:E26)</f>');
  expect(xml).toContain("<f>SUM(H2:H26)</f>");
});

test("blankRows adds empty rows with the formulas pre-filled and cached 0 / empty text", () => {
  const xml = asText(buildTemplate("invoice", { blankRows: 3 }));
  // rows 2..6 are samples, 7..9 blank, 10 totals
  expect(xml).toContain('<c r="E9" s="4"><f>C9*D9</f><v>0</v></c>');
  expect(xml).toContain("<f>SUM(E2:E9)</f>");
  expect(xml).not.toContain('r="E11"');
  const gradeXml = asText(buildTemplate("grade-book", { blankRows: 1 }));
  // blank text formula → cached "" → formula only, no <v>
  expect(gradeXml).toMatch(/<c r="I9"><f>IF\(G9=0,&quot;&quot;,[^<]*<\/f><\/c>/);
});

test("sample:false emits only blank rows and totals", async () => {
  const bytes = buildTemplate("payroll", { sample: false, blankRows: 4 });
  const wb = await readWorkbook(bytes);
  const rows = sheetToAoa(wb.sheet("Payroll")!);
  expect(rows.length).toBe(1 + 4 + 1);
  expect(rows[1]![0]).toBeNull();
  expect(rows[1]![7]).toBe(0); // overtime cached 0
  expect(rows[5]![0]).toBe("Total");
  expect(asText(bytes)).toContain("<f>SUM(L2:L5)</f>");
});

test("currencyFormat is written into styles.xml (default #,##0.00, custom code honoured)", () => {
  expect(asText(buildTemplate("invoice"))).toContain('formatCode="#,##0.00"');
  const custom = asText(buildTemplate("invoice", { currencyFormat: "#,##0.00 [$USD]" }));
  expect(custom).toContain('formatCode="#,##0.00 [$USD]"');
  expect(custom).not.toContain('formatCode="#,##0.00"');
});

test("percent, date and number columns get their number formats; header row is bold", () => {
  const xml = asText(buildTemplate("orders"));
  expect(xml).toContain('formatCode="yyyy-mm-dd"');
  expect(xml).toContain('formatCode="#,##0.##"');
  expect(asText(buildTemplate("invoice"))).toContain('formatCode="0.0%"');
  // A1 header cell uses the bold style (index 1)
  expect(xml).toContain('<c r="A1" s="1" t="inlineStr"><is><t xml:space="preserve">Order ID</t></is></c>');
  // column widths emitted
  expect(xml).toContain('customWidth="1"');
});

test("date and boolean columns round-trip as real Dates and booleans", async () => {
  const orders = sheetToAoa((await readWorkbook(buildTemplate("orders"))).sheet("Orders")!);
  expect(orders[1]![1]).toBeInstanceOf(Date);
  expect((orders[1]![1] as Date).toISOString().slice(0, 10)).toBe("2026-04-01");
  const expenses = sheetToAoa((await readWorkbook(buildTemplate("expenses"))).sheet("Expenses")!);
  expect(expenses[1]![8]).toBe(true);
  expect(expenses[3]![8]).toBe(false);
});

test("count totals use COUNTA for text columns and COUNT for numeric ones", () => {
  const xml = asText(buildTemplate("customers", { blankRows: 2 }));
  expect(xml).toContain("<f>COUNTA(A2:A9)</f><v>6</v>");
  expect(xml).toContain("<f>SUM(H2:H9)</f><v>55</v>");
});

test("average totals cache the mean of the sample data", async () => {
  const rows = sheetToAoa((await readWorkbook(buildTemplate("grade-book", { blankRows: 0 }))).sheet("Grades")!);
  const totals = rows[rows.length - 1]!;
  const maths = rows.slice(1, 8).map((r) => num(r[2]!));
  expect(totals[2]).toBeCloseTo(maths.reduce((a, b) => a + b, 0) / maths.length, 6);
  expect(asText(buildTemplate("grade-book", { blankRows: 0 }))).toContain("<f>AVERAGE(C2:C8)</f>");
});

/* ------------------------------ formula derivation ------------------------------ */

test("toExcelFormula derives A1 references from the column order", () => {
  const cols = [{ key: "item" }, { key: "qty" }, { key: "rate" }, { key: "amount" }];
  expect(toExcelFormula("=qty*rate", cols, 2)).toBe("B2*C2");
  expect(toExcelFormula("qty * rate", cols, 10)).toBe("B10*C10");
  expect(toExcelFormula("=ROUND(amount*0.15, 2)", cols, 3)).toBe("ROUND(D3*0.15,2)");
  expect(toExcelFormula("=(qty+1)*rate/2^2", cols, 4)).toBe("(B4+1)*C4/2^2");
  expect(toExcelFormula("=[qty]*[rate]", cols, 5)).toBe("B5*C5");
  expect(toExcelFormula('=IF(amount>=100,"big","small")', cols, 6)).toBe('IF(D6>=100,"big","small")');
  expect(toExcelFormula("=IF(qty<>0; amount/qty; 0)", cols, 7)).toBe("IF(B7<>0,D7/B7,0)");
});

test("toExcelFormula returns undefined for unknown keys, column aggregates or stray characters", () => {
  const cols = [{ key: "qty" }, { key: "rate" }];
  expect(toExcelFormula("=qty*price", cols, 2)).toBeUndefined();
  expect(toExcelFormula("=SUM(qty)", cols, 2)).toBeUndefined();
  expect(toExcelFormula("=LOOKUP(qty, rate)", cols, 2)).toBeUndefined();
  expect(toExcelFormula("=qty # rate", cols, 2)).toBeUndefined();
  expect(toExcelFormula('="unclosed', cols, 2)).toBeUndefined();
  expect(toExcelFormula("=", cols, 2)).toBeUndefined();
});

test("columns beyond Z resolve to two-letter references", () => {
  const cols = Array.from({ length: 28 }, (_, i) => ({ key: `k${i}` }));
  expect(toExcelFormula("=k26+k27", cols, 2)).toBe("AA2+AB2");
});

/* ------------------------------ tables ------------------------------ */

test("templateToTables computes formula columns for every sheet", () => {
  const [invoice, details] = templateToTables("invoice");
  expect(invoice!.name).toBe("Invoice");
  expect(invoice!.rows[0]).toMatchObject({ item: "Web design", qty: 1, rate: 1800, amount: 1800, tax: 270, total: 2070 });
  expect(invoice!.rows[1]).toMatchObject({ qty: 12, rate: 25, amount: 300, tax: 45, total: 345 });
  expect(details!.name).toBe("Details");
  expect(details!.rows[0]).toEqual({ field: "Invoice No.", value: "INV-2026-0042" });

  const [grades] = templateToTables("grade-book");
  const novak = grades!.rows.find((r) => r.student === "S. Novak")!;
  expect(novak).toMatchObject({ total: 372, percentage: 0.93, grade: "A" });
  const haddad = grades!.rows.find((r) => r.student === "N. Haddad")!;
  expect(haddad.grade).toBe("F");
  // every row exposes every column key (nulls for missing values)
  for (const row of grades!.rows) expect(Object.keys(row)).toEqual(getTemplate("grade-book")!.sheets[0]!.columns.map((col) => col.key));
});

test("templateToTables accepts a Template object and strips float noise", () => {
  const [orders] = templateToTables(getTemplate("orders")!);
  // 3 * 22.7 + 5 would be 73.10000000000001 in raw JS
  expect(orders!.rows[0]!.total).toBe(73.1);
});

/* ------------------------------ loan schedule ------------------------------ */

test("loan-schedule sample data is a correct amortisation that ends at a zero balance", () => {
  const [schedule] = templateToTables("loan-schedule");
  const rows = schedule!.rows;
  expect(rows).toHaveLength(12);
  const last = rows[rows.length - 1]!;
  expect(Math.abs(num(last.closing as ReadCell))).toBeLessThan(0.005);
  expect(sum(rows.map((r) => num(r.principal as ReadCell)))).toBe(120000);
  // each row chains: opening = previous closing; interest = opening * 9% / 12
  for (let i = 1; i < rows.length; i++) expect(rows[i]!.opening).toBe(rows[i - 1]!.closing);
  for (const r of rows) {
    expect(r.interest).toBe(Math.round(num(r.opening as ReadCell) * 0.09 / 12 * 100) / 100);
    expect(num(r.payment as ReadCell)).toBeCloseTo(num(r.interest as ReadCell) + num(r.principal as ReadCell), 2);
  }
  // fixed EMI for 120000 @ 9% over 12 months = 10494.18
  expect(rows[0]!.payment).toBe(10494.18);
});

test("loan-schedule workbook chains rows with per-row Excel formulas and correct cached values", async () => {
  const bytes = buildTemplate("loan-schedule", { blankRows: 2 });
  const xml = asText(bytes);
  // first row: literals for period / rate / opening / payment; formulas for interest, principal, closing
  expect(xml).toContain('<c r="C2" s="5"><v>120000</v></c>');
  expect(xml).toContain("<f>ROUND(C2*B2/12,2)</f><v>900</v>");
  // later rows chain from the row above
  expect(xml).toContain("<f>A2+1</f><v>2</v>");
  expect(xml).toContain("<f>B2</f><v>0.09</v>");
  expect(xml).toContain("<f>G2</f>");
  expect(xml).toContain("<f>MIN(D2,C3+E3)</f><v>10494.18</v>");
  expect(xml).toContain("<f>D3-E3</f>");
  expect(xml).toContain("<f>C3-F3</f>");
  const rows = sheetToAoa((await readWorkbook(bytes)).sheet("Schedule")!);
  expect(rows[2]![2]).toBe(rows[1]![6]); // opening(row3) = closing(row2)
  expect(Math.abs(num(rows[12]![6]!))).toBeLessThan(0.005);
  const totals = rows[rows.length - 1]!;
  expect(totals[0]).toBe("Total");
  expect(totals[5]).toBe(120000);
});

/* ------------------------------ misc templates ------------------------------ */

test("cashbook carries a running balance down the sheet", async () => {
  const bytes = buildTemplate("cashbook");
  const xml = asText(bytes);
  expect(xml).toContain("<f>G2+F3</f><v>28105</v>");
  const rows = sheetToAoa((await readWorkbook(bytes)).sheet("Cashbook")!);
  expect(rows[1]![6]).toBe(25000);
  expect(rows[7]![6]).toBe(4909.1);
});

test("grade-book writes an IF() chain and the computed letter grade as cached text", async () => {
  const bytes = buildTemplate("grade-book");
  const xml = asText(bytes);
  expect(xml).toContain('<f>IF(G2=0,&quot;&quot;,IF(H2&gt;=0.9,&quot;A&quot;,IF(H2&gt;=0.8,&quot;B&quot;,IF(H2&gt;=0.7,&quot;C&quot;,IF(H2&gt;=0.6,&quot;D&quot;,&quot;F&quot;)))))</f><v>B</v>');
  const rows = sheetToAoa((await readWorkbook(bytes)).sheet("Grades")!);
  expect(rows[1]![8]).toBe("B");
  expect(rows[4]![8]).toBe("A");
  expect(rows[3]![8]).toBe("D");
  expect(rows[7]![8]).toBe("F");
});

test("sales-register has taxable / tax rate / tax / total columns with correct cached values", async () => {
  const rows = sheetToAoa((await readWorkbook(buildTemplate("sales-register"))).sheet("Sales Register")!);
  expect(rows[0]).toEqual(["Date", "Invoice No.", "Customer", "Taxable", "Tax Rate", "Tax", "Total", "Payment Mode"]);
  expect(rows[1]!.slice(3, 7)).toEqual([2700, 0.13, 351, 3051]);
  expect(rows[6]!.slice(3, 7)).toEqual([460, 0, 0, 460]);
});

test("timesheet bills only billable hours via IF over a boolean column", async () => {
  const rows = sheetToAoa((await readWorkbook(buildTemplate("timesheet"))).sheet("Timesheet")!);
  expect(rows[1]![7]).toBe(552.5);
  expect(rows[3]![7]).toBe(0);
  expect(asText(buildTemplate("timesheet"))).toContain("<f>IF(F2,ROUND(E2*G2,2),0)</f>");
});

test("sample data is country- and currency-neutral", () => {
  const text = JSON.stringify(templateToTables("invoice").concat(templateToTables("payroll"), templateToTables("orders")));
  expect(text).not.toMatch(/[$€£₹¥]/);
  expect(text).not.toMatch(/Nepal|India-based|Rs\.|NPR|USD/);
});
