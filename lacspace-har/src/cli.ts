import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdout, stderr, argv, exit } from "node:process";
import { parseHar, HarParseError } from "./parse.js";
import { analyzeHar } from "./analyze.js";
import { formatReport } from "./report.js";

const VERSION = "0.1.0";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", magenta: "\x1b[35m", red: "\x1b[31m" };
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const err = (s = ""): void => void stderr.write(s + "\n");

interface Args {
  file?: string;
  top: number;
  by: "type" | "domain" | "status";
  json: boolean;
  out?: string;
  help: boolean;
  version: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = { top: 10, by: "domain", json: false, help: false, version: false };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--top" || arg === "-t") {
      const n = parseInt(next(), 10);
      if (Number.isFinite(n) && n > 0) a.top = n;
    } else if (arg === "--by" || arg === "-b") {
      const v = next();
      if (v === "type" || v === "domain" || v === "status") a.by = v;
    } else if (arg === "--json") a.json = true;
    else if (arg === "-o" || arg === "--out") a.out = next();
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (!arg.startsWith("-") && !a.file) a.file = arg;
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-har"))} ${c("dim", "— read a browser .har export offline, free")}

${c("bold", "Usage")}
  npx lacspace-har <file.har> [options]

${c("bold", "Options")}
  -t, --top <n>          How many slowest/largest requests to show (default 10)
  -b, --by <what>        Which breakdown to print: domain | type | status (default domain)
      --json             Print the structured report as JSON instead of a report
  -o, --out <file>       Write output (report text, or JSON with --json) to a file
  -h, --help             Show this help
  -v, --version          Print version

${c("bold", "Examples")}
  npx lacspace-har session.har
  npx lacspace-har session.har --top 20 --by type
  npx lacspace-har session.har --by status
  npx lacspace-har session.har --json -o report.json

${c("dim", "Export a .har from your browser DevTools → Network tab → right-click → \"Save all as HAR\".")}
${c("dim", "Everything runs locally; nothing is uploaded.")}
`;

function main(): void {
  const args = parseArgs(argv.slice(2));
  if (args.version) { stdout.write(VERSION + "\n"); return; }
  if (args.help || !args.file) { stdout.write(HELP + "\n"); if (!args.file && !args.help) exit(1); return; }

  let text: string;
  try {
    text = readFileSync(resolve(args.file), "utf8");
  } catch (e) {
    err(c("red", `\n✗ Could not read "${args.file}": ${(e as Error).message}\n`));
    exit(1);
    return;
  }

  let report;
  try {
    const har = parseHar(text);
    report = analyzeHar(har, { top: args.top });
  } catch (e) {
    const msg = e instanceof HarParseError ? e.message : (e as Error).message;
    err(c("red", `\n✗ ${msg}\n`));
    exit(1);
    return;
  }

  const output = args.json ? JSON.stringify(report, null, 2) : formatReport(report, args.by);

  if (args.out) {
    writeFileSync(resolve(args.out), output.endsWith("\n") ? output : output + "\n");
    err(`  ${c("dim", `→ ${resolve(args.out)}`)}`);
  } else {
    stdout.write(output + (output.endsWith("\n") ? "" : "\n"));
  }
}

try {
  main();
} catch (e) {
  err(c("red", `\n✗ ${e instanceof Error ? e.message : String(e)}\n`));
  exit(1);
}
