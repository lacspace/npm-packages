/**
 * lacspace-excel — CLI
 *
 * Hand-rolled argument parsing (no deps), colours only on a TTY, data to
 * stdout, messages to stderr, exit 1 on any error. `main(argv, io)` is
 * exported so tests can drive it with injected streams.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, realpathSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { serialize, type Format, type Row, type Table } from "@lacspace/convert";
import {
  convertData,
  inspectData,
  addFormulaColumns,
  parseFormulaAdd,
  validateFormulaAdds,
  dedupeRows,
  splitWorkbook,
  mergeTables,
  functionReference,
  formatFromPath,
  formatFromExtension,
  loadTables,
  reshapeTables,
  parseSheetRef,
  sheetNameFromPath,
  sanitizeSheetName,
  formatBytes,
  isTextFormat,
  FORMAT_EXTENSION,
  FormulaColumnError,
  type FormulaAdd,
  type InspectReport,
  type FunctionDoc,
} from "./commands";
import { listTemplates, getTemplate, buildTemplate, templateToTables } from "./templates";

/* ------------------------------ version ------------------------------ */

function readVersion(): string {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const candidate of [join(here, "..", "package.json"), join(here, "package.json")]) {
      try {
        const pkg = JSON.parse(readFileSync(candidate, "utf8")) as { name?: string; version?: string };
        if (pkg.name === "lacspace-excel" && pkg.version) return pkg.version;
      } catch { /* try next */ }
    }
  } catch { /* fall through */ }
  return "0.0.0";
}

export const VERSION: string = readVersion();

/* ------------------------------ io ------------------------------ */

export interface CliIO {
  /** Write to stdout (data). */
  out: (s: string) => void;
  /** Write to stderr (messages, errors). */
  err: (s: string) => void;
  /** Read all of stdin as bytes, or `null` when stdin is a TTY / unavailable. */
  readStdin: () => Uint8Array | null;
  /** Emit ANSI colours. */
  color: boolean;
  /** Current working directory for relative paths. */
  cwd: string;
}

function defaultIO(): CliIO {
  return {
    out: (s) => void process.stdout.write(s),
    err: (s) => void process.stderr.write(s),
    readStdin: () => {
      try {
        if (process.stdin.isTTY) return null;
        return new Uint8Array(readFileSync(0));
      } catch { return null; }
    },
    color: !process.env["NO_COLOR"] && process.stdout.isTTY === true,
    cwd: process.cwd(),
  };
}

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};
type Color = keyof typeof C;

class CliError extends Error {
  constructor(message: string, public readonly code = 1) { super(message); this.name = "CliError"; }
}

const fail = (msg: string): never => { throw new CliError(msg); };

/* ------------------------------ args ------------------------------ */

const FORMATS: readonly Format[] = ["json", "ndjson", "csv", "tsv", "xlsx", "yaml", "toml", "markdown", "html", "sql"];

export interface Args {
  positional: string[];
  out?: string;
  from?: Format;
  to?: Format;
  sheet?: string;
  columns?: string[];
  rename?: Record<string, string>;
  flatten: boolean;
  unflatten: boolean;
  noInfer: boolean;
  table?: string;
  ddl: boolean;
  pretty: boolean;
  bom: boolean;
  json: boolean;
  adds: string[];
  by?: string[];
  outDir?: string;
  noSample: boolean;
  blankRows?: number;
  currencyFormat?: string;
  help: boolean;
  version: boolean;
}

function asFormat(v: string, flag: string): Format {
  const f = formatFromExtension(v) ?? (v.toLowerCase() === "md" ? "markdown" : undefined);
  const norm = (FORMATS as readonly string[]).includes(v.toLowerCase()) ? (v.toLowerCase() as Format) : f;
  if (!norm) fail(`Unknown format "${v}" for ${flag} (${FORMATS.join("|")})`);
  return norm!;
}

function splitList(v: string): string[] {
  return v.split(",").map((s) => s.trim()).filter(Boolean);
}

