import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdout, stderr, argv, exit } from "node:process";
import { serializeRows } from "lacspace-scraper";
import { extractFile, type ExtractResult } from "./extract.js";
import { toMarkdown } from "./markdown.js";
import { grepText, grepPages, type GrepHit } from "./search.js";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m" };
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");

const FORMATS = ["json", "ndjson", "csv", "xlsx", "txt", "md"] as const;
type Format = (typeof FORMATS)[number];

interface Args {
  file?: string; tables: boolean; text: boolean; format?: Format; out?: string; sheet?: string; help: boolean;
  pages?: string; perPage: boolean; readable: boolean; meta: boolean;
  grep?: string; ignoreCase: boolean; context: number;
}

function parseArgs(list: string[]): Args {
  const a: Args = { tables: false, text: false, help: false, perPage: false, readable: false, meta: false, ignoreCase: false, context: 0 };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--tables") a.tables = true;
    else if (arg === "--text") a.text = true;
    else if (arg === "-f" || arg === "--format") a.format = next() as Format;
    else if (arg === "-o" || arg === "--out") a.out = next();
    else if (arg === "--sheet") a.sheet = next();
    else if (arg === "--pages") a.pages = next();
    else if (arg === "--per-page") a.perPage = true;
    else if (arg === "--readable") a.readable = true;
    else if (arg === "--meta") a.meta = true;
    else if (arg === "--grep") a.grep = next();
    else if (arg === "-i" || arg === "--ignore-case") a.ignoreCase = true;
    else if (arg === "-C" || arg === "--context") a.context = Math.max(0, parseInt(next(), 10) || 0);
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (!arg.startsWith("-") && !a.file) a.file = arg;
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-extract"))} ${c("dim", "— text, tables & metadata out of PDFs, Office docs, HTML & spreadsheets, free")}

${c("bold", "Usage")}
  npx lacspace-extract <file> [options]

${c("bold", "What it does (by file type)")}
  .pdf                 → extract the text (zero-dep engine; no OCR) + metadata
  .docx                → paragraphs (+ tables with --tables)
  .pptx                → text per slide
  .epub                → book text in reading order
  .html / .htm         → every <table> (or --readable for the article, --text for all text)
  .csv .xlsx .json     → read the rows (convert between formats)

${c("bold", "Options")}
      --tables         Also detect tables (PDF/text: best-effort line tables; DOCX: real tables)
      --text           Also/force plain-text extraction
      --readable       HTML: extract the main article (drop nav/footer/aside) + metadata
      --pages <range>  PDF: only these pages, e.g. 2-5 · 1,3,5 · 4- (implies per-page)
      --per-page       PDF/PPTX: one text block per page/slide
      --meta           Include document metadata (PDF Info/XMP, EPUB title)
      --grep <regex>   Print only lines matching <regex> (with page/line numbers)
  -i, --ignore-case    Case-insensitive --grep
  -C, --context <n>    Lines of context around each --grep match
  -f, --format <fmt>   json | ndjson | csv | xlsx | txt | md
  -o, --out <file>     Output file, or "-" for stdout
      --sheet <name>   Excel sheet name
  -h, --help           Show this help

${c("bold", "Examples")}
  npx lacspace-extract report.pdf                          # print the text
  npx lacspace-extract report.pdf --pages 2-5 --per-page   # just pages 2–5, split per page
  npx lacspace-extract report.pdf --meta -f json           # metadata + text as JSON
  npx lacspace-extract report.pdf --grep "invoice" -i -C 1 # find "invoice" across the doc
  npx lacspace-extract notes.docx -f md -o notes.md        # DOCX → Markdown
  npx lacspace-extract deck.pptx --per-page                # slide-by-slide text
  npx lacspace-extract article.html --readable -f md       # readable article → Markdown
  npx lacspace-extract prices.html -f csv -o prices.csv    # every table → CSV
  npx lacspace-extract data.csv -f json                    # csv → json

${c("dim", "The PDF engine reads text-based PDFs. Scanned/image PDFs need OCR and aren't")}
${c("dim", "supported; encrypted PDFs are detected & reported. Complex layouts are best-effort.")}
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
  if (r.pages && r.pages.length) return r.pages.map((p) => ({ page: p.page, text: p.text }));
  if (r.text !== undefined) return [{ text: r.text }];
  return [];
}

