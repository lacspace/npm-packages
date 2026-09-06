import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdout, stderr, argv, exit } from "node:process";
import { parseHar, HarParseError } from "./parse.js";
import { analyzeHar } from "./analyze.js";
import { formatReport } from "./report.js";
import { toWaterfall } from "./waterfall.js";
import { toHtml } from "./html.js";
import { diffHars, formatDiff } from "./diff.js";
import { budgetCheck } from "./budget.js";
import { filterEntries } from "./filter.js";
import { recommend } from "./recommend.js";
import { estimateVitals } from "./vitals.js";
import { redactHar } from "./redact.js";
import { exportRequests } from "./export.js";
import type { BudgetResult, Har } from "./types.js";

const VERSION = "0.2.0";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", magenta: "\x1b[35m", red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m" };
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const err = (s = ""): void => void stderr.write(s + "\n");

type Format = "terminal" | "json" | "html" | "waterfall";

interface Args {
  cmd: "analyze" | "diff" | "redact";
  files: string[];
  top: number;
  by: "type" | "domain" | "status";
  format: Format;
  out?: string;
  filter?: string;
  budget?: string;
  export?: string;
  width: number;
  color: boolean;
  keepBodies: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    cmd: "analyze", files: [], top: 10, by: "domain", format: "terminal",
    width: 40, color: true, keepBodies: false, help: false, version: false,
  };
  let i = 0;
  // A leading subcommand keyword.
  if (list[0] === "diff" || list[0] === "redact") { a.cmd = list[0] as Args["cmd"]; i = 1; }
  for (; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--top" || arg === "-t") {
      const n = parseInt(next(), 10);
      if (Number.isFinite(n) && n > 0) a.top = n;
    } else if (arg === "--by" || arg === "-b") {
      const v = next();
      if (v === "type" || v === "domain" || v === "status") a.by = v;
    } else if (arg === "-f" || arg === "--format") {
      const v = next();
      if (v === "terminal" || v === "json" || v === "html" || v === "waterfall") a.format = v;
    } else if (arg === "--json") a.format = "json";
    else if (arg === "--waterfall") a.format = "waterfall";
    else if (arg === "--html") a.format = "html";
    else if (arg === "-o" || arg === "--out") a.out = next();
    else if (arg === "--filter") a.filter = next();
    else if (arg === "--budget") a.budget = next();
    else if (arg === "--export") a.export = next();
    else if (arg === "--width") { const n = parseInt(next(), 10); if (Number.isFinite(n) && n > 0) a.width = n; }
    else if (arg === "--no-color") a.color = false;
    else if (arg === "--keep-bodies") a.keepBodies = true;
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (!arg.startsWith("-")) a.files.push(arg);
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-har"))} ${c("dim", "— read a browser .har export offline, free")}

${c("bold", "Usage")}
  npx lacspace-har <file.har> [options]
  npx lacspace-har diff <before.har> <after.har> [options]
  npx lacspace-har redact <file.har> [-o out.har] [--keep-bodies]

${c("bold", "Analyze options")}
  -t, --top <n>          How many slowest/largest requests to show (default 10)
  -b, --by <what>        Breakdown: domain | type | status (default domain)
  -f, --format <fmt>     Output: terminal | json | html | waterfall (default terminal)
      --json             Shorthand for --format json
      --html             Shorthand for --format html (standalone visual report)
      --waterfall        Shorthand for --format waterfall (ASCII timeline)
      --filter <query>   Focus on matching requests, e.g.
                         "domain=cdn.x,type=image,status>=400,size>100kb,url~=/api/"
      --budget <spec>    CI gate; non-zero exit if exceeded, e.g.
                         "js<300kb,images<500kb,requests<50,thirdparty<20,total<2mb"
      --export <file>    Also dump the per-request table (.csv or .json)
      --width <n>        Waterfall track width in chars (default 40)
      --no-color         Disable ANSI colors
  -o, --out <file>       Write the main output to a file
  -h, --help             Show this help
  -v, --version          Print version

${c("bold", "Examples")}
  npx lacspace-har session.har
  npx lacspace-har session.har --format html -o report.html
  npx lacspace-har session.har --waterfall --width 60
  npx lacspace-har session.har --filter "type=image,size>100kb"
  npx lacspace-har session.har --budget "js<300kb,requests<50,total<2mb"
  npx lacspace-har session.har --export requests.csv
  npx lacspace-har diff before.har after.har
  npx lacspace-har redact session.har -o safe.har

