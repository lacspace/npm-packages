/**
 * lacspace-excel — templates
 *
 * Prebuilt, ready-to-fill Excel workbooks with LIVE formulas: invoices,
 * inventory, payroll, loan schedules, grade books… Each template is a plain
 * data description (columns + realistic sample rows + footer totals); the
 * builder turns it into real .xlsx bytes via @lacspace/xlsx, computing every
 * cached value with @lacspace/formula so the file looks right even in viewers
 * that never recalculate.
 */

import { Workbook, formula as xlsxFormula, columnLetter, type CellValue, type Column, type FormulaCell } from "@lacspace/xlsx";
import { computeColumn } from "@lacspace/formula";

/* ------------------------------ types ------------------------------ */

export type TemplateColumnType = "text" | "number" | "currency" | "percent" | "date" | "boolean";

export interface TemplateColumn {
  header: string;
  key: string;
  type: TemplateColumnType;
  width?: number;
  numFmt?: string;
  /** Row formula in @lacspace/formula syntax over sibling keys, e.g. "=qty*rate". Used to compute cached values. */
  formula?: string;
  /**
   * The same formula as an Excel A1 pattern; `{row}` is replaced by the 1-based
   * Excel row number, `{prev}` by the previous row number and `{col:key}` by that
   * key's column letter, e.g. "{col:qty}{row}*{col:rate}{row}". If omitted but
   * `formula` is set, it is derived automatically (see {@link toExcelFormula}).
   * A column with `excel` but no `formula` keeps the row's literal value as the
   * cached value (and is written as a literal on the first data row when the
   * pattern references `{prev}`).
   */
  excel?: string;
}

export type TemplateTotal = "sum" | "average" | "count" | "max" | "min";

export interface TemplateSheet {
  name: string;
  columns: TemplateColumn[];
  /** Sample rows (realistic, country-neutral, currency-neutral) — 4–8 rows. */
  rows: Record<string, unknown>[];
  /** Footer aggregates per key → an Excel formula row like SUM(D2:D9) with cached value. */
  totals?: Record<string, TemplateTotal>;
}

export type TemplateCategory = "finance" | "sales" | "inventory" | "hr" | "projects" | "education" | "personal";

export interface Template {
  id: string;
  name: string;
  description: string;
  category: TemplateCategory;
  keywords: string[];
  sheets: TemplateSheet[];
}

export interface BuildOptions {
  /** Include the sample rows. Default true. */
  sample?: boolean;
  /** Extra empty rows with formulas pre-filled. Default 20. */
  blankRows?: number;
  /** Number format for currency columns. Default "#,##0.00". */
  currencyFormat?: string;
}

/* ------------------------------ helpers ------------------------------ */

const c = (
  header: string,
  key: string,
  type: TemplateColumnType,
  extra: Partial<Omit<TemplateColumn, "header" | "key" | "type">> = {},
): TemplateColumn => ({ header, key, type, ...extra });

const round2 = (n: number): number => Math.round(n * 100) / 100;
/** Strip binary float noise (0.1 + 0.2 → 0.3) without changing real values. */
const tidy = (n: number): number => Math.round(n * 1e10) / 1e10;

/** Excel functions whose per-row behaviour matches @lacspace/formula for scalar arguments. */
const PASSTHROUGH_FUNCTIONS = new Set([
  "IF", "AND", "OR", "NOT", "ROUND", "ROUNDUP", "ROUNDDOWN", "ABS", "MAX", "MIN", "INT", "MOD", "POWER", "SQRT", "IFERROR", "TRUE", "FALSE",
]);

/**
 * Translate a row formula in @lacspace/formula syntax (`"=qty*rate"`) into an
 * Excel A1 formula (`"B2*C2"`) given the sheet's column order and the 1-based
 * Excel row. Supports keys (bare or `[bracketed]`), numbers, strings, the
 * operators `+ - * / ^ & % = <> < > <= >=`, parentheses, commas and a small set
 * of row-scoped functions (IF, ROUND, MAX, MIN, ABS, AND, OR…). Returns
 * `undefined` when the formula cannot be expressed that way (an unknown key or
 * a column-aggregate function such as SUM), in which case the builder writes
 * the cached value as a plain cell.
 */
export function toExcelFormula(formula: string, columns: { key: string }[], row: number): string | undefined {
  const src = formula.replace(/^\s*=/, "");
  const letters = new Map<string, string>();
  columns.forEach((col, i) => letters.set(col.key, columnLetter(i)));
  let out = "";
  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i += 1; continue; }
    if ((ch >= "0" && ch <= "9") || (ch === "." && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j]!)) j += 1;
      if ((src[j] === "e" || src[j] === "E") && /[0-9+-]/.test(src[j + 1] ?? "")) {
        j += 2;
        while (j < src.length && /[0-9]/.test(src[j]!)) j += 1;
      }
      out += src.slice(i, j);
      i = j;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === '"') { if (src[j + 1] === '"') { j += 2; continue; } break; }
        j += 1;
      }
      if (j >= src.length) return undefined;
      out += src.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (ch === "[") {
      const end = src.indexOf("]", i);
      if (end === -1) return undefined;
      const letter = letters.get(src.slice(i + 1, end).trim());
      if (!letter) return undefined;
      out += `${letter}${row}`;
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j]!)) j += 1;
      const name = src.slice(i, j);
      let k = j;
      while (k < src.length && src[k] === " ") k += 1;
      if (src[k] === "(") {
        if (!PASSTHROUGH_FUNCTIONS.has(name.toUpperCase())) return undefined;
        out += name.toUpperCase();
        i = j;
        continue;
      }
      const letter = letters.get(name);
      if (!letter) return undefined;
      out += `${letter}${row}`;
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (two === "<=" || two === ">=" || two === "<>") { out += two; i += 2; continue; }
    if ("+-*/^&=<>%(),".includes(ch)) { out += ch; i += 1; continue; }
    if (ch === ";") { out += ","; i += 1; continue; }
    return undefined;
  }
  return out || undefined;
}