function parseRename(v: string): Record<string, string> {
  const map: Record<string, string> = {};
  for (const pair of splitList(v)) {
    const eq = pair.indexOf("=");
    if (eq <= 0) fail(`Invalid --rename "${pair}" — expected old=new`);
    const from = pair.slice(0, eq).trim();
    const to = pair.slice(eq + 1).trim();
    if (!from || !to) fail(`Invalid --rename "${pair}" — expected old=new`);
    if (from === "__proto__" || to === "__proto__") fail(`Invalid --rename "${pair}"`);
    map[from] = to;
  }
  return map;
}

export function parseArgs(list: string[]): Args {
  const a: Args = {
    positional: [], flatten: false, unflatten: false, noInfer: false, ddl: false, pretty: false, bom: false,
    json: false, adds: [], noSample: false, help: false, version: false,
  };
  const args = [...list];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    const nextVal = (flag: string): string => {
      const v = args[++i];
      if (v === undefined) fail(`${flag} needs a value`);
      return v!;
    };
    if (arg === "-o" || arg === "--out" || arg === "--output") a.out = nextVal(arg);
    else if (arg === "--from") a.from = asFormat(nextVal(arg), "--from");
    else if (arg === "--to") a.to = asFormat(nextVal(arg), "--to");
    else if (arg === "--sheet") a.sheet = nextVal(arg);
    else if (arg === "--columns") a.columns = splitList(nextVal(arg));
    else if (arg === "--rename") a.rename = { ...(a.rename ?? {}), ...parseRename(nextVal(arg)) };
    else if (arg === "--flatten") a.flatten = true;
    else if (arg === "--unflatten") a.unflatten = true;
    else if (arg === "--no-infer") a.noInfer = true;
    else if (arg === "--table" || arg === "--table-name") a.table = nextVal(arg);
    else if (arg === "--ddl") a.ddl = true;
    else if (arg === "--pretty") a.pretty = true;
    else if (arg === "--bom") a.bom = true;
    else if (arg === "--json") a.json = true;
    else if (arg === "--add") a.adds.push(nextVal(arg));
    else if (arg === "--by") a.by = [...(a.by ?? []), ...splitList(nextVal(arg))];
    else if (arg === "--out-dir" || arg === "--outdir") a.outDir = nextVal(arg);
    else if (arg === "--no-sample") a.noSample = true;
    else if (arg === "--blank-rows") {
      const n = Number(nextVal(arg));
      if (!Number.isInteger(n) || n < 0) fail("--blank-rows needs a whole number ≥ 0");
      a.blankRows = n;
    }
    else if (arg === "--currency-format") a.currencyFormat = nextVal(arg);
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "-V" || arg === "--version") a.version = true;
    else if (arg === "-") a.positional.push(arg);
    else if (arg.startsWith("--") && arg.includes("=")) {
      const eq = arg.indexOf("=");
      args.splice(i + 1, 0, arg.slice(eq + 1));
      args[i] = arg.slice(0, eq);
      i--;
    }
    else if (arg.startsWith("-") && arg.length > 1) fail(`Unknown flag "${arg}" — see --help`);
    else a.positional.push(arg);
  }
  return a;
}

/* ------------------------------ help ------------------------------ */

