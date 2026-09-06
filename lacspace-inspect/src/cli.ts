import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stdout, stderr, argv, exit } from "node:process";
import { inspectUrl } from "./inspect.js";
import { formatReport } from "./report.js";
import type { Grade } from "./types.js";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m" };
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

interface Args {
  url?: string;
  links: boolean;
  json: boolean;
  verbose: boolean;
  minGrade?: Grade;
  out?: string;
  help: boolean;
  version: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = { links: false, json: false, verbose: false, help: false, version: false };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--links") a.links = true;
    else if (arg === "--json") a.json = true;
    else if (arg === "--verbose" || arg === "-v") a.verbose = true;
    else if (arg === "--min-grade" || arg === "-m") a.minGrade = next().toUpperCase() as Grade;
    else if (arg === "-o" || arg === "--out") a.out = next();
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-V" || arg === "--version") a.version = true;
    else if (!arg.startsWith("-") && !a.url) a.url = arg;
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-inspect"))} ${c("dim", "— one-command website audit, graded A–F. No API keys.")}

${c("bold", "Usage")}
  npx lacspace-inspect <url> [options]

${c("bold", "Options")}
      --links            Also check every link's HTTP status (broken / redirected)
      --json             Output the structured report as JSON (to stdout or -o)
  -m, --min-grade <A-D>  Exit non-zero if the overall grade is below this (CI gate)
  -o, --out <file>       Write the report (JSON with --json, else plain text) to a file
  -v, --verbose          List passing checks too, not just problems
  -V, --version          Print version
  -h, --help             Show this help

${c("bold", "What it checks")}
  SEO & meta · Open Graph / Twitter · JSON-LD structured data · one <h1> +
  heading order + image alt · internal/external (and broken) links · static
  performance signals · HTTPS + mixed content + security headers · robots.txt
  + sitemap · and a light tech-stack sniff.

${c("bold", "Examples")}
  npx lacspace-inspect https://example.com
  npx lacspace-inspect example.com --links --verbose
  npx lacspace-inspect https://example.com --json -o report.json
  npx lacspace-inspect https://example.com --min-grade B    ${c("dim", "# fails CI below B")}

${c("dim", "Performance checks are static HTML heuristics, not a Lighthouse runtime audit.")}
${c("dim", "Please audit responsibly and respect each site's Terms and robots policy.")}
`;

function belowGrade(grade: Grade, min: Grade): boolean {
  // Grades sort A < B < C < D < F; "below min" means a worse (later) letter.
  return grade > min;
}

async function main(): Promise<void> {
  const args = parseArgs(argv.slice(2));
  if (args.version) { stdout.write(version() + "\n"); return; }
  if (args.help || !args.url) { stdout.write(HELP + "\n"); return; }
  if (args.minGrade && !["A", "B", "C", "D"].includes(args.minGrade)) {
    log(c("red", `\n✗ --min-grade must be one of A, B, C, D\n`));
    exit(2);
    return;
  }

  if (!args.json) log(c("dim", `\n  fetching ${args.url} …`));
  const report = await inspectUrl(args.url, { checkLinks: args.links });

  if (args.json) {
    const json = JSON.stringify(report, null, 2);
    if (args.out) { writeFileSync(resolve(args.out), json); log(c("green", `✔ report → ${resolve(args.out)}`)); }
    else stdout.write(json + "\n");
  } else {
    const text = formatReport(report, args.verbose);
    stdout.write(text + "\n");
    if (args.out) { writeFileSync(resolve(args.out), stripAnsi(text)); log(c("green", `  ✔ report → ${resolve(args.out)}`)); }
  }

  if (args.minGrade && belowGrade(report.grade, args.minGrade)) {
    log(c("red", `\n  ✗ grade ${report.grade} is below the required minimum ${args.minGrade}`));
    exit(1);
  }
}

main().catch((err: unknown) => {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
});
