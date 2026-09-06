import { readFileSync, writeFileSync, unlinkSync, watch as fsWatch } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { stdout, stderr, stdin, argv, exit } from "node:process";
import { serializeRows, columnsOf } from "lacspace-scraper";
import type { DataRow } from "lacspace-scraper";
import { query, statementFiles } from "./run.js";
import type { QueryOptions } from "./run.js";
import { toMarkdown, cellText } from "./format.js";
import { SqlError } from "./tokenize.js";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m" };
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");

type OutFormat = "json" | "ndjson" | "csv" | "table" | "md";
type StdinFormat = "csv" | "json" | "ndjson";

interface Args {
  sql?: string;
  file?: string;
  format: OutFormat;
  out?: string;
  noHeader: boolean;
  stdin?: StdinFormat;
  stdinTable: string;
  watch: boolean;
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
  const a: Args = { format: "table", noHeader: false, stdinTable: "stdin", watch: false, help: false, version: false };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--file") a.file = next();
    else if (arg === "-f" || arg === "--format") a.format = next() as OutFormat;
    else if (arg === "-o" || arg === "--out") a.out = next();
    else if (arg === "--no-header") a.noHeader = true;
    else if (arg === "--stdin") a.stdin = (next() || "csv") as StdinFormat;
    else if (arg === "--stdin-table") a.stdinTable = next();
    else if (arg === "--watch") a.watch = true;
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
  npx lacspace-sql "<query>" [--file <path>] [-f table|json|ndjson|csv|md] [-o <out>]

${c("bold", "Options")}
      --file <path>      Bind a bare table name in FROM to this file
  -f, --format <fmt>     Output: table (default) | json | ndjson | csv | md
      --no-header        Omit the header row (table / md / csv)
  -o, --out <file>       Write output to a file (else stdout)
      --stdin <fmt>      Read the table from piped stdin (csv|json|ndjson)
      --stdin-table <n>  Name the stdin table (default: stdin)
      --watch            Re-run when a source file changes (Ctrl-C to stop)
  -h, --help             Show this help
  -v, --version          Print the version

${c("bold", "The FROM clause")}
  A file path:            ${c("dim", "FROM ./leads.csv")}        (quote if it has spaces)
  A glob (unions files):  ${c("dim", "FROM './data/*.csv'")}     (quote it; same columns)
  A bare name + --file:   ${c("dim", 'lacspace-sql "SELECT * FROM t" --file leads.csv')}
  Piped stdin:            ${c("dim", 'cat leads.csv | lacspace-sql "SELECT * FROM stdin" --stdin csv')}

${c("bold", "JOINs")} ${c("dim", "(qualify columns with the table alias)")}
  ${c("dim", "FROM orders.csv o JOIN users.json u ON o.user_id = u.id")}
  ${c("dim", "FROM a.csv LEFT JOIN b.csv ON a.id = b.aid")}      ${c("dim", "· also INNER / cross (comma)")}

${c("bold", "Supported SQL")} ${c("dim", "(read-only)")}
  SELECT *, a.*, col, expr AS alias, DISTINCT, COUNT/SUM/AVG/MIN/MAX
  Expressions: + - * / %, UPPER/LOWER/TRIM/LENGTH/SUBSTR/REPLACE/CONCAT/COALESCE,
               ROUND/ABS/FLOOR/CEIL/MOD, CASE WHEN … THEN … ELSE … END
  JOIN … ON,  UNION [ALL]
  WHERE  = != <> < <= > >=, LIKE [ESCAPE], IN, BETWEEN … AND …, IS [NOT] NULL,
         NOT IN / NOT LIKE, AND/OR/NOT, ( )
  GROUP BY   HAVING   ORDER BY col [ASC|DESC] [NULLS FIRST|LAST][, …]   LIMIT n [OFFSET m]

${c("bold", "Examples")}
  npx lacspace-sql "SELECT name, city FROM ./leads.csv WHERE city LIKE 'K%' ORDER BY name"
  npx lacspace-sql "SELECT o.id, u.email, o.qty * o.price AS total FROM orders.csv o JOIN users.json u ON o.user_id = u.id"
  npx lacspace-sql "SELECT city, COUNT(*) AS n FROM './data/*.csv' GROUP BY city ORDER BY n DESC" -f md
  cat leads.csv | npx lacspace-sql "SELECT UPPER(name) AS name FROM stdin" --stdin csv

${c("dim", "Column names match your file's headers case-insensitively. One file per table (no subqueries).")}
`;

function renderTable(rows: DataRow[], noHeader: boolean): string {
  if (rows.length === 0) return c("dim", "  (0 rows)");
  const cols = columnsOf(rows);
  const widths = cols.map((col) => Math.max(noHeader ? 0 : col.length, ...rows.map((r) => cellText(r[col]).length)));
  const pad = (s: string, w: number): string => s + " ".repeat(Math.max(0, w - s.length));
  const body = rows
    .map((r) => "  " + cols.map((col, i) => pad(cellText(r[col]), widths[i]!)).join("  "))
    .join("\n");
  if (noHeader) return body;
  const header = "  " + cols.map((col, i) => c("bold", pad(col, widths[i]!))).join("  ");
  const rule = "  " + cols.map((_, i) => "─".repeat(widths[i]!)).join("  ");
  return `${header}\n${c("dim", rule)}\n${body}`;
}

/** Read all of stdin as a string. */
async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function runOnce(sql: string, opts: QueryOptions, args: Args): Promise<void> {
  const rows = await query(sql, opts);

  if (args.format === "table") {
    stdout.write(renderTable(rows, args.noHeader) + "\n");
    log(`\n  ${c("dim", `${rows.length} row${rows.length === 1 ? "" : "s"}`)}`);
    return;
  }
  if (args.format === "md") {
    const md = toMarkdown(rows, { noHeader: args.noHeader });
    if (args.out) { writeFileSync(resolve(args.out), md + "\n"); log(`  ${c("green", "✔")} ${c("dim", `${rows.length} row(s) → ${resolve(args.out)}`)}`); }
    else stdout.write(md + "\n");
    return;
  }

  const serialized = serializeRows(rows, args.format);
  let data = serialized.data;
  const binary = serialized.binary;
  if (args.noHeader && args.format === "csv" && typeof data === "string") {
    const nl = data.indexOf("\n");
    data = nl >= 0 ? data.slice(nl + 1) : "";
  }
  if (args.out) {
    const out = resolve(args.out);
    writeFileSync(out, binary ? Buffer.from(data as Uint8Array) : (data as string));
    log(`  ${c("green", "✔")} ${c("dim", `${rows.length} row(s) → ${out}`)}`);
  } else {
    stdout.write((typeof data === "string" ? data : Buffer.from(data).toString()) + "\n");
  }
}

async function main(): Promise<void> {
  const args = parseArgs(argv.slice(2));
  if (args.version) { stdout.write(version() + "\n"); return; }
  if (args.help || !args.sql) { stdout.write(HELP + "\n"); return; }

  const opts: QueryOptions = {};
  if (args.file) opts.file = args.file;

  // stdin → a temp file bound to the stdin table name (reuses the file readers)
  let tmpFile: string | undefined;
  if (args.stdin) {
    const text = await readStdin();
    const ext = args.stdin === "json" ? "json" : args.stdin === "ndjson" ? "ndjson" : "csv";
    tmpFile = join(tmpdir(), `lacspace-sql-${process.pid}-${Date.now()}.${ext}`);
    writeFileSync(tmpFile, text);
    opts.tables = { ...(opts.tables ?? {}), [args.stdinTable]: tmpFile };
  }

  try {
    if (args.watch) {
      if (args.stdin) throw new SqlError("--watch cannot be combined with --stdin (stdin is not a file).");
      await watchLoop(args.sql, opts, args);
      return;
    }
    await runOnce(args.sql, opts, args);
  } finally {
    if (tmpFile) { try { unlinkSync(tmpFile); } catch { /* ignore */ } }
  }
}

async function watchLoop(sql: string, opts: QueryOptions, args: Args): Promise<void> {
  const files = statementFiles(sql, opts);
  if (files.length === 0) throw new SqlError("--watch found no source files to watch.");

  const render = async (): Promise<void> => {
    stdout.write("\x1b[2J\x1b[H"); // clear screen
    log(c("dim", `  watching ${files.length} file(s) — ${new Date().toLocaleTimeString()} · Ctrl-C to stop`));
    try {
      await runOnce(sql, opts, args);
    } catch (err) {
      log(c("red", `  ✗ ${err instanceof Error ? err.message : String(err)}`));
    }
  };

  await render();
  let timer: NodeJS.Timeout | undefined;
  const schedule = (): void => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { void render(); }, 120); // debounce rapid fs events
  };
  const watchers = files.map((f) => {
    try { return fsWatch(f, schedule); } catch { return undefined; }
  });
  // keep the process alive until interrupted
  await new Promise<void>((resolveWait) => {
    process.on("SIGINT", () => {
      for (const w of watchers) w?.close();
      log(c("dim", "\n  stopped."));
      resolveWait();
    });
  });
}

main().catch((err: unknown) => {
  if (err instanceof SqlError) {
    log(c("red", `\n✗ SQL error: ${err.message}\n`));
  } else {
    log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  }
  exit(1);
});