function helpText(c: (k: Color, s: string) => string): string {
  return `
${c("bold", c("magenta", "◆ lacspace-excel"))} ${c("dim", "— convert anything ⇄ .xlsx, add formula columns, generate business templates")}

${c("bold", "Usage")}
  npx lacspace-excel <command> [input|-] [flags]
  cat data.csv | npx lacspace-excel <command> [flags]

${c("bold", "Commands")}
  ${c("cyan", "convert")}   <input|->  -o <out>       Convert between json · ndjson · csv · tsv · xlsx · yaml · toml · markdown · html · sql
  ${c("cyan", "inspect")}   <input|->                 Sheets, row counts, column types (nullable) and sample rows
  ${c("cyan", "formula")}   <input|-> --add k=<f>     Add computed columns (@lacspace/formula syntax, chainable)
  ${c("cyan", "template")}  list | <id> [-o file]     Generate a ready-to-fill workbook with live formulas
  ${c("cyan", "dedupe")}    <input|-> [--by a,b]      Drop duplicate rows (all columns, or the given keys; keeps first)
  ${c("cyan", "split")}     <book.xlsx> [--out-dir d] One file per sheet
  ${c("cyan", "merge")}     <file...> -o <book.xlsx>  One sheet per input file
  ${c("cyan", "functions")} [name]                    Formula function reference (grouped by category)

${c("bold", "Flags")}
  -o, --out <file>          Output file (required for xlsx). Format defaults from its extension
      --from <fmt>          Input format (defaults from the input extension, else sniffed)
      --to <fmt>            Output format (defaults from -o, else json)
      --sheet <name|index>  Pick one sheet / table
      --columns a,b,c       Keep only these columns, in this order
      --rename old=new,...  Rename columns
      --flatten             Nested objects → dotted columns (address.city)
      --unflatten           Dotted columns → nested objects
      --no-infer            Keep csv/tsv/markdown cells as text (no number/date coercion)
      --table <name>        Table / sheet name for nameless data (sql, toml)
      --ddl                 sql: emit CREATE TABLE before the INSERTs
      --pretty              Pretty-print json / html
      --bom                 csv / tsv: prefix a UTF-8 BOM (Excel-friendly)
      --add key=<formula>   formula: a computed column (repeatable, later adds see earlier keys)
      --by a,b              dedupe: key columns
      --out-dir <dir>       split: destination directory (default .)
      --no-sample           template: no sample rows
      --blank-rows <n>      template: extra pre-formatted empty rows (default 20)
      --currency-format <f> template: number format for currency columns (default #,##0.00)
      --json                Machine-readable output (inspect, template list, functions)
  -h, --help                Show this help
  -v, --version             Print the version

${c("bold", "Examples")}
  npx lacspace-excel convert orders.json -o orders.xlsx --flatten
  npx lacspace-excel convert report.xlsx --sheet Sales --to csv > sales.csv
  npx lacspace-excel inspect report.xlsx
  npx lacspace-excel formula orders.csv --add "amount=qty*rate" --add "tax=ROUND(amount*0.13,2)" -o priced.xlsx
  npx lacspace-excel template list
  npx lacspace-excel template invoice -o invoice.xlsx
  npx lacspace-excel dedupe leads.csv --by email -o clean.csv
  npx lacspace-excel split report.xlsx --out-dir sheets --to csv
  npx lacspace-excel merge jan.csv feb.csv mar.csv -o q1.xlsx
  npx lacspace-excel functions SUMIF
`;
}

/* ------------------------------ runtime ------------------------------ */

interface Ctx {
  io: CliIO;
  c: (k: Color, s: string) => string;
  a: Args;
}

interface Loaded {
  data: string | Uint8Array;
  from: Format | undefined;
  source: string;
}

function isXlsxBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 2 && bytes[0] === 0x50 && bytes[1] === 0x4b;
}

function decode(bytes: Uint8Array): string {
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return text;
}

function readInput(ctx: Ctx, source: string | undefined, from: Format | undefined, what = "input"): Loaded {
  if (source === undefined || source === "-") {
    const bytes = ctx.io.readStdin();
    if (bytes === null) fail(`No ${what} given. Pass a file or pipe data via stdin.`);
    if (bytes!.length === 0) fail("stdin is empty");
    const fmt = from ?? (isXlsxBytes(bytes!) ? "xlsx" : undefined);
    return { data: fmt === "xlsx" ? bytes! : decode(bytes!), from: fmt, source: "stdin" };
  }
  const path = resolve(ctx.io.cwd, source);
  let bytes: Uint8Array;
  try {
    const st = statSync(path);
    if (!st.isFile()) fail(`Not a file: ${source}`);
    bytes = new Uint8Array(readFileSync(path));
  } catch (e) {
    if (e instanceof CliError) throw e;
    fail(`Cannot read "${source}"`);
  }
  const fmt = from ?? formatFromPath(source) ?? (isXlsxBytes(bytes!) ? "xlsx" : undefined);
  return { data: fmt === "xlsx" ? bytes! : decode(bytes!), from: fmt, source };
}

