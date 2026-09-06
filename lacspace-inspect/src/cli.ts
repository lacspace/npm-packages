import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { stdout, stderr, argv, exit } from "node:process";
import { inspectUrl, crawlSite } from "./inspect.js";
import { formatReport } from "./report.js";
import {
  formatMarkdown, formatHtml, formatSiteReport, formatSiteMarkdown,
  formatLeaderboard, formatRegressions,
} from "./formats.js";
import { parseBudgetDetailed, evaluateBudget, budgetExceeded } from "./budget.js";
import { diffReports } from "./baseline.js";
import type { Grade, Report } from "./types.js";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m" };
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;]*m/g, "");

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../package.json"), "utf8")) as { version?: string };
    return pkg.version ?? "0.2.0";
  } catch {
    return "0.2.0";
  }
}

type Format = "text" | "md" | "html" | "json";

interface Args {
  url?: string;
  links: boolean;
  json: boolean;
  format: Format;
  verbose: boolean;
  minGrade?: Grade;
  out?: string;
  crawl: boolean;
  depth?: number;
  max?: number;
  budget?: string;
  baseline?: string;
  saveBaseline?: string;
  input?: string;
  help: boolean;
  version: boolean;
}

function parseFormat(v: string): Format {
  const s = v.toLowerCase();
  if (s === "markdown" || s === "md") return "md";
  if (s === "html" || s === "htm") return "html";
  if (s === "json") return "json";
  return "text";
}