/** Expand an `excel` pattern: `{row}`, `{prev}` and `{col:key}` placeholders. */
function expandPattern(pattern: string, columns: TemplateColumn[], row: number): string {
  return pattern.replace(/\{col:([^}]+)\}/g, (_, key: string) => {
    const idx = columns.findIndex((col) => col.key === key);
    if (idx === -1) throw new Error(`Template pattern references unknown key "${key}"`);
    return columnLetter(idx);
  }).replace(/\{row\}/g, String(row)).replace(/\{prev\}/g, String(row - 1));
}

function numFmtFor(col: TemplateColumn, currencyFormat: string): string | undefined {
  if (col.numFmt) return col.numFmt;
  switch (col.type) {
    case "currency": return currencyFormat;
    case "percent": return "0.0%";
    case "date": return "yyyy-mm-dd";
    case "number": return "#,##0.##";
    default: return undefined;
  }
}

function toCell(col: TemplateColumn, value: unknown): CellValue {
  if (value === null || value === undefined || value === "") return undefined;
  if (col.type === "date") {
    if (value instanceof Date) return value;
    const d = new Date(String(value));
    return Number.isNaN(d.getTime()) ? String(value) : d;
  }
  if (value instanceof Date) return value;
  if (typeof value === "number") return tidy(value);
  if (typeof value === "boolean" || typeof value === "string") return value;
  return String(value);
}

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Sample rows with every `formula` column evaluated (in column order, so later
 * formulas may reference earlier computed columns). Values are tidied of float
 * noise; dates stay as given (ISO strings).
 */
function computeRows(sheet: TemplateSheet): Record<string, unknown>[] {
  const rows = sheet.rows.map((r) => ({ ...r }));
  for (const col of sheet.columns) {
    if (!col.formula) continue;
    const values = computeColumn(col.formula, rows);
    values.forEach((v, i) => { rows[i]![col.key] = isNum(v) ? tidy(v) : v; });
  }
  return rows;
}

function aggregate(kind: TemplateTotal, values: unknown[]): number {
  const nums = values.filter(isNum);
  switch (kind) {
    case "sum": return tidy(nums.reduce((a, b) => a + b, 0));
    case "average": return nums.length ? tidy(nums.reduce((a, b) => a + b, 0) / nums.length) : 0;
    case "count": return values.filter((v) => v !== null && v !== undefined && v !== "").length;
    case "max": return nums.length ? Math.max(...nums) : 0;
    case "min": return nums.length ? Math.min(...nums) : 0;
  }
}

/* ------------------------------ public API ------------------------------ */

function resolve(template: string | Template): Template {
  if (typeof template !== "string") return template;
  const found = getTemplate(template);
  if (!found) throw new Error(`Unknown template "${template}". Available: ${TEMPLATES.map((t) => t.id).join(", ")}`);
  return found;
}

export function listTemplates(): { id: string; name: string; description: string; category: string }[] {
  return TEMPLATES.map(({ id, name, description, category }) => ({ id, name, description, category }));
}

export function getTemplate(id: string): Template | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Sample rows with formula columns computed — for CSV/JSON export by the CLI. */
export function templateToTables(template: string | Template): { name: string; rows: Record<string, unknown>[] }[] {
  return resolve(template).sheets.map((sheet) => ({
    name: sheet.name,
    rows: computeRows(sheet).map((r) => Object.fromEntries(sheet.columns.map((col) => [col.key, r[col.key] ?? null]))),
  }));
}

/** Build a template into .xlsx bytes: bold header, widths, number formats, live formulas with cached values and a totals row. */
export function buildTemplate(template: string | Template, opts: BuildOptions = {}): Uint8Array {
  const tpl = resolve(template);
  const { sample = true, blankRows = 20, currencyFormat = "#,##0.00" } = opts;
  const wb = new Workbook();

  for (const sheet of tpl.sheets) {
    const cols = sheet.columns;
    const computed = sample ? computeRows(sheet) : [];
    const dataCount = computed.length + Math.max(0, blankRows);
    const grid: CellValue[][] = [cols.map((col) => col.header)];

    for (let i = 0; i < dataCount; i++) {
      const excelRow = i + 2;
      const src = computed[i];
      const cells: CellValue[] = cols.map((col): CellValue => {
        const raw = src?.[col.key];
        const isNumeric = col.type === "number" || col.type === "currency" || col.type === "percent";
        const cachedBlank: FormulaCell["v"] = isNumeric ? 0 : "";
        const cached: FormulaCell["v"] = src === undefined
          ? cachedBlank
          : isNum(raw) ? raw : typeof raw === "boolean" ? raw : raw === null || raw === undefined ? cachedBlank : String(raw);

        if (col.formula) {
          const f = col.excel ? expandPattern(col.excel, cols, excelRow) : toExcelFormula(col.formula, cols, excelRow);
          if (!f) return src === undefined ? undefined : toCell(col, raw);
          return xlsxFormula(f, cached);
        }
        if (col.excel) {
          const chained = col.excel.includes("{prev}");
          if (chained && i === 0) return src === undefined ? undefined : toCell(col, raw);
          return xlsxFormula(expandPattern(col.excel, cols, excelRow), cached);
        }
        return src === undefined ? undefined : toCell(col, raw);
      });
      grid.push(cells);
    }

    if (sheet.totals && Object.keys(sheet.totals).length > 0 && dataCount > 0) {
      const first = 2;
      const last = dataCount + 1;
      const labelIdx = Math.max(0, cols.findIndex((col) => col.type === "text" && !(col.key in sheet.totals!)));
      const row: CellValue[] = cols.map((col, idx) => {
        const kind = sheet.totals![col.key];
        if (kind) {
          const letter = columnLetter(idx);
          const range = `${letter}${first}:${letter}${last}`;
          const isNumeric = col.type === "number" || col.type === "currency" || col.type === "percent";
          const fn = kind === "count" ? (isNumeric ? "COUNT" : "COUNTA") : kind.toUpperCase();
          return xlsxFormula(`${fn}(${range})`, aggregate(kind, computed.map((r) => r[col.key])));
        }
        return idx === labelIdx ? "Total" : undefined;
      });
      grid.push(row);
    }

    const columns: Column[] = cols.map((col) => ({ header: col.header, key: col.key, width: col.width ?? defaultWidth(col), numFmt: numFmtFor(col, currencyFormat) }));
    wb.sheet(sheet.name, grid, { header: true, columns });
  }

  return wb.toBytes();
}