/** Render grep hits as human-readable coloured lines. */
function renderGrep(hits: GrepHit[], plain: boolean): string {
  return hits.map((h) => {
    const loc = h.page !== undefined ? `${h.page}:${h.line}` : `${h.line}`;
    if (plain) return h.context.length > 1 ? h.context.map((l) => `${loc}: ${l}`).join("\n") : `${loc}: ${h.text}`;
    const head = `${c("magenta", h.page !== undefined ? `p${h.page}` : "")}${h.page !== undefined ? c("dim", ":") : ""}${c("cyan", String(h.line))}`;
    if (h.context.length > 1) return h.context.map((l) => `  ${head} ${c("dim", "│")} ${l}`).join("\n");
    return `  ${head} ${c("dim", "│")} ${h.text}`;
  }).join(plain ? "\n" : "\n");
}

async function main(): Promise<void> {
  const args = parseArgs(argv.slice(2));
  if (args.help || !args.file) { stdout.write(HELP + "\n"); return; }
  if (args.format && !FORMATS.includes(args.format)) { log(c("red", `\n✗ Unknown format "${args.format}".`)); exit(1); return; }

  // grep on a PDF wants page numbers → force per-page extraction.
  const grepPdf = !!args.grep && /\.pdf$/i.test(args.file);

  let result: ExtractResult;
  try {
    result = await extractFile(args.file, {
      tables: args.tables, text: args.text, pages: args.pages,
      perPage: args.perPage || grepPdf, meta: args.meta, readable: args.readable,
    });
  } catch (err) {
    log(c("red", `\n✗ ${(err as Error).message}\n`)); exit(1); return;
  }

  if (result.encrypted && (!result.text || !result.text.trim())) {
    log(c("yellow", `\n⚠ ${args.file} is encrypted — no text extracted (empty-password decryption isn't supported yet).\n`));
    exit(2); return;
  }

  const toStdout = args.out === "-";
  const tableCount = result.tables?.length ?? 0;
  const rowCount = result.rows?.length ?? 0;
  const summary = [
    result.pageCount ? `${result.pageCount} page${result.pageCount === 1 ? "" : "s"}` : "",
    result.pages && !result.pageCount ? `${result.pages.length} slides` : "",
    result.text !== undefined ? `${result.text.length} chars of text` : "",
    tableCount ? `${tableCount} table${tableCount === 1 ? "" : "s"}` : "",
    rowCount ? `${rowCount} rows` : "",
  ].filter(Boolean).join(" · ");

  // ── --grep: print only matching lines (with page/line numbers) ─────────────
  if (args.grep) {
    let hits: GrepHit[];
    try {
      hits = result.pages && result.pages.length
        ? grepPages(result.pages, args.grep, { ignoreCase: args.ignoreCase, context: args.context })
        : grepText(result.text ?? "", args.grep, { ignoreCase: args.ignoreCase, context: args.context });
    } catch (err) { log(c("red", `\n✗ bad --grep regex: ${(err as Error).message}\n`)); exit(1); return; }
    if (args.out && !toStdout) { writeFileSync(resolve(args.out), renderGrep(hits, true) + (hits.length ? "\n" : "")); log(`\n  ${c("green", "✔")} ${c("dim", `${hits.length} match${hits.length === 1 ? "" : "es"}`)} → ${c("cyan", resolve(args.out))}\n`); return; }
    stdout.write(renderGrep(hits, toStdout) + "\n");
    if (!toStdout) log(`\n  ${c("green", "✔")} ${c("dim", `${hits.length} match${hits.length === 1 ? "" : "es"}`)}`);
    return;
  }

  // ── -f md: render structure as Markdown ────────────────────────────────────
  if (args.format === "md") {
    const md = toMarkdown(result);
    if (toStdout || !args.out) { stdout.write(md); if (!toStdout) log(`\n  ${c("green", "✔")} ${c("dim", summary)}`); return; }
    writeFileSync(resolve(args.out), md);
    log(`\n  ${c("green", "✔")} ${c("dim", summary)} → ${c("cyan", resolve(args.out))}\n`);
    return;
  }

  // Plain text with no explicit tabular format → emit the text.
  const textOnly = result.text !== undefined && !tableCount && !rowCount;
  if ((!args.format || args.format === "txt") && (textOnly || args.format === "txt")) {
    let text = result.text ?? "";
    if (args.meta && result.meta && Object.keys(result.meta).length) {
      const head = Object.entries(result.meta).map(([k, v]) => `${k}: ${v}`).join("\n");
      text = head + "\n\n" + text;
    }
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