function parseArgs(list: string[]): Args {
  const a: Args = { links: false, json: false, format: "text", verbose: false, crawl: false, help: false, version: false };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--links") a.links = true;
    else if (arg === "--json") { a.json = true; a.format = "json"; }
    else if (arg === "-f" || arg === "--format") a.format = parseFormat(next());
    else if (arg === "--verbose" || arg === "-v") a.verbose = true;
    else if (arg === "--min-grade" || arg === "-m") a.minGrade = next().toUpperCase() as Grade;
    else if (arg === "-o" || arg === "--out") a.out = next();
    else if (arg === "--crawl") a.crawl = true;
    else if (arg === "--depth") a.depth = Number(next());
    else if (arg === "--max") a.max = Number(next());
    else if (arg === "--budget") a.budget = next();
    else if (arg === "--baseline") a.baseline = next();
    else if (arg === "--save-baseline") a.saveBaseline = next();
    else if (arg === "--input" || arg === "-i") a.input = next();
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
      --links              Also check every link's HTTP status (broken / redirected)
      --crawl              Audit a whole site: crawl + per-page leaderboard + site-wide issues
      --depth <n>          Crawl depth from the seed (with --crawl, default 2)
      --max <n>            Max pages to audit (with --crawl, default 20)
  -i, --input <file>       Batch: audit every URL (one per line) and print a leaderboard
      --budget "<rules>"   Fail if a budget is exceeded, e.g. "html<100kb,scripts<10,images<20,requests<50"
      --baseline <file>    Compare to a saved report and fail on any regression (CI)
      --save-baseline <f>  Write the report JSON to <f> to use as a future baseline
  -f, --format <fmt>       Output format: text (default), md, html, or json
      --json               Shorthand for -f json (machine-readable report)
  -m, --min-grade <A-D>    Exit non-zero if the (site-average, for --crawl) grade is below this
  -o, --out <file>         Write the output to a file (format follows -f / --json)
  -v, --verbose            List passing checks too, not just problems
  -V, --version            Print version
  -h, --help               Show this help

${c("bold", "What it checks")}
  SEO & meta · Open Graph / Twitter · JSON-LD structured data · one <h1> +
  heading order + image alt · internal/external (and broken) links · static
  performance (size, blocking, response time, compression, image dims/lazy) ·
  HTTPS + mixed content + http→https redirect + security headers · robots.txt
  + sitemap · plus a light tech-stack sniff. Every warn/fail carries a fix.

${c("bold", "Examples")}
  npx lacspace-inspect https://example.com
  npx lacspace-inspect example.com --links --verbose
  npx lacspace-inspect https://example.com -f md -o report.md    ${c("dim", "# PR comment")}
  npx lacspace-inspect https://example.com -f html -o report.html
  npx lacspace-inspect https://example.com --budget "html<100kb,scripts<10"
  npx lacspace-inspect https://example.com --save-baseline base.json
  npx lacspace-inspect https://example.com --baseline base.json  ${c("dim", "# fail on regression")}
  npx lacspace-inspect https://example.com --crawl --depth 2 --max 25 --min-grade B
  npx lacspace-inspect --input urls.txt

${c("dim", "Performance checks are static + a few live signals, not a Lighthouse runtime audit.")}
${c("dim", "Please audit responsibly and respect each site's Terms and robots policy.")}
`;

function belowGrade(grade: Grade, min: Grade): boolean {
  // Grades sort A < B < C < D < F; "below min" means a worse (later) letter.
  return grade > min;
}

function writeOut(text: string, out: string | undefined, ansi: boolean): void {
  if (out) {
    writeFileSync(resolve(out), ansi ? stripAnsi(text) : text);
    log(c("green", `  ✔ output → ${resolve(out)}`));
  } else {
    stdout.write(text + "\n");
  }
}

/** Render a single report in the requested format. */
function renderReport(report: Report, fmt: Format, verbose: boolean, out: string | undefined): void {
  switch (fmt) {
    case "json": writeOut(JSON.stringify(report, null, 2), out, false); break;
    case "md": writeOut(formatMarkdown(report, verbose), out, false); break;
    case "html": writeOut(formatHtml(report, verbose), out, false); break;
    default: {
      const text = formatReport(report, verbose);
      if (out) { writeFileSync(resolve(out), stripAnsi(text)); log(c("green", `  ✔ report → ${resolve(out)}`)); }
      else stdout.write(text + "\n");
    }
  }
}

async function runSingle(args: Args): Promise<void> {
  if (args.format === "text" || args.format === "md" || args.format === "html") log(c("dim", `\n  fetching ${args.url} …`));
  const report = await inspectUrl(args.url!, { checkLinks: args.links });

  // Budgets → append a category and gate on it.
  let budgetFailed = false;
  if (args.budget) {
    const { budgets, errors } = parseBudgetDetailed(args.budget);
    for (const e of errors) log(c("yellow", `  ▲ ${e}`));
    if (budgets.length) {
      const cat = evaluateBudget(report, budgets);
      report.categories.push(cat);
      budgetFailed = budgetExceeded(cat);
    }
  }

  // Save baseline (write the report as-is).
  if (args.saveBaseline) {
    writeFileSync(resolve(args.saveBaseline), JSON.stringify(report, null, 2));
    log(c("green", `  ✔ baseline → ${resolve(args.saveBaseline)}`));
  }

  renderReport(report, args.format, args.verbose, args.out);

  // Baseline regression gate.
  let regressed = false;
  if (args.baseline) {
    try {
      const base = JSON.parse(readFileSync(resolve(args.baseline), "utf8")) as Report;
      const regs = diffReports(base, report);
      log("");
      log(regs.length ? c("red", formatRegressions(regs)) : c("green", formatRegressions(regs)));
      regressed = regs.length > 0;
    } catch (err) {
      log(c("yellow", `  ▲ could not read baseline ${args.baseline}: ${err instanceof Error ? err.message : String(err)}`));
    }
  }

  if (budgetFailed) log(c("red", `\n  ✗ one or more performance budgets were exceeded`));
  if (args.minGrade && belowGrade(report.grade, args.minGrade)) {
    log(c("red", `\n  ✗ grade ${report.grade} is below the required minimum ${args.minGrade}`));
    exit(1);
  }
  if (budgetFailed || regressed) exit(1);
}

async function runCrawl(args: Args): Promise<void> {
  const quiet = args.format === "json";
  const site = await crawlSite(args.url!, {
    depth: args.depth,
    max: args.max,
    onProgress: quiet ? undefined : (m) => log(c("dim", `  ${m}`)),
  });

  if (args.format === "json") writeOut(JSON.stringify(site, null, 2), args.out, false);
  else if (args.format === "md") writeOut(formatSiteMarkdown(site), args.out, false);
  else {
    const text = formatSiteReport(site);
    if (args.out) { writeFileSync(resolve(args.out), text); log(c("green", `  ✔ report → ${resolve(args.out)}`)); }
    else stdout.write(text + "\n");
  }

  if (args.minGrade && belowGrade(site.averageGrade, args.minGrade)) {
    log(c("red", `\n  ✗ site-average grade ${site.averageGrade} is below the required minimum ${args.minGrade}`));
    exit(1);
  }
}

async function runBatch(args: Args): Promise<void> {
  const raw = readFileSync(resolve(args.input!), "utf8");
  const urls = raw.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
  if (urls.length === 0) { log(c("red", "  ✗ no URLs found in the input file")); exit(2); return; }

  const reports: Report[] = [];
  for (const u of urls) {
    if (args.format !== "json") log(c("dim", `  auditing ${u} …`));
    try { reports.push(await inspectUrl(u, { checkLinks: args.links })); }
    catch (err) { log(c("yellow", `  ▲ ${u}: ${err instanceof Error ? err.message : String(err)}`)); }
  }

  const entries = reports.map((r) => ({ url: r.url, score: r.score, grade: r.grade }));
  if (args.format === "json") writeOut(JSON.stringify(reports, null, 2), args.out, false);
  else if (args.format === "md") {
    const sorted = [...entries].sort((a, b) => b.score - a.score);
    const md = ["## ◆ lacspace-inspect — batch leaderboard", "", "| # | Grade | Score | URL |", "| ---: | :---: | ---: | --- |",
      ...sorted.map((e, i) => `| ${i + 1} | \`${e.grade}\` | ${e.score} | ${e.url} |`)].join("\n");
    writeOut(md, args.out, false);
  } else {
    const text = formatLeaderboard(entries);
    if (args.out) { writeFileSync(resolve(args.out), text); log(c("green", `  ✔ report → ${resolve(args.out)}`)); }
    else stdout.write(text + "\n");
  }

  if (args.minGrade) {
    const worst = entries.reduce<Grade>((w, e) => (e.grade > w ? e.grade : w), "A");
    if (belowGrade(worst, args.minGrade)) {
      log(c("red", `\n  ✗ a page graded ${worst} is below the required minimum ${args.minGrade}`));
      exit(1);
    }
  }
}

async function main(): Promise<void> {
  const args = parseArgs(argv.slice(2));
  if (args.version) { stdout.write(version() + "\n"); return; }
  if (args.help || (!args.url && !args.input)) { stdout.write(HELP + "\n"); return; }
  if (args.minGrade && !["A", "B", "C", "D"].includes(args.minGrade)) {
    log(c("red", `\n✗ --min-grade must be one of A, B, C, D\n`));
    exit(2);
    return;
  }

  if (args.input) await runBatch(args);
  else if (args.crawl) await runCrawl(args);
  else await runSingle(args);
}

main().catch((err: unknown) => {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
});