function defaultWidth(col: TemplateColumn): number {
  switch (col.type) {
    case "date": return 12;
    case "boolean": return 11;
    case "percent": return 10;
    case "currency": return 14;
    case "number": return 10;
    default: return Math.max(14, Math.min(32, col.header.length + 6));
  }
}

/* ------------------------------ sample data ------------------------------ */

const detailsSheet = (name: string, rows: [string, string][]): TemplateSheet => ({
  name,
  columns: [c("Field", "field", "text", { width: 18 }), c("Value", "value", "text", { width: 40 })],
  rows: rows.map(([field, value]) => ({ field, value })),
});

/** Build a correct amortisation table: fixed EMI, interest rounded per period, final payment settles the balance. */
function amortise(principal: number, annualRate: number, months: number): Record<string, unknown>[] {
  const r = annualRate / 12;
  const emi = round2((principal * r * (1 + r) ** months) / ((1 + r) ** months - 1));
  const rows: Record<string, unknown>[] = [];
  let opening = principal;
  for (let period = 1; period <= months; period++) {
    const interest = round2(opening * r);
    const payment = period === months ? round2(opening + interest) : Math.min(emi, round2(opening + interest));
    const principalPart = round2(payment - interest);
    const closing = round2(opening - principalPart);
    rows.push({ period, rate: annualRate, opening, payment, interest, principal: principalPart, closing });
    opening = closing;
  }
  return rows;
}

const TAX = 0.15;