function writeOutput(ctx: Ctx, output: string | Uint8Array, outPath: string | undefined): { where: string; bytes: number } {
  if (outPath === undefined) {
    if (typeof output !== "string") fail("xlsx output needs -o <file.xlsx> (binary data is not written to stdout)");
    const text = output as string;
    ctx.io.out(text.endsWith("\n") || text === "" ? text : text + "\n");
    return { where: "stdout", bytes: new TextEncoder().encode(text).length };
  }
  const path = resolve(ctx.io.cwd, outPath);
  try { mkdirSync(dirname(path), { recursive: true }); } catch { /* ignore */ }
  try {
    if (typeof output === "string") writeFileSync(path, output, "utf8");
    else writeFileSync(path, output);
  } catch (e) {
    fail(`Cannot write "${outPath}": ${e instanceof Error ? e.message : String(e)}`);
  }
  return { where: outPath, bytes: typeof output === "string" ? new TextEncoder().encode(output).length : output.length };
}

function summary(ctx: Ctx, rows: number, where: string, bytes: number, format: Format): void {
  const noun = rows === 1 ? "row" : "rows";
  const tail = where === "stdout" ? `${format}, ${formatBytes(bytes)}` : formatBytes(bytes);
  ctx.io.err(`${ctx.c("green", "✓")} ${rows} ${noun} → ${where} (${tail})\n`);
}

function resolveTo(a: Args, fallback: Format): Format {
  return a.to ?? (a.out ? formatFromPath(a.out) : undefined) ?? fallback;
}

/* ------------------------------ commands ------------------------------ */

async function cmdConvert(ctx: Ctx): Promise<number> {
  const { a } = ctx;
  const loaded = readInput(ctx, a.positional[1], a.from);
  const to = resolveTo(a, "json");
  if (to === "xlsx" && !a.out) fail("convert --to xlsx needs -o <file.xlsx>");
  const opts: Parameters<typeof convertData>[1] = { to };
  if (loaded.from !== undefined) opts.from = loaded.from;
  const sheet = parseSheetRef(a.sheet);
  if (sheet !== undefined) opts.sheet = sheet;
  if (a.columns) opts.columns = a.columns;
  if (a.rename) opts.rename = a.rename;
  if (a.flatten) opts.flatten = true;
  if (a.unflatten) opts.unflatten = true;
  if (a.noInfer) opts.infer = false;
  if (a.table) opts.tableName = a.table;
  if (a.ddl) opts.ddl = true;
  if (a.pretty) opts.pretty = true;
  if (a.bom) opts.bom = true;
  const result = await convertData(loaded.data, opts);
  const w = writeOutput(ctx, result.output, a.out);
  summary(ctx, result.rows, w.where, w.bytes, to);
  return 0;
}

function typeLabel(t: string): string {
  return t.padEnd(8);
}

function renderInspect(ctx: Ctx, report: InspectReport, mdSamples: string[]): string {
  const { c } = ctx;
  const lines: string[] = [];
  report.tables.forEach((t, i) => {
    const name = t.name ?? `table ${i + 1}`;
    lines.push(`${c("bold", c("magenta", "◆ " + name))} ${c("dim", `· ${t.rows} row${t.rows === 1 ? "" : "s"} × ${t.columns.length} column${t.columns.length === 1 ? "" : "s"}`)}`);
    const width = Math.max(4, ...t.columns.map((col) => col.name.length));
    for (const col of t.columns) {
      lines.push(`  ${c("cyan", col.name.padEnd(width))}  ${c("yellow", typeLabel(col.type))}${col.nullable ? c("dim", "(nullable)") : ""}`);
    }
    if (t.sample.length > 0) {
      lines.push(`  ${c("dim", "sample:")}`);
      for (const l of (mdSamples[i] ?? "").trimEnd().split("\n")) lines.push("  " + l);
    }
    lines.push("");
  });
  return lines.join("\n");
}

