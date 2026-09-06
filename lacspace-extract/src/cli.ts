import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdout, stderr, argv, exit } from "node:process";
import { serializeRows } from "lacspace-scraper";
import { extractFile, type ExtractResult } from "./extract.js";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m" };
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");

const FORMATS = ["json", "ndjson", "csv", "xlsx", "txt"] as const;
type Format = (typeof FORMATS)[number];

interface Args { file?: string; tables: boolean; text: boolean; format?: Format; out?: string; sheet?: string; help: boolean; }

function parseArgs(list: string[]): Args {
  const a: Args = { tables: false, text: false, help: false };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--tables") a.tables = true;
    else if (arg === "--text") a.text = true;
    else if (arg === "-f" || arg === "--format") a.format = next() as Format;
    else if (arg === "-o" || arg === "--out") a.out = next();
    else if (arg === "--sheet") a.sheet = next();
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (!arg.startsWith("-") && !a.file) a.file = arg;
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-extract"))} ${c("dim", "— text & tables out of PDFs, HTML & spreadsheets, free")}

${c("bold", "Usage")}
  npx lacspace-extract <file> [options]

${c("bold", "What it does (by file type)")}
  .pdf                 → extract the text (zero-dep engine; no OCR)
  .html / .htm         → extract every <table> (add --text for the page text)
  .csv .xlsx .json     → read the rows (convert between formats)

${c("bold", "Options")}
      --tables         Also detect tables (PDF/text: best-effort line tables)
      --text           Also/force plain-text extraction
  -f, --format <fmt>   json | ndjson | csv | xlsx | txt
  -o, --out <file>     Output file, or "-" for stdout
      --sheet <name>   Excel sheet name
  -h, --help           Show this help

${c("bold", "Examples")}
  npx lacspace-extract report.pdf                 # print the text
  npx lacspace-extract report.pdf -o report.txt
  npx lacspace-extract prices.html -f csv -o prices.csv
  npx lacspace-extract statement.pdf --tables -f xlsx -o statement.xlsx
  npx lacspace-extract data.csv -f json           # csv → json

${c("dim", "The PDF engine reads text-based PDFs. Scanned/image PDFs need OCR and")}
${c("dim", "aren't supported; complex layouts are best-effort.")}
`;

function toRows(r: ExtractResult): Record<string, unknown>[] {
  if (r.rows) return r.rows as Record<string, unknown>[];
  if (r.tables && r.tables.length) {
    // HTML tables = objects; text/PDF tables = string[][] (first row = headers).
    if (typeof r.tables[0]?.[0] === "object" && !Array.isArray(r.tables[0]?.[0])) {
      const out: Record<string, unknown>[] = [];
      (r.tables as Record<string, string>[][]).forEach((tbl, ti) => tbl.forEach((row) => out.push(r.tables!.length > 1 ? { _table: ti + 1, ...row } : row)));
      return out;
    }
    const out: Record<string, unknown>[] = [];
    (r.tables as string[][][]).forEach((tbl, ti) => {
      const headers = tbl[0] ?? [];
      for (let i = 1; i < tbl.length; i++) {
        const obj: Record<string, unknown> = r.tables!.length > 1 ? { _table: ti + 1 } : {};
        tbl[i]!.forEach((cell, ci) => { obj[headers[ci] ?? `col${ci + 1}`] = cell; });
        out.push(obj);
      }
    });
    return out;
  }
  if (r.text !== undefined) return [{ text: r.text }];
  return [];
}

async function main(): Promise<void> {
  const args = parseArgs(argv.slice(2));
  if (args.help || !args.file) { stdout.write(HELP + "\n"); return; }
  if (args.format && !FORMATS.includes(args.format)) { log(c("red", `\n✗ Unknown format "${args.format}".`)); exit(1); return; }

  let result: ExtractResult;
  try {
    result = await extractFile(args.file, { tables: args.tables, text: args.text });
  } catch (err) {
    log(c("red", `\n✗ ${(err as Error).message}\n`)); exit(1); return;
  }

  const toStdout = args.out === "-";
  const tableCount = result.tables?.length ?? 0;
  const rowCount = result.rows?.length ?? 0;
  const summary = [
    result.pageCount ? `${result.pageCount} page${result.pageCount === 1 ? "" : "s"}` : "",
    result.text !== undefined ? `${result.text.length} chars of text` : "",
    tableCount ? `${tableCount} table${tableCount === 1 ? "" : "s"}` : "",
    rowCount ? `${rowCount} rows` : "",
  ].filter(Boolean).join(" · ");

  // Plain text with no explicit tabular format → emit the text.
  const textOnly = result.text !== undefined && !tableCount && !rowCount;
  if ((!args.format || args.format === "txt") && (textOnly || args.format === "txt")) {
    const text = result.text ?? "";
    if (toStdout || !args.out) { stdout.write(text + "\n"); if (!toStdout) log(`\n  ${c("green", "✔")} ${c("dim", summary)}`); return; }
    writeFileSync(resolve(args.out), text);
    log(`\n  ${c("green", "✔")} ${c("dim", summary)} → ${c("cyan", resolve(args.out))}\n`);
    return;
  }

  const format = args.format ?? "json";
  let data: string | Uint8Array;
  let binary = false;
  if (format === "json") data = JSON.stringify(result, null, 2);
  else { const s = serializeRows(toRows(result), format, args.sheet ? { sheetName: args.sheet } : {}); data = s.data; binary = s.binary; }

  if (toStdout || !args.out) {
    stdout.write(binary ? Buffer.from(data as Uint8Array) : (data as string));
    if (!binary) stdout.write("\n");
    if (!toStdout) log(`\n  ${c("green", "✔")} ${c("dim", summary)}`);
    return;
  }
  const out = resolve(args.out);
  writeFileSync(out, binary ? Buffer.from(data as Uint8Array) : (data as string));
  log(`\n  ${c("green", "✔")} ${c("dim", summary)} → ${c("cyan", out)}\n`);
}

main().catch((err: unknown) => { log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`)); exit(1); });