export const TEMPLATES: Template[] = [
  {
    id: "invoice",
    name: "Invoice",
    description: "Line-item invoice with quantity × rate, per-line tax and grand totals, plus a details sheet for parties and dates.",
    category: "finance",
    keywords: ["invoice", "billing", "tax", "receivable"],
    sheets: [
      {
        name: "Invoice",
        columns: [
          c("Item", "item", "text", { width: 22 }),
          c("Description", "description", "text", { width: 36 }),
          c("Qty", "qty", "number"),
          c("Rate", "rate", "currency"),
          c("Amount", "amount", "currency", { formula: "=qty*rate" }),
          c("Tax Rate", "taxRate", "percent"),
          c("Tax", "tax", "currency", { formula: "=ROUND(amount*taxRate,2)" }),
          c("Total", "total", "currency", { formula: "=amount+tax" }),
        ],
        rows: [
          { item: "Web design", description: "Landing page design and build", qty: 1, rate: 1800, taxRate: TAX },
          { item: "Hosting", description: "Managed hosting, 12 months", qty: 12, rate: 25, taxRate: TAX },
          { item: "Support", description: "Priority support hours", qty: 6, rate: 60, taxRate: TAX },
          { item: "Stock photos", description: "Licensed images (pack of 20)", qty: 2, rate: 45.5, taxRate: TAX },
          { item: "Copywriting", description: "Product page copy", qty: 4, rate: 120, taxRate: TAX },
        ],
        totals: { amount: "sum", tax: "sum", total: "sum" },
      },
      detailsSheet("Details", [
        ["Invoice No.", "INV-2026-0042"],
        ["Invoice date", "2026-03-14"],
        ["Due date", "2026-04-13"],
        ["From", "Kestrel Studios"],
        ["Bill to", "Orion Supplies Ltd, attn. A. Sharma"],
        ["Payment terms", "Net 30"],
        ["Notes", "Thank you for your business."],
      ]),
    ],
  },
  {
    id: "quotation",
    name: "Quotation",
    description: "Sales quote with unit prices, per-line discounts and totals, plus a details sheet for validity and terms.",
    category: "sales",
    keywords: ["quote", "quotation", "estimate", "proposal", "discount"],
    sheets: [
      {
        name: "Quotation",
        columns: [
          c("Item", "item", "text", { width: 22 }),
          c("Description", "description", "text", { width: 36 }),
          c("Qty", "qty", "number"),
          c("Unit Price", "unitPrice", "currency"),
          c("Discount", "discount", "percent"),
          c("Line Total", "lineTotal", "currency", { formula: "=ROUND(qty*unitPrice*(1-discount),2)" }),
        ],
        rows: [
          { item: "Office chair", description: "Ergonomic mesh chair, adjustable arms", qty: 10, unitPrice: 189, discount: 0.1 },
          { item: "Standing desk", description: "Electric sit-stand desk 140 cm", qty: 6, unitPrice: 420, discount: 0.05 },
          { item: "Monitor arm", description: "Dual monitor gas-spring arm", qty: 12, unitPrice: 75, discount: 0 },
          { item: "Cable tray", description: "Under-desk cable management tray", qty: 12, unitPrice: 18.5, discount: 0 },
          { item: "Delivery", description: "Delivery and assembly", qty: 1, unitPrice: 250, discount: 0 },
        ],
        totals: { qty: "sum", lineTotal: "sum" },
      },
      detailsSheet("Details", [
        ["Quote No.", "QT-2026-0117"],
        ["Date", "2026-02-09"],
        ["Valid until", "2026-03-11"],
        ["Prepared for", "Meridian Foods, attn. M. Chen"],
        ["Prepared by", "L. Okafor, Atlas Hardware"],
        ["Terms", "50% deposit on acceptance, balance on delivery"],
      ]),
    ],
  },
  {
    id: "purchase-order",
    name: "Purchase Order",
    description: "Purchase order lines with supplier, unit cost, amount and a received-vs-pending tracker.",
    category: "inventory",
    keywords: ["purchase order", "PO", "procurement", "supplier", "receiving"],
    sheets: [
      {
        name: "Purchase Order",
        columns: [
          c("PO No.", "poNo", "text", { width: 14 }),
          c("SKU", "sku", "text", { width: 12 }),
          c("Item", "item", "text", { width: 28 }),
          c("Supplier", "supplier", "text", { width: 22 }),
          c("Order Date", "orderDate", "date"),
          c("Qty", "qty", "number"),
          c("Unit Cost", "unitCost", "currency"),
          c("Amount", "amount", "currency", { formula: "=qty*unitCost" }),
          c("Received", "received", "number"),
          c("Pending", "pending", "number", { formula: "=qty-received" }),
        ],
        rows: [
          { poNo: "PO-2026-031", sku: "PK-0001", item: "Kraft shipping boxes (M)", supplier: "Bluefin Packaging", orderDate: "2026-01-12", qty: 500, unitCost: 0.85, received: 500 },
          { poNo: "PO-2026-031", sku: "PK-0002", item: "Bubble wrap roll 50 m", supplier: "Bluefin Packaging", orderDate: "2026-01-12", qty: 40, unitCost: 12.4, received: 40 },
          { poNo: "PO-2026-032", sku: "EL-0210", item: "USB-C charging cable 1 m", supplier: "Orion Supplies Ltd", orderDate: "2026-01-15", qty: 300, unitCost: 2.15, received: 180 },
          { poNo: "PO-2026-032", sku: "EL-0214", item: "Wireless mouse", supplier: "Orion Supplies Ltd", orderDate: "2026-01-15", qty: 120, unitCost: 9.9, received: 0 },
          { poNo: "PO-2026-033", sku: "ST-0044", item: "A4 copy paper (box of 5)", supplier: "Summit Stationery", orderDate: "2026-01-20", qty: 60, unitCost: 21, received: 60 },
          { poNo: "PO-2026-033", sku: "ST-0051", item: "Ballpoint pens (box of 50)", supplier: "Summit Stationery", orderDate: "2026-01-20", qty: 25, unitCost: 8.75, received: 10 },
        ],
        totals: { qty: "sum", amount: "sum", received: "sum", pending: "sum" },
      },
    ],
  },
  {
    id: "inventory",
    name: "Inventory",
    description: "Stock register with on-hand quantity, reorder level, unit cost, stock value and an automatic reorder flag.",
    category: "inventory",
    keywords: ["inventory", "stock", "warehouse", "reorder", "sku"],
    sheets: [
      {
        name: "Stock",
        columns: [
          c("SKU", "sku", "text", { width: 12 }),
          c("Item", "item", "text", { width: 30 }),
          c("Category", "category", "text", { width: 16 }),
          c("Unit", "unit", "text", { width: 8 }),
          c("In Stock", "inStock", "number"),
          c("Reorder Level", "reorderLevel", "number", { width: 14 }),
          c("Unit Cost", "unitCost", "currency"),
          c("Stock Value", "stockValue", "currency", { formula: "=inStock*unitCost" }),
          c("Reorder?", "reorder", "text", { width: 10, formula: '=IF(inStock<=reorderLevel,"YES","")' }),
        ],
        rows: [
          { sku: "EL-0210", item: "USB-C charging cable 1 m", category: "Electronics", unit: "pc", inStock: 412, reorderLevel: 150, unitCost: 2.15 },
          { sku: "EL-0214", item: "Wireless mouse", category: "Electronics", unit: "pc", inStock: 38, reorderLevel: 50, unitCost: 9.9 },
          { sku: "EL-0301", item: "27-inch monitor", category: "Electronics", unit: "pc", inStock: 14, reorderLevel: 10, unitCost: 165 },
          { sku: "ST-0044", item: "A4 copy paper (box of 5)", category: "Stationery", unit: "box", inStock: 92, reorderLevel: 40, unitCost: 21 },
          { sku: "ST-0051", item: "Ballpoint pens (box of 50)", category: "Stationery", unit: "box", inStock: 12, reorderLevel: 20, unitCost: 8.75 },
          { sku: "PK-0001", item: "Kraft shipping boxes (M)", category: "Packaging", unit: "pc", inStock: 1250, reorderLevel: 500, unitCost: 0.85 },
          { sku: "FN-0020", item: "Office chair", category: "Furniture", unit: "pc", inStock: 6, reorderLevel: 8, unitCost: 145 },
        ],
        totals: { inStock: "sum", stockValue: "sum" },
      },
    ],
  },
  {
    id: "price-list",
    name: "Price List",
    description: "Product price list that derives the selling price from cost and markup and shows the resulting margin.",
    category: "sales",
    keywords: ["price list", "pricing", "markup", "margin", "catalog"],
    sheets: [
      {
        name: "Prices",
        columns: [
          c("SKU", "sku", "text", { width: 12 }),
          c("Product", "product", "text", { width: 30 }),
          c("Category", "category", "text", { width: 16 }),
          c("Cost", "cost", "currency"),
          c("Markup", "markup", "percent"),
          c("Price", "price", "currency", { formula: "=ROUND(cost*(1+markup),2)" }),
          c("Margin", "margin", "percent", { formula: "=IF(price=0,0,(price-cost)/price)" }),
        ],
        rows: [
          { sku: "CF-1001", product: "Espresso beans 1 kg", category: "Coffee", cost: 14.2, markup: 0.6 },
          { sku: "CF-1002", product: "Filter blend 500 g", category: "Coffee", cost: 6.8, markup: 0.65 },
          { sku: "TE-2001", product: "Green tea (100 bags)", category: "Tea", cost: 4.5, markup: 0.8 },
          { sku: "TE-2004", product: "Chai spice mix 250 g", category: "Tea", cost: 3.1, markup: 0.9 },
          { sku: "AC-3001", product: "Ceramic mug 350 ml", category: "Accessories", cost: 2.4, markup: 1.5 },
          { sku: "AC-3005", product: "Pour-over kettle", category: "Accessories", cost: 22, markup: 0.55 },
        ],
        totals: { margin: "average" },
      },
    ],
  },
  {
    id: "customers",
    name: "Customers",
    description: "Customer master list with contact details, order count, lifetime value and average order value.",
    category: "sales",
    keywords: ["customers", "crm", "contacts", "lifetime value"],
    sheets: [
      {
        name: "Customers",
        columns: [
          c("Customer ID", "customerId", "text", { width: 12 }),
          c("Name", "name", "text", { width: 18 }),
          c("Company", "company", "text", { width: 24 }),
          c("Email", "email", "text", { width: 28 }),
          c("Phone", "phone", "text", { width: 16 }),
          c("Country", "country", "text", { width: 14 }),
          c("Customer Since", "since", "date", { width: 14 }),
          c("Orders", "orders", "number"),
          c("Lifetime Value", "lifetimeValue", "currency", { width: 15 }),
          c("Avg Order", "avgOrder", "currency", { formula: "=IF(orders=0,0,ROUND(lifetimeValue/orders,2))" }),
        ],
        rows: [
          { customerId: "C-1001", name: "A. Sharma", company: "Orion Supplies Ltd", email: "a.sharma@example.com", phone: "+00 555 0101", country: "India", since: "2024-05-02", orders: 14, lifetimeValue: 8460 },
          { customerId: "C-1002", name: "M. Chen", company: "Meridian Foods", email: "m.chen@example.com", phone: "+00 555 0102", country: "Singapore", since: "2024-09-18", orders: 6, lifetimeValue: 2310.5 },
          { customerId: "C-1003", name: "L. Okafor", company: "Atlas Hardware", email: "l.okafor@example.com", phone: "+00 555 0103", country: "Nigeria", since: "2025-01-27", orders: 22, lifetimeValue: 15980 },
          { customerId: "C-1004", name: "S. Novak", company: "Bluefin Logistics", email: "s.novak@example.com", phone: "+00 555 0104", country: "Czechia", since: "2025-06-11", orders: 3, lifetimeValue: 640 },
          { customerId: "C-1005", name: "R. Tanaka", company: "Summit Retail Co", email: "r.tanaka@example.com", phone: "+00 555 0105", country: "Japan", since: "2025-11-30", orders: 9, lifetimeValue: 4125.75 },
          { customerId: "C-1006", name: "E. Müller", company: "Kestrel Studios", email: "e.mueller@example.com", phone: "+00 555 0106", country: "Germany", since: "2026-01-08", orders: 1, lifetimeValue: 380 },
        ],
        totals: { customerId: "count", orders: "sum", lifetimeValue: "sum" },
      },
    ],
  },
  {
    id: "orders",
    name: "Orders",
    description: "Order log with quantity, unit price, shipping and computed order total, plus fulfilment status.",
    category: "sales",
    keywords: ["orders", "sales", "fulfilment", "shipping"],
    sheets: [
      {
        name: "Orders",
        columns: [
          c("Order ID", "orderId", "text", { width: 12 }),
          c("Date", "date", "date"),
          c("Customer", "customer", "text", { width: 18 }),
          c("Item", "item", "text", { width: 28 }),
          c("Qty", "qty", "number"),
          c("Unit Price", "unitPrice", "currency"),
          c("Shipping", "shipping", "currency"),
          c("Total", "total", "currency", { formula: "=qty*unitPrice+shipping" }),
          c("Status", "status", "text", { width: 12 }),
        ],
        rows: [
          { orderId: "ORD-5001", date: "2026-04-01", customer: "A. Sharma", item: "Espresso beans 1 kg", qty: 3, unitPrice: 22.7, shipping: 5, status: "Shipped" },
          { orderId: "ORD-5002", date: "2026-04-01", customer: "M. Chen", item: "Pour-over kettle", qty: 1, unitPrice: 34.1, shipping: 7.5, status: "Delivered" },
          { orderId: "ORD-5003", date: "2026-04-02", customer: "L. Okafor", item: "Ceramic mug 350 ml", qty: 12, unitPrice: 6, shipping: 0, status: "Processing" },
          { orderId: "ORD-5004", date: "2026-04-03", customer: "S. Novak", item: "Green tea (100 bags)", qty: 4, unitPrice: 8.1, shipping: 5, status: "Delivered" },
          { orderId: "ORD-5005", date: "2026-04-03", customer: "R. Tanaka", item: "Filter blend 500 g", qty: 6, unitPrice: 11.2, shipping: 5, status: "Shipped" },
          { orderId: "ORD-5006", date: "2026-04-04", customer: "J. Silva", item: "Chai spice mix 250 g", qty: 2, unitPrice: 5.9, shipping: 4, status: "Cancelled" },
        ],
        totals: { orderId: "count", qty: "sum", shipping: "sum", total: "sum" },
      },
    ],
  },
  {
    id: "expenses",
    name: "Expenses",
    description: "Expense tracker with category, tax on each claim, total and a reimbursable flag.",
    category: "finance",
    keywords: ["expenses", "expense report", "reimbursement", "spending"],
    sheets: [
      {
        name: "Expenses",
        columns: [
          c("Date", "date", "date"),
          c("Category", "category", "text", { width: 14 }),
          c("Description", "description", "text", { width: 32 }),
          c("Paid By", "paidBy", "text", { width: 14 }),
          c("Amount", "amount", "currency"),
          c("Tax Rate", "taxRate", "percent"),
          c("Tax", "tax", "currency", { formula: "=ROUND(amount*taxRate,2)" }),
          c("Total", "total", "currency", { formula: "=amount+tax" }),
          c("Reimbursable", "reimbursable", "boolean"),
        ],
        rows: [
          { date: "2026-05-04", category: "Travel", description: "Train ticket, client visit", paidBy: "A. Sharma", amount: 64, taxRate: 0.1, reimbursable: true },
          { date: "2026-05-05", category: "Meals", description: "Team lunch", paidBy: "M. Chen", amount: 128.5, taxRate: 0.1, reimbursable: true },
          { date: "2026-05-07", category: "Software", description: "Design tool subscription (monthly)", paidBy: "Company card", amount: 45, taxRate: 0.2, reimbursable: false },
          { date: "2026-05-11", category: "Office", description: "Printer toner", paidBy: "L. Okafor", amount: 89.9, taxRate: 0.2, reimbursable: true },
          { date: "2026-05-15", category: "Travel", description: "Taxi to airport", paidBy: "S. Novak", amount: 32, taxRate: 0.1, reimbursable: true },
          { date: "2026-05-19", category: "Marketing", description: "Trade fair booth deposit", paidBy: "Company card", amount: 600, taxRate: 0.2, reimbursable: false },
        ],
        totals: { amount: "sum", tax: "sum", total: "sum" },
      },
    ],
  },
  {
    id: "payroll",
    name: "Payroll",
    description: "Monthly payroll with basic pay, allowances, overtime, gross, deductions and net pay per employee.",
    category: "hr",
    keywords: ["payroll", "salary", "wages", "overtime", "deductions", "net pay"],
    sheets: [
      {
        name: "Payroll",
        columns: [
          c("Employee ID", "employeeId", "text", { width: 12 }),
          c("Name", "name", "text", { width: 18 }),
          c("Department", "department", "text", { width: 16 }),
          c("Basic", "basic", "currency"),
          c("Allowances", "allowances", "currency"),
          c("OT Hours", "overtimeHours", "number"),
          c("OT Rate", "overtimeRate", "currency"),
          c("Overtime", "overtime", "currency", { formula: "=ROUND(overtimeHours*overtimeRate,2)" }),
          c("Gross", "gross", "currency", { formula: "=basic+allowances+overtime" }),
          c("Deduction Rate", "deductionRate", "percent", { width: 14 }),
          c("Deductions", "deductions", "currency", { formula: "=ROUND(gross*deductionRate,2)" }),
          c("Net Pay", "net", "currency", { formula: "=gross-deductions" }),
        ],
        rows: [
          { employeeId: "E-101", name: "A. Sharma", department: "Engineering", basic: 4200, allowances: 350, overtimeHours: 6, overtimeRate: 32, deductionRate: 0.12 },
          { employeeId: "E-102", name: "M. Chen", department: "Design", basic: 3800, allowances: 300, overtimeHours: 0, overtimeRate: 29, deductionRate: 0.12 },
          { employeeId: "E-103", name: "L. Okafor", department: "Sales", basic: 3100, allowances: 600, overtimeHours: 10, overtimeRate: 24, deductionRate: 0.11 },
          { employeeId: "E-104", name: "S. Novak", department: "Operations", basic: 2900, allowances: 250, overtimeHours: 14, overtimeRate: 22, deductionRate: 0.11 },
          { employeeId: "E-105", name: "R. Tanaka", department: "Engineering", basic: 4600, allowances: 350, overtimeHours: 2, overtimeRate: 35, deductionRate: 0.13 },
          { employeeId: "E-106", name: "P. Dubois", department: "Finance", basic: 3500, allowances: 300, overtimeHours: 0, overtimeRate: 27, deductionRate: 0.12 },
        ],
        totals: { basic: "sum", allowances: "sum", overtime: "sum", gross: "sum", deductions: "sum", net: "sum" },
      },
    ],
  },
  {
    id: "cashbook",
    name: "Cashbook",
    description: "Simple cashbook with inflows, outflows, net movement and a running balance carried down every row.",
    category: "finance",
    keywords: ["cashbook", "cash flow", "ledger", "running balance", "bookkeeping"],
    sheets: [
      {
        name: "Cashbook",
        columns: [
          c("Date", "date", "date"),
          c("Reference", "reference", "text", { width: 14 }),
          c("Description", "description", "text", { width: 32 }),
          c("Inflow", "inflow", "currency"),
          c("Outflow", "outflow", "currency"),
          c("Net", "net", "currency", { formula: "=inflow-outflow" }),
          c("Balance", "balance", "currency", { excel: "{col:balance}{prev}+{col:net}{row}" }),
        ],
        rows: [
          { date: "2026-06-01", reference: "OB", description: "Opening balance", inflow: 25000, outflow: 0, balance: 25000 },
          { date: "2026-06-03", reference: "INV-0042", description: "Customer payment — Orion Supplies Ltd", inflow: 3105, outflow: 0, balance: 28105 },
          { date: "2026-06-05", reference: "PAY-0611", description: "Office rent, June", inflow: 0, outflow: 1800, balance: 26305 },
          { date: "2026-06-09", reference: "PAY-0612", description: "Supplier — Bluefin Packaging", inflow: 0, outflow: 921, balance: 25384 },
          { date: "2026-06-14", reference: "INV-0045", description: "Customer payment — Meridian Foods", inflow: 1240.5, outflow: 0, balance: 26624.5 },
          { date: "2026-06-20", reference: "PAY-0613", description: "Utilities", inflow: 0, outflow: 265.4, balance: 26359.1 },
          { date: "2026-06-28", reference: "PAY-0614", description: "Payroll, June", inflow: 0, outflow: 21450, balance: 4909.1 },
        ],
        totals: { inflow: "sum", outflow: "sum", net: "sum" },
      },
    ],
  },
  {
    id: "attendance",
    name: "Attendance",
    description: "Monthly attendance register with working days, present, leave, computed absences and attendance rate.",
    category: "hr",
    keywords: ["attendance", "hr", "leave", "absence", "register"],
    sheets: [
      {
        name: "Attendance",
        columns: [
          c("Employee ID", "employeeId", "text", { width: 12 }),
          c("Name", "name", "text", { width: 18 }),
          c("Department", "department", "text", { width: 16 }),
          c("Working Days", "workingDays", "number", { width: 13 }),
          c("Present", "present", "number"),
          c("Leave", "leave", "number"),
          c("Absent", "absent", "number", { formula: "=workingDays-present-leave" }),
          c("Attendance", "attendanceRate", "percent", { width: 12, formula: "=IF(workingDays=0,0,present/workingDays)" }),
        ],
        rows: [
          { employeeId: "E-101", name: "A. Sharma", department: "Engineering", workingDays: 22, present: 21, leave: 1 },
          { employeeId: "E-102", name: "M. Chen", department: "Design", workingDays: 22, present: 22, leave: 0 },
          { employeeId: "E-103", name: "L. Okafor", department: "Sales", workingDays: 22, present: 18, leave: 3 },
          { employeeId: "E-104", name: "S. Novak", department: "Operations", workingDays: 22, present: 20, leave: 0 },
          { employeeId: "E-105", name: "R. Tanaka", department: "Engineering", workingDays: 22, present: 19, leave: 2 },
          { employeeId: "E-106", name: "P. Dubois", department: "Finance", workingDays: 22, present: 22, leave: 0 },
          { employeeId: "E-107", name: "N. Haddad", department: "Support", workingDays: 22, present: 17, leave: 4 },
        ],
        totals: { present: "sum", leave: "sum", absent: "sum", attendanceRate: "average" },
      },
    ],
  },
  {
    id: "budget",
    name: "Budget",
    description: "Planned-vs-actual budget by category with variance, utilisation and an over-budget status flag.",
    category: "personal",
    keywords: ["budget", "planned vs actual", "variance", "household", "department budget"],
    sheets: [
      {
        name: "Budget",
        columns: [
          c("Category", "category", "text", { width: 16 }),
          c("Item", "item", "text", { width: 28 }),
          c("Planned", "planned", "currency"),
          c("Actual", "actual", "currency"),
          c("Variance", "variance", "currency", { formula: "=planned-actual" }),
          c("Used", "used", "percent", { formula: "=IF(planned=0,0,actual/planned)" }),
          c("Status", "status", "text", { width: 10, formula: '=IF(actual>planned,"Over","OK")' }),
        ],
        rows: [
          { category: "Housing", item: "Rent", planned: 1500, actual: 1500 },
          { category: "Utilities", item: "Electricity, water, internet", planned: 220, actual: 241.3 },
          { category: "Food", item: "Groceries", planned: 600, actual: 548.2 },
          { category: "Transport", item: "Fuel and transit pass", planned: 180, actual: 205 },
          { category: "Health", item: "Insurance and pharmacy", planned: 150, actual: 130 },
          { category: "Leisure", item: "Dining out and streaming", planned: 200, actual: 262.75 },
          { category: "Savings", item: "Emergency fund", planned: 400, actual: 400 },
        ],
        totals: { planned: "sum", actual: "sum", variance: "sum" },
      },
    ],
  },
  {
    id: "sales-register",
    name: "Sales Register",
    description: "Tax-ready sales register: taxable value, tax rate, tax amount and invoice total per sale with payment mode.",
    category: "finance",
    keywords: ["sales register", "tax register", "vat", "gst", "sales tax", "invoice log"],
    sheets: [
      {
        name: "Sales Register",
        columns: [
          c("Date", "date", "date"),
          c("Invoice No.", "invoiceNo", "text", { width: 14 }),
          c("Customer", "customer", "text", { width: 24 }),
          c("Taxable", "taxable", "currency"),
          c("Tax Rate", "taxRate", "percent"),
          c("Tax", "tax", "currency", { formula: "=ROUND(taxable*taxRate,2)" }),
          c("Total", "total", "currency", { formula: "=taxable+tax" }),
          c("Payment Mode", "paymentMode", "text", { width: 14 }),
        ],
        rows: [
          { date: "2026-07-01", invoiceNo: "INV-0101", customer: "Orion Supplies Ltd", taxable: 2700, taxRate: 0.13, paymentMode: "Bank transfer" },
          { date: "2026-07-02", invoiceNo: "INV-0102", customer: "Meridian Foods", taxable: 1240.5, taxRate: 0.13, paymentMode: "Card" },
          { date: "2026-07-04", invoiceNo: "INV-0103", customer: "Atlas Hardware", taxable: 5600, taxRate: 0.13, paymentMode: "Bank transfer" },
          { date: "2026-07-08", invoiceNo: "INV-0104", customer: "Summit Retail Co", taxable: 890, taxRate: 0.05, paymentMode: "Cash" },
          { date: "2026-07-11", invoiceNo: "INV-0105", customer: "Bluefin Logistics", taxable: 3150.25, taxRate: 0.13, paymentMode: "Card" },
          { date: "2026-07-15", invoiceNo: "INV-0106", customer: "Kestrel Studios", taxable: 460, taxRate: 0, paymentMode: "Bank transfer" },
        ],
        totals: { invoiceNo: "count", taxable: "sum", tax: "sum", total: "sum" },
      },
    ],
  },
  {
    id: "timesheet",
    name: "Timesheet",
    description: "Hourly timesheet by project and task with billable flag, hourly rate and billed amount.",
    category: "projects",
    keywords: ["timesheet", "hours", "billable", "time tracking", "consulting"],
    sheets: [
      {
        name: "Timesheet",
        columns: [
          c("Date", "date", "date"),
          c("Employee", "employee", "text", { width: 18 }),
          c("Project", "project", "text", { width: 22 }),
          c("Task", "task", "text", { width: 30 }),
          c("Hours", "hours", "number"),
          c("Billable", "billable", "boolean"),
          c("Rate", "rate", "currency"),
          c("Amount", "amount", "currency", { formula: "=IF(billable,ROUND(hours*rate,2),0)" }),
        ],
        rows: [
          { date: "2026-08-03", employee: "A. Sharma", project: "Orion web platform", task: "API integration", hours: 6.5, billable: true, rate: 85 },
          { date: "2026-08-03", employee: "M. Chen", project: "Orion web platform", task: "Dashboard UI", hours: 7, billable: true, rate: 80 },
          { date: "2026-08-04", employee: "A. Sharma", project: "Internal", task: "Team retrospective", hours: 1.5, billable: false, rate: 85 },
          { date: "2026-08-04", employee: "L. Okafor", project: "Meridian mobile app", task: "Client workshop", hours: 3, billable: true, rate: 95 },
          { date: "2026-08-05", employee: "J. Silva", project: "Meridian mobile app", task: "Bug fixing, release 1.2", hours: 8, billable: true, rate: 75 },
          { date: "2026-08-05", employee: "M. Chen", project: "Internal", task: "Design system upkeep", hours: 2, billable: false, rate: 80 },
        ],
        totals: { hours: "sum", amount: "sum" },
      },
    ],
  },
  {
    id: "project-tracker",
    name: "Project Tracker",
    description: "Task tracker with owner, priority, dates, progress, estimated vs spent hours, remaining effort and status.",
    category: "projects",
    keywords: ["project", "tasks", "tracker", "progress", "milestones", "kanban"],
    sheets: [
      {
        name: "Tasks",
        columns: [
          c("Task ID", "taskId", "text", { width: 10 }),
          c("Task", "task", "text", { width: 34 }),
          c("Owner", "owner", "text", { width: 16 }),
          c("Priority", "priority", "text", { width: 10 }),
          c("Start", "start", "date"),
          c("Due", "due", "date"),
          c("Progress", "progress", "percent"),
          c("Est. Hours", "estimateHours", "number", { width: 11 }),
          c("Spent Hours", "spentHours", "number", { width: 12 }),
          c("Remaining", "remaining", "number", { formula: "=MAX(estimateHours-spentHours,0)" }),
          c("Status", "status", "text", { width: 12, formula: '=IF(progress>=1,"Done",IF(spentHours>estimateHours,"Over budget","On track"))' }),
        ],
        rows: [
          { taskId: "T-01", task: "Requirements workshop", owner: "L. Okafor", priority: "High", start: "2026-09-01", due: "2026-09-03", progress: 1, estimateHours: 12, spentHours: 10 },
          { taskId: "T-02", task: "Data model and API design", owner: "A. Sharma", priority: "High", start: "2026-09-04", due: "2026-09-10", progress: 0.8, estimateHours: 24, spentHours: 21 },
          { taskId: "T-03", task: "Dashboard UI", owner: "M. Chen", priority: "Medium", start: "2026-09-08", due: "2026-09-19", progress: 0.45, estimateHours: 40, spentHours: 26 },
          { taskId: "T-04", task: "Payment gateway integration", owner: "J. Silva", priority: "High", start: "2026-09-11", due: "2026-09-18", progress: 0.3, estimateHours: 16, spentHours: 19 },
          { taskId: "T-05", task: "QA and regression pass", owner: "K. Andersson", priority: "Medium", start: "2026-09-22", due: "2026-09-26", progress: 0, estimateHours: 20, spentHours: 0 },
          { taskId: "T-06", task: "Launch checklist", owner: "L. Okafor", priority: "Low", start: "2026-09-29", due: "2026-09-30", progress: 0, estimateHours: 6, spentHours: 0 },
        ],
        totals: { estimateHours: "sum", spentHours: "sum", remaining: "sum", progress: "average" },
      },
    ],
  },
  {
    id: "loan-schedule",
    name: "Loan Schedule",
    description: "EMI amortisation schedule: opening balance, fixed payment, interest, principal and closing balance per period, chained row to row.",
    category: "finance",
    keywords: ["loan", "emi", "amortisation", "amortization", "mortgage", "repayment schedule", "interest"],
    sheets: [
      {
        name: "Schedule",
        columns: [
          c("Period", "period", "number", { width: 8, numFmt: "0", excel: "{col:period}{prev}+1" }),
          c("Annual Rate", "rate", "percent", { width: 12, numFmt: "0.00%", excel: "{col:rate}{prev}" }),
          c("Opening", "opening", "currency", { excel: "{col:closing}{prev}" }),
          c("Payment", "payment", "currency", { excel: "MIN({col:payment}{prev},{col:opening}{row}+{col:interest}{row})" }),
          c("Interest", "interest", "currency", { formula: "=ROUND(opening*rate/12,2)" }),
          c("Principal", "principal", "currency", { formula: "=payment-interest" }),
          c("Closing", "closing", "currency", { formula: "=opening-principal" }),
        ],
        rows: amortise(120000, 0.09, 12),
        totals: { payment: "sum", interest: "sum", principal: "sum" },
      },
      detailsSheet("Loan", [
        ["Borrower", "Summit Retail Co"],
        ["Lender", "Bluefin Finance"],
        ["Principal", "120000"],
        ["Annual interest rate", "9%"],
        ["Term", "12 months"],
        ["First payment", "2026-01-31"],
        ["Note", "Edit Opening, Payment and Annual Rate on the first row of the Schedule sheet; every following row is chained by formula."],
      ]),
    ],
  },
  {
    id: "grade-book",
    name: "Grade Book",
    description: "Class grade book with marks per subject, total, percentage and a letter grade from an IF() chain.",
    category: "education",
    keywords: ["grade book", "gradebook", "marks", "school", "results", "report card"],
    sheets: [
      {
        name: "Grades",
        columns: [
          c("Student ID", "studentId", "text", { width: 12 }),
          c("Student", "student", "text", { width: 20 }),
          c("Maths", "maths", "number"),
          c("Science", "science", "number"),
          c("English", "english", "number"),
          c("History", "history", "number"),
          c("Total", "total", "number", { formula: "=maths+science+english+history" }),
          c("Percentage", "percentage", "percent", { width: 12, formula: "=total/400" }),
          c("Grade", "grade", "text", { width: 8, formula: '=IF(total=0,"",IF(percentage>=0.9,"A",IF(percentage>=0.8,"B",IF(percentage>=0.7,"C",IF(percentage>=0.6,"D","F")))))' }),
        ],
        rows: [
          { studentId: "S-2026-01", student: "A. Sharma", maths: 92, science: 88, english: 79, history: 85 },
          { studentId: "S-2026-02", student: "M. Chen", maths: 76, science: 81, english: 90, history: 72 },
          { studentId: "S-2026-03", student: "L. Okafor", maths: 64, science: 70, english: 68, history: 74 },
          { studentId: "S-2026-04", student: "S. Novak", maths: 95, science: 97, english: 91, history: 89 },
          { studentId: "S-2026-05", student: "R. Tanaka", maths: 58, science: 62, english: 71, history: 55 },
          { studentId: "S-2026-06", student: "E. Müller", maths: 83, science: 79, english: 85, history: 80 },
          { studentId: "S-2026-07", student: "N. Haddad", maths: 45, science: 52, english: 60, history: 49 },
        ],
        totals: { maths: "average", science: "average", english: "average", history: "average", total: "average", percentage: "average" },
      },
    ],
  },
];