async function cmdInspect(ctx: Ctx): Promise<number> {
  const { a } = ctx;
  const loaded = readInput(ctx, a.positional[1], a.from);
  const opts: Parameters<typeof inspectData>[2] = {};
  if (a.noInfer) opts.infer = false;
  const sheet = parseSheetRef(a.sheet);
  if (sheet !== undefined) opts.sheet = sheet;
  const report = await inspectData(loaded.data, loaded.from, opts);
  if (a.json) {
    const plain = { format: report.format, tables: report.tables.map((t) => ({ ...t, sample: JSON.parse(JSON.stringify(t.sample)) as Row[] })) };
    ctx.io.out(JSON.stringify(plain, null, 2) + "\n");
    return 0;
  }
  const md: string[] = [];
  for (const t of report.tables) md.push(t.sample.length ? String(await serialize([{ rows: t.sample }], "markdown")) : "");
  ctx.io.out(renderInspect(ctx, report, md));
  return 0;
}

async function cmdFormula(ctx: Ctx): Promise<number> {
  const { a } = ctx;
  if (a.adds.length === 0) fail('formula needs at least one --add "key=<formula>"');
  const adds: FormulaAdd[] = a.adds.map(parseFormulaAdd);
  try { validateFormulaAdds(adds); } catch (e) {
    if (e instanceof FormulaColumnError) fail(e.message);
    throw e;
  }
  const loaded = readInput(ctx, a.positional[1], a.from);
  const inputFmt = loaded.from ?? "json";
  const to = resolveTo(a, isTextFormat(inputFmt) ? inputFmt : "json");
  if (to === "xlsx" && !a.out) fail("formula --to xlsx needs -o <file.xlsx>");
  const loadOpts: { infer?: boolean } = {};
  if (a.noInfer) loadOpts.infer = false;
  const { tables: parsed } = await loadTables(loaded.data, loaded.from, loadOpts);
  const sheet = parseSheetRef(a.sheet);
  const tables = reshapeTables(parsed, sheet !== undefined ? { sheet } : {});
  const computed: Table[] = tables.map((t) => ({ ...t, rows: addFormulaColumns(t.rows, adds) }));
  const serOpts: Parameters<typeof serialize>[2] = {};
  if (a.pretty) serOpts.pretty = true;
  if (a.bom) serOpts.bom = true;
  if (a.ddl) serOpts.ddl = true;
  if (a.table) serOpts.tableName = a.table;
  const output = await serialize(computed, to, serOpts);
  const w = writeOutput(ctx, output, a.out);
  const rows = computed.reduce((n, t) => n + t.rows.length, 0);
  ctx.io.err(`${ctx.c("green", "✓")} ${rows} row${rows === 1 ? "" : "s"}, +${adds.length} column${adds.length === 1 ? "" : "s"} (${adds.map((x) => x.key).join(", ")}) → ${w.where} (${formatBytes(w.bytes)})\n`);
  return 0;
}