${c("dim", "Export a .har from DevTools → Network → right-click → \"Save all as HAR\".")}
${c("dim", "Everything runs locally; nothing is uploaded.")}
`;

function readHar(path: string): { har: Har; text: string } {
  const text = readFileSync(resolve(path), "utf8");
  return { har: parseHar(text), text };
}

/** Render a budget result for the terminal. */
function formatBudget(res: BudgetResult, color: boolean): string {
  const p = (k: keyof typeof C, s: string): string => (color ? c(k, s) : s);
  const out: string[] = [];
  out.push(p("bold", "Budget") + p("dim", `  (${res.pass ? "PASS" : "FAIL"})`));
  for (const it of res.items) {
    const mark = it.pass ? p("green", "✔") : p("red", "✗");
    const line = it.pass ? p("dim", it.label) : p("red", it.label);
    out.push(`  ${mark} ${line}`);
  }
  out.push("");
  return out.join("\n");
}

function writeOut(path: string | undefined, output: string): void {
  if (path) {
    writeFileSync(resolve(path), output.endsWith("\n") ? output : output + "\n");
    err(`  ${c("dim", `→ ${resolve(path)}`)}`);
  } else {
    stdout.write(output + (output.endsWith("\n") ? "" : "\n"));
  }
}

function runDiff(a: Args): void {
  if (a.files.length < 2) { err(c("red", "\n✗ diff needs two files: lacspace-har diff before.har after.har\n")); exit(1); return; }
  const before = readHar(a.files[0]!).har;
  const after = readHar(a.files[1]!).har;
  const diff = diffHars(before, after, { top: a.top });
  const output = a.format === "json" ? JSON.stringify(diff, null, 2) : formatDiff(diff, { color: a.color && !a.out });
  writeOut(a.out, output);
}

function runRedact(a: Args): void {
  if (a.files.length < 1) { err(c("red", "\n✗ redact needs a file: lacspace-har redact session.har\n")); exit(1); return; }
  const { har } = readHar(a.files[0]!);
  const safe = redactHar(har, { keepBodies: a.keepBodies });
  writeOut(a.out, JSON.stringify(safe));
  if (!a.out) return;
  err(`  ${c("green", "✔")} ${c("dim", "cookies, auth headers, tokens and bodies stripped")}`);
}

function runAnalyze(a: Args): void {
  let har = readHar(a.files[0]!).har;
  if (a.filter) {
    try { har = filterEntries(har, a.filter); }
    catch (e) { err(c("red", `\n✗ ${(e as Error).message}\n`)); exit(1); return; }
    if (har.log.entries.length === 0) err(c("yellow", "  (no requests matched the filter)"));
  }

  const report = analyzeHar(har, { top: a.top });
  report.vitals = estimateVitals(har);
  const recs = recommend(har);

  // Export the per-request table on the side, if asked.
  if (a.export) {
    const fmt = a.export.toLowerCase().endsWith(".json") ? "json" : "csv";
    try {
      writeFileSync(resolve(a.export), exportRequests(har, fmt) + "\n");
      err(`  ${c("dim", `→ ${resolve(a.export)} (${report.totals.requests} rows, ${fmt})`)}`);
    } catch (e) { err(c("red", `\n✗ could not write export: ${(e as Error).message}\n`)); exit(1); return; }
  }

  let output: string;
  if (a.format === "json") output = JSON.stringify(report, null, 2);
  else if (a.format === "html") output = toHtml(report, har);
  else if (a.format === "waterfall") output = toWaterfall(har, { width: a.width, color: a.color && !a.out });
  else output = formatReport(report, a.by, { recommendations: recs });

  writeOut(a.out, output);

  // Budget gate — printed after the report, sets the exit code.
  if (a.budget) {
    let res: BudgetResult;
    try { res = budgetCheck(report, a.budget); }
    catch (e) { err(c("red", `\n✗ ${(e as Error).message}\n`)); exit(1); return; }
    err(formatBudget(res, a.color));
    if (!res.pass) exit(1);
  }
}

function main(): void {
  const args = parseArgs(argv.slice(2));
  if (args.version) { stdout.write(VERSION + "\n"); return; }
  if (args.help || (args.cmd === "analyze" && args.files.length === 0)) {
    stdout.write(HELP + "\n");
    if (!args.help && args.files.length === 0) exit(1);
    return;
  }

  try {
    if (args.cmd === "diff") return runDiff(args);
    if (args.cmd === "redact") return runRedact(args);
    return runAnalyze(args);
  } catch (e) {
    const msg = e instanceof HarParseError ? e.message : (e as Error).message;
    err(c("red", `\n✗ ${msg}\n`));
    exit(1);
  }
}

try {
  main();
} catch (e) {
  err(c("red", `\n✗ ${e instanceof Error ? e.message : String(e)}\n`));
  exit(1);
}
