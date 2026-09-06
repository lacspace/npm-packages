import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { stdout, stderr, argv, exit } from "node:process";
import { serializeRows, columnsOf } from "lacspace-scraper";
import type { DataRow } from "lacspace-scraper";
import { query } from "./run.js";
import { SqlError } from "./tokenize.js";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m" };
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");

type OutFormat = "json" | "ndjson" | "csv" | "table";

interface Args {
  sql?: string;
  file?: string;
  format: OutFormat;
  out?: string;
  help: boolean;
  version: boolean;
}

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"));
    return typeof pkg.version === "string" ? pkg.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function parseArgs(list: string[]): Args {
  const a: Args = { format: "table", help: false, version: false };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--file") a.file = next();
    else if (arg === "-f" || arg === "--format") a.format = next() as OutFormat;
    else if (arg === "-o" || arg === "--out") a.out = next();
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (!arg.startsWith("-") && a.sql === undefined) a.sql = arg;
    else if (!arg.startsWith("-")) a.sql = `${a.sql} ${arg}`; // tolerate an unquoted query
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-sql"))} ${c("dim", "— run SQL over CSV / JSON / NDJSON / Excel files, no database")}

${c("bold", "Usage")}
  npx lacspace-sql "<query>" [--file <path>] [-f table|json|ndjson|csv] [-o <out>]

${c("bold", "Options")}
      --file <path>      Bind a bare table name in FROM to this file
  -f, --format <fmt>     Output: table (default) | json | ndjson | csv
  -o, --out <file>       Write output to a file (else stdout)
  -h, --help             Show this help
  -v, --version          Print the version

${c("bold", "The FROM clause")}
  Point FROM at a file path directly:      ${c("dim", "FROM ./leads.csv")}
  …quoted if it has spaces:                ${c("dim", "FROM 'my data.xlsx'")}
  …or a bare name bound with --file:       ${c("dim", 'lacspace-sql "SELECT * FROM t" --file leads.csv')}

${c("bold", "Supported SQL")} ${c("dim", "(single table, read-only)")}
  SELECT *, col, col AS alias, DISTINCT, COUNT/SUM/AVG/MIN/MAX
  WHERE  = != <> < <= > >=, LIKE, IN (...), IS [NOT] NULL, AND/OR/NOT, ( )
  GROUP BY col[, ...]   ORDER BY col [ASC|DESC][, ...]   LIMIT n [OFFSET m]

${c("bold", "Examples")}
  npx lacspace-sql "SELECT * FROM ./leads.csv LIMIT 5"
  npx lacspace-sql "SELECT name, city FROM ./leads.csv WHERE city LIKE 'K%' ORDER BY name"
  npx lacspace-sql "SELECT city, COUNT(*) AS n FROM ./leads.csv GROUP BY city ORDER BY n DESC"
  npx lacspace-sql "SELECT * FROM data.json WHERE price >= 100 AND stock IS NOT NULL" -f csv -o out.csv

${c("dim", "No JOINs or subqueries in v0.1.0. Column names match your file's headers case-insensitively.")}
`;

function renderTable(rows: DataRow[]): string {
  if (rows.length === 0) return c("dim", "  (0 rows)");
  const cols = columnsOf(rows);
  const cell = (v: unknown): string => (v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
  const widths = cols.map((col) => Math.max(col.length, ...rows.map((r) => cell(r[col]).length)));
  const pad = (s: string, w: number): string => s + " ".repeat(Math.max(0, w - s.length));

  const header = "  " + cols.map((col, i) => c("bold", pad(col, widths[i]!))).join("  ");
  const rule = "  " + cols.map((_, i) => "─".repeat(widths[i]!)).join("  ");
  const body = rows
    .map((r) => "  " + cols.map((col, i) => pad(cell(r[col]), widths[i]!)).join("  "))
    .join("\n");
  return `${header}\n${c("dim", rule)}\n${body}`;
}

async function main(): Promise<void> {
  const args = parseArgs(argv.slice(2));
  if (args.version) { stdout.write(version() + "\n"); return; }
  if (args.help || !args.sql) { stdout.write(HELP + "\n"); return; }

  const opts = args.file ? { file: args.file } : {};
  const rows = await query(args.sql, opts);

  if (args.format === "table") {
    stdout.write(renderTable(rows) + "\n");
    log(`\n  ${c("dim", `${rows.length} row${rows.length === 1 ? "" : "s"}`)}`);
    return;
  }

  const { data, binary } = serializeRows(rows, args.format);
  if (args.out) {
    const out = resolve(args.out);
    writeFileSync(out, binary ? Buffer.from(data as Uint8Array) : (data as string));
    log(`  ${c("green", "✔")} ${c("dim", `${rows.length} row(s) → ${out}`)}`);
  } else {
    stdout.write((typeof data === "string" ? data : Buffer.from(data).toString()) + "\n");
  }
}

main().catch((err: unknown) => {
  if (err instanceof SqlError) {
    log(c("red", `\n✗ SQL error: ${err.message}\n`));
  } else {
    log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  }
  exit(1);
});