async function cmdTemplate(ctx: Ctx): Promise<number> {
  const { a, c } = ctx;
  const id = a.positional[1];
  if (!id || id === "list" || id === "ls") {
    const list = listTemplates();
    if (a.json) { ctx.io.out(JSON.stringify(list, null, 2) + "\n"); return 0; }
    const width = Math.max(...list.map((t) => t.id.length));
    ctx.io.out(`${c("bold", c("magenta", "◆ lacspace-excel templates"))} ${c("dim", `· ${list.length} ready-to-fill workbooks`)}\n\n`);
    const byCat = new Map<string, typeof list>();
    for (const t of list) byCat.set(t.category, [...(byCat.get(t.category) ?? []), t]);
    for (const [cat, items] of byCat) {
      ctx.io.out(`${c("bold", cat)}\n`);
      for (const t of items) ctx.io.out(`  ${c("cyan", t.id.padEnd(width))}  ${t.name.padEnd(16)} ${c("dim", t.description)}\n`);
      ctx.io.out("\n");
    }
    ctx.io.out(`${c("dim", "Generate one:")} npx lacspace-excel template <id> -o <file.xlsx>\n`);
    return 0;
  }
  const tpl = getTemplate(id);
  if (!tpl) fail(`Unknown template "${id}" — run: lacspace-excel template list`);
  const to = a.to ?? (a.out ? formatFromPath(a.out) : undefined) ?? "xlsx";
  if (to === "xlsx") {
    const opts: Parameters<typeof buildTemplate>[1] = {};
    if (a.noSample) opts.sample = false;
    if (a.blankRows !== undefined) opts.blankRows = a.blankRows;
    if (a.currencyFormat !== undefined) opts.currencyFormat = a.currencyFormat;
    const bytes = buildTemplate(tpl!, opts);
    const out = a.out ?? `${id}.xlsx`;
    const w = writeOutput(ctx, bytes, out);
    const sheets = tpl!.sheets.map((s) => s.name).join(", ");
    ctx.io.err(`${c("green", "✓")} ${tpl!.name} template → ${w.where} (${formatBytes(w.bytes)}) ${c("dim", `· sheets: ${sheets}`)}\n`);
    return 0;
  }
  const tables = templateToTables(tpl!);
  const output = await serialize(tables, to, a.pretty ? { pretty: true } : {});
  const w = writeOutput(ctx, output, a.out);
  const rows = tables.reduce((n, t) => n + t.rows.length, 0);
  summary(ctx, rows, w.where, w.bytes, to);
  return 0;
}

async function cmdDedupe(ctx: Ctx): Promise<number> {
  const { a } = ctx;
  const loaded = readInput(ctx, a.positional[1], a.from);
  const inputFmt = loaded.from ?? "json";
  const to = resolveTo(a, isTextFormat(inputFmt) ? inputFmt : "json");
  if (to === "xlsx" && !a.out) fail("dedupe --to xlsx needs -o <file.xlsx>");
  const loadOpts: { infer?: boolean } = {};
  if (a.noInfer) loadOpts.infer = false;
  const { tables: parsed } = await loadTables(loaded.data, loaded.from, loadOpts);
  const sheet = parseSheetRef(a.sheet);
  const tables = reshapeTables(parsed, sheet !== undefined ? { sheet } : {});
  let removed = 0;
  const deduped: Table[] = tables.map((t) => {
    const r = dedupeRows(t.rows, a.by);
    removed += r.removed;
    return { ...t, rows: r.rows };
  });
  const output = await serialize(deduped, to, a.pretty ? { pretty: true } : {});
  const w = writeOutput(ctx, output, a.out);
  const kept = deduped.reduce((n, t) => n + t.rows.length, 0);
  ctx.io.err(`${ctx.c("green", "✓")} removed ${removed} duplicate${removed === 1 ? "" : "s"} · ${kept} row${kept === 1 ? "" : "s"} kept → ${w.where} (${formatBytes(w.bytes)})\n`);
  return 0;
}

async function cmdSplit(ctx: Ctx): Promise<number> {
  const { a } = ctx;
  const loaded = readInput(ctx, a.positional[1], a.from ?? "xlsx", "workbook");
  if (typeof loaded.data === "string") fail("split needs an .xlsx workbook");
  const to: Format = a.to ?? "xlsx";
  const loadOpts: { infer?: boolean } = {};
  if (a.noInfer) loadOpts.infer = false;
  const sheets = await splitWorkbook(loaded.data as Uint8Array, loadOpts);
  const dir = a.outDir ?? ".";
  const absDir = resolve(ctx.io.cwd, dir);
  try { mkdirSync(absDir, { recursive: true }); } catch (e) { fail(`Cannot create "${dir}": ${e instanceof Error ? e.message : String(e)}`); }
  const used = new Set<string>();
  const written: string[] = [];
  for (const sheet of sheets) {
    let base = sanitizeSheetName(sheet.name).replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "Sheet";
    let candidate = base;
    let n = 2;
    while (used.has(candidate.toLowerCase())) candidate = `${base}-${n++}`;
    used.add(candidate.toLowerCase());
    base = candidate;
    const file = join(dir, `${base}.${FORMAT_EXTENSION[to]}`);
    const output = await serialize([{ name: sheet.name, rows: sheet.rows }], to, a.pretty ? { pretty: true } : {});
    const w = writeOutput(ctx, output, file);
    written.push(file);
    ctx.io.out(`${file}\n`);
    ctx.io.err(`${ctx.c("green", "✓")} ${sheet.name} → ${file} ${ctx.c("dim", `(${sheet.rows.length} row${sheet.rows.length === 1 ? "" : "s"}, ${formatBytes(w.bytes)})`)}\n`);
  }
  if (written.length === 0) ctx.io.err(`${ctx.c("yellow", "!")} workbook has no sheets\n`);
  return 0;
}

function expandGlob(cwd: string, pattern: string): string[] {
  if (!pattern.includes("*")) return [pattern];
  const dir = dirname(pattern);
  const base = basename(pattern);
  const re = new RegExp("^" + base.replace(/[.+^${}()|\\]/g, "\\$&").replace(/\*/g, ".*") + "$");
  try {
    return readdirSync(resolve(cwd, dir)).filter((f) => re.test(f)).map((f) => (dir === "." ? f : join(dir, f))).sort();
  } catch { return [pattern]; }
}

async function cmdMerge(ctx: Ctx): Promise<number> {
  const { a } = ctx;
  const files = a.positional.slice(1).flatMap((f) => expandGlob(ctx.io.cwd, f));
  if (files.length === 0) fail("merge needs at least one input file: merge <file...> -o <book.xlsx>");
  if (!a.out) fail("merge needs -o <book.xlsx>");
  const outFmt = formatFromPath(a.out!) ?? "xlsx";
  if (outFmt !== "xlsx") fail("merge writes an .xlsx workbook — use -o <book.xlsx>");
  const loadOpts: { infer?: boolean } = {};
  if (a.noInfer) loadOpts.infer = false;
  const tables: { name: string; rows: Row[] }[] = [];
  for (const f of files) {
    const loaded = readInput(ctx, f, a.from);
    const { tables: parsed } = await loadTables(loaded.data, loaded.from, loadOpts);
    const base = sheetNameFromPath(f);
    if (parsed.length === 1) tables.push({ name: base, rows: parsed[0]!.rows });
    else parsed.forEach((t, i) => tables.push({ name: sanitizeSheetName(`${base}-${t.name ?? i + 1}`), rows: t.rows }));
  }
  const bytes = mergeTables(tables);
  const w = writeOutput(ctx, bytes, a.out);
  const rows = tables.reduce((n, t) => n + t.rows.length, 0);
  ctx.io.err(`${ctx.c("green", "✓")} ${tables.length} sheet${tables.length === 1 ? "" : "s"}, ${rows} row${rows === 1 ? "" : "s"} → ${w.where} (${formatBytes(w.bytes)})\n`);
  return 0;
}

function renderDoc(ctx: Ctx, d: FunctionDoc, width: number): string {
  const { c } = ctx;
  const result = d.result ? `  ${c("dim", "→ " + d.result)}` : "";
  return `  ${c("cyan", d.name.padEnd(width))}  ${d.signature}\n  ${" ".repeat(width)}  ${c("dim", d.description)}\n  ${" ".repeat(width)}  ${c("yellow", d.example)}${result}\n`;
}

function cmdFunctions(ctx: Ctx): number {
  const { a, c } = ctx;
  const name = a.positional[1];
  if (name) {
    const doc = functionReference(name);
    if (!doc) fail(`Unknown function "${name}" — run: lacspace-excel functions`);
    if (a.json) { ctx.io.out(JSON.stringify(doc, null, 2) + "\n"); return 0; }
    ctx.io.out(`${c("bold", c("magenta", "◆ " + doc!.name))} ${c("dim", `· ${doc!.category}`)}\n`);
    ctx.io.out(`  ${c("bold", "Signature")}    ${doc!.signature}\n`);
    ctx.io.out(`  ${c("bold", "Description")}  ${doc!.description}\n`);
    ctx.io.out(`  ${c("bold", "Example")}      ${c("yellow", doc!.example)}${doc!.result ? c("dim", "  → " + doc!.result) : ""}\n`);
    return 0;
  }
  const groups = functionReference();
  if (a.json) { ctx.io.out(JSON.stringify(groups, null, 2) + "\n"); return 0; }
  const total = groups.reduce((n, g) => n + g.functions.length, 0);
  ctx.io.out(`${c("bold", c("magenta", "◆ lacspace-excel functions"))} ${c("dim", `· ${total} functions in ${groups.length} categories`)}\n\n`);
  const width = Math.max(...groups.flatMap((g) => g.functions.map((f) => f.name.length)));
  for (const g of groups) {
    ctx.io.out(`${c("bold", g.category)} ${c("dim", `(${g.functions.length})`)}\n`);
    for (const d of g.functions) ctx.io.out(renderDoc(ctx, d, width));
    ctx.io.out("\n");
  }
  ctx.io.out(`${c("dim", "Details:")} npx lacspace-excel functions <NAME>\n`);
  return 0;
}

/* ------------------------------ dispatch ------------------------------ */

const COMMANDS = new Set(["convert", "inspect", "formula", "template", "templates", "dedupe", "split", "merge", "functions", "fn"]);

/**
 * Run the CLI. `argv` excludes the node binary and script path. Returns the
 * exit code; never calls `process.exit` itself.
 */
export async function main(argv: string[], io: Partial<CliIO> = {}): Promise<number> {
  const full: CliIO = { ...defaultIO(), ...io };
  const c = (k: Color, s: string): string => (full.color ? `${C[k]}${s}${C.reset}` : s);
  let a: Args;
  try {
    a = parseArgs(argv);
  } catch (e) {
    full.err(c("red", `✗ ${e instanceof Error ? e.message : String(e)}`) + "\n");
    return 1;
  }
  if (a.version) { full.out(VERSION + "\n"); return 0; }
  const cmd = a.positional[0];
  if (a.help || !cmd) { full.out(helpText(c) + "\n"); return a.help || !cmd ? 0 : 1; }
  if (!COMMANDS.has(cmd)) {
    full.err(c("red", `✗ Unknown command "${cmd}"`) + ` — one of: convert, inspect, formula, template, dedupe, split, merge, functions (see --help)\n`);
    return 1;
  }
  const ctx: Ctx = { io: full, c, a };
  try {
    switch (cmd) {
      case "convert": return await cmdConvert(ctx);
      case "inspect": return await cmdInspect(ctx);
      case "formula": return await cmdFormula(ctx);
      case "template":
      case "templates": return await cmdTemplate(ctx);
      case "dedupe": return await cmdDedupe(ctx);
      case "split": return await cmdSplit(ctx);
      case "merge": return await cmdMerge(ctx);
      case "functions":
      case "fn": return cmdFunctions(ctx);
      default: return 1;
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    full.err(c("red", `✗ ${msg}`) + "\n");
    return e instanceof CliError ? e.code : 1;
  }
}

/* ------------------------------ entry ------------------------------ */

function isDirectRun(): boolean {
  try {
    const entry = process.argv[1];
    if (!entry) return false;
    return realpathSync(entry) === realpathSync(fileURLToPath(import.meta.url));
  } catch { return false; }
}

if (isDirectRun()) {
  main(process.argv.slice(2)).then(
    (code) => { process.exitCode = code; },
    (e) => { process.stderr.write(`✗ ${e instanceof Error ? e.message : String(e)}\n`); process.exitCode = 1; },
  );
}
