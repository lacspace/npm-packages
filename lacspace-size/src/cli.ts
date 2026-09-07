import { stdout, stderr, argv, exit, env, cwd } from "node:process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { analyze, pick } from "./analyze.js";
import type { AnalyzeResult, Metric } from "./analyze.js";
import { parseBudgetSpec, evaluateBudgets, budgetsPass } from "./budget.js";
import type { Budget, BudgetResult } from "./budget.js";
import { saveBaseline, loadBaseline, diffBaseline, exceedsMaxIncrease, parseMaxIncrease } from "./baseline.js";
import type { DiffResult } from "./baseline.js";
import { loadConfig, discoverConfig } from "./config.js";
import { buildJsonReport, toMarkdown, toMarkdownComment, formatSummaryLine, pct } from "./report.js";
import { analyzeCompositionFile } from "./composition.js";
import type { CompositionResult } from "./composition.js";
import { formatSize, formatDelta } from "./humansize.js";

const VERSION = "0.2.0";

const noColor = "NO_COLOR" in env || !stdout.isTTY;
const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m", gray: "\x1b[90m",
};
const c = (k: keyof typeof C, s: string): string => (noColor ? s : `${C[k]}${s}${C.reset}`);
const log = (s = ""): void => void stderr.write(s + "\n");
const out = (s = ""): void => void stdout.write(s + "\n");

interface Args {
  positional: string[];
  metric: Metric;
  max?: string;
  budgets: string[];
  config?: string;
  saveBaseline?: string;
  baseline?: string;
  maxIncrease?: string;
  failOver?: string;
  noConfig: boolean;
  breakdown: boolean;
  summary: boolean;
  top?: number;
  brotli: boolean;
  gzip: boolean;
  includeMaps: boolean;
  includeHidden: boolean;
  includeNodeModules: boolean;
  gzipLevel?: number;
  brotliQuality?: number;
  binary: boolean;
  json: boolean;
  format?: string;
  help: boolean;
  version: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    positional: [], metric: "gzip", budgets: [], brotli: true, gzip: true,
    includeMaps: false, includeHidden: false, includeNodeModules: false,
    noConfig: false, breakdown: false, summary: false,
    binary: false, json: false, help: false, version: false,
  };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const nextVal = (): string => list[++i] ?? "";
    if (arg === "--metric" || arg === "-m") a.metric = nextVal() as Metric;
    else if (arg === "--max") a.max = nextVal();
    else if (arg === "--budget" || arg === "-b") a.budgets.push(nextVal());
    else if (arg === "--config" || arg === "-c") a.config = nextVal();
    else if (arg === "--save-baseline") a.saveBaseline = nextVal();
    else if (arg === "--baseline") a.baseline = nextVal();
    else if (arg === "--max-increase") a.maxIncrease = nextVal();
    else if (arg === "--fail-over") a.failOver = nextVal();
    else if (arg === "--no-config") a.noConfig = true;
    else if (arg === "--breakdown") a.breakdown = true;
    else if (arg === "--summary") a.summary = true;
    else if (arg === "--top") a.top = Number(nextVal());
    else if (arg === "--no-brotli") a.brotli = false;
    else if (arg === "--no-gzip") a.gzip = false;
    else if (arg === "--include-maps") a.includeMaps = true;
    else if (arg === "--include-hidden") a.includeHidden = true;
    else if (arg === "--include-node-modules") a.includeNodeModules = true;
    else if (arg === "--gzip-level") a.gzipLevel = Number(nextVal());
    else if (arg === "--brotli-quality") a.brotliQuality = Number(nextVal());
    else if (arg === "--binary") a.binary = true;
    else if (arg === "--json") a.json = true;
    else if (arg === "-f" || arg === "--format") a.format = nextVal();
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (!arg.startsWith("-")) a.positional.push(arg);
    else { log(c("red", `\n✗ Unknown flag: ${arg}`)); log(c("dim", "  run --help for usage\n")); exit(2); }
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-size"))} ${c("dim", "— build-output & bundle size analyzer (raw · gzip · brotli)")}

${c("bold", "Usage")}
  npx lacspace-size [paths...] [options]

  Paths may be files, directories (walked recursively) or globs (${c("dim", "src/**/*.js")}).
  With no paths it measures ${c("dim", "dist/")} if present, else the current directory.

${c("bold", "Metrics & output")}
  -m, --metric <raw|gzip|brotli>  Metric for %, budgets & diffs (default gzip)
      --top <n>                   Show only the n largest files
      --no-brotli                 Skip the (slower) brotli pass
      --no-gzip                   Skip the gzip pass
      --gzip-level <0-9>          zlib gzip level (default 9)
      --brotli-quality <0-11>     brotli quality (default 11)
      --binary                    Use KiB/MiB (1024) instead of kB/MB (1000)
      --json                      Machine-readable JSON to stdout
      --summary                   One compact status line (files · raw · gzip · Δ)
  -f, --format <md|comment>       Markdown report (${c("dim", "comment")} = tight PR-comment table)
      --breakdown                 Byte composition of a single file (treemap JSON w/ --json)

${c("bold", "Budgets (CI gate — non-zero exit on breach)")}
      --max <size>                Global budget on the total (e.g. 500kb)
  -b, --budget <pat:size>         Per-pattern budget (repeatable), ${c("dim", '"*.js:200kb"')}
  -c, --config <file>             Load metric/max/budgets from a JSON file
      --no-config                 Ignore an auto-discovered ${c("dim", ".sizerc.json")}

${c("bold", "Baseline & regression diff")}
      --save-baseline <file>      Write a JSON snapshot of this run
      --baseline <file>           Compare this run to a saved snapshot
      --max-increase <size|%>     Fail if the total grew past this (e.g. 5kb / 10%)
      --fail-over <size|%>        Alias of --max-increase (CI regression gate)

${c("bold", "File selection")}
      --include-maps              Include .map source maps (skipped by default)
      --include-hidden            Include dotfiles/dot-dirs
      --include-node-modules      Descend into node_modules

  -h, --help                      Show this help
  -v, --version                   Print the version

${c("bold", "Examples")}
  npx lacspace-size dist
  npx lacspace-size dist --metric brotli --top 15
  npx lacspace-size "src/**/*.js" --max 500kb --budget "*.css:50kb"
  npx lacspace-size dist --save-baseline .size.json
  npx lacspace-size dist --baseline .size.json --fail-over 5%
  npx lacspace-size bundle.js --json
  npx lacspace-size dist -f md > size-report.md
  npx lacspace-size dist --baseline .size.json -f comment > comment.md
  npx lacspace-size dist/bundle.js --breakdown
  npx lacspace-size dist/bundle.js --breakdown --json > treemap.json
  npx lacspace-size dist --summary
`;

function fail(msg: string, json: boolean): never {
  if (json) out(JSON.stringify({ ok: false, error: msg }));
  else log(c("red", `\n✗ ${msg}\n`));
  exit(1);
}

function defaultPaths(): string[] {
  return existsSync("dist") ? ["dist"] : ["."];
}

// ---- human table helpers --------------------------------------------------
function padEnd(s: string, w: number): string {
  return s.length >= w ? s : s + " ".repeat(w - s.length);
}
function padStart(s: string, w: number): string {
  return s.length >= w ? s : " ".repeat(w - s.length) + s;
}

function renderHuman(result: AnalyzeResult, a: Args, budgets: BudgetResult[], diff?: DiffResult): void {
  const fmt = (n: number): string => formatSize(n, { binary: a.binary });
  const metric = a.metric;
  const totalMetric = pick(result.total, metric);

  log(`\n${c("bold", c("magenta", "◆ lacspace-size"))}  ${c("dim", `${result.total.files} file${result.total.files === 1 ? "" : "s"} · metric: ${metric}`)}`);

  // File table.
  const shown = a.top && a.top > 0 ? result.files.slice(0, a.top) : result.files;
  const pathW = Math.min(60, Math.max(4, ...shown.map((f) => f.path.length)));
  const header: string[] = [padEnd("File", pathW), padStart("Raw", 10)];
  if (result.withGzip) header.push(padStart("Gzip", 10));
  if (result.withBrotli) header.push(padStart("Brotli", 10));
  header.push(padStart("%", 7));
  log("  " + c("dim", header.join("  ")));
  for (const f of shown) {
    const cells: string[] = [padEnd(truncate(f.path, pathW), pathW), padStart(fmt(f.raw), 10)];
    if (result.withGzip) cells.push(padStart(fmt(f.gzip), 10));
    if (result.withBrotli) cells.push(padStart(fmt(f.brotli), 10));
    cells.push(padStart(pct(pick(f, metric), totalMetric).toFixed(1) + "%", 7));
    const [first, ...rest] = cells;
    log("  " + c("cyan", first!) + "  " + rest.join("  "));
  }
  if (a.top && a.top > 0 && result.files.length > a.top) {
    log("  " + c("dim", `…and ${result.files.length - a.top} more file${result.files.length - a.top === 1 ? "" : "s"}`));
  }

  // Totals line.
  const totalCells: string[] = [padEnd("TOTAL", pathW), padStart(fmt(result.total.raw), 10)];
  if (result.withGzip) totalCells.push(padStart(fmt(result.total.gzip), 10));
  if (result.withBrotli) totalCells.push(padStart(fmt(result.total.brotli), 10));
  totalCells.push(padStart("100%", 7));
  log("  " + c("bold", totalCells.join("  ")));

  // By extension.
  log(`\n  ${c("bold", "By extension")}`);
  for (const e of result.byExtension) {
    const label = padEnd(e.ext, 10);
    const cnt = c("dim", padStart(`×${e.count}`, 5));
    let line = `  ${c("yellow", label)} ${cnt}  raw ${padStart(fmt(e.raw), 10)}`;
    if (result.withGzip) line += `  gzip ${padStart(fmt(e.gzip), 10)}`;
    if (result.withBrotli) line += `  br ${padStart(fmt(e.brotli), 10)}`;
    log(line);
  }

  // Single-bundle ratio hint.
  if (result.total.files === 1 && result.withGzip && result.total.raw > 0) {
    const r = (result.total.gzip / result.total.raw) * 100;
    log(`\n  ${c("dim", `gzip is ${r.toFixed(1)}% of raw (${(100 - r).toFixed(1)}% saved)`)}`);
  }

  // Budgets.
  if (budgets.length) {
    log(`\n  ${c("bold", `Budgets`)} ${c("dim", `· metric: ${metric}`)}`);
    for (const b of budgets) {
      if (b.ok) {
        log(`  ${c("green", "✓")} ${padEnd(b.pattern, 18)} ${c("dim", `${fmt(b.actual)} ≤ ${fmt(b.max)}`)} ${c("dim", `(${b.matched} file${b.matched === 1 ? "" : "s"})`)}`);
      } else {
        log(`  ${c("red", "✗")} ${padEnd(b.pattern, 18)} ${c("red", `${fmt(b.actual)} > ${fmt(b.max)}`)} ${c("yellow", `over by ${fmt(b.over)}`)}`);
      }
    }
  }

  // Diff.
  if (diff) {
    const arrow = diff.delta > 0 ? c("red", "▲") : diff.delta < 0 ? c("green", "▼") : c("dim", "▪");
    log(`\n  ${c("bold", "Change vs baseline")} ${c("dim", `· metric: ${diff.metric}`)}`);
    log(`  ${arrow} total ${signColor(diff.delta, formatDelta(diff.delta, { binary: a.binary }))} ${c("dim", `(${diff.percent >= 0 ? "+" : ""}${diff.percent.toFixed(2)}%)  ${fmt(diff.before)} → ${fmt(diff.after)}`)}`);
    for (const f of diff.files) {
      if (f.status === "same") continue;
      const mark = f.status === "added" ? c("green", "＋") : f.status === "removed" ? c("red", "－") : f.delta > 0 ? c("red", "▲") : c("green", "▼");
      log(`    ${mark} ${padEnd(truncate(f.path, 50), 50)} ${signColor(f.delta, formatDelta(f.delta, { binary: a.binary }))}`);
    }
  }
  log("");
}

function signColor(delta: number, s: string): string {
  return delta > 0 ? c("red", s) : delta < 0 ? c("green", s) : c("dim", s);
}
function truncate(s: string, w: number): string {
  if (s.length <= w) return s;
  return "…" + s.slice(s.length - (w - 1));
}

const KIND_COLOR: Record<string, keyof typeof C> = {
  code: "cyan", strings: "magenta", comments: "gray", whitespace: "yellow",
};

function renderBreakdown(path: string, comp: CompositionResult, a: Args): void {
  const fmt = (n: number): string => formatSize(n, { binary: a.binary });
  log(`\n${c("bold", c("magenta", "◆ lacspace-size"))} ${c("dim", "breakdown")}  ${c("cyan", path)}`);
  log(`  ${c("dim", `${fmt(comp.totalBytes)} · ${comp.lines} line${comp.lines === 1 ? "" : "s"}`)}`);

  log(`\n  ${c("bold", "Composition")}`);
  const barW = 24;
  for (const s of comp.segments) {
    const filled = Math.round((s.percent / 100) * barW);
    const bar = "█".repeat(filled) + c("gray", "░".repeat(barW - filled));
    log(`  ${c(KIND_COLOR[s.kind] ?? "cyan", padEnd(s.kind, 11))} ${bar} ${padStart(s.percent.toFixed(1) + "%", 6)}  ${c("dim", fmt(s.bytes))}`);
  }

  if (comp.modules.length) {
    log(`\n  ${c("bold", "Top modules")} ${c("dim", "(crude banner split)")}`);
    for (const m of comp.modules.slice(0, 10)) {
      log(`  ${padStart(m.percent.toFixed(1) + "%", 6)}  ${c("dim", padStart(fmt(m.bytes), 10))}  ${truncate(m.name, 50)}`);
    }
  }

  if (comp.topStrings.length) {
    log(`\n  ${c("bold", "Largest strings")}`);
    for (const s of comp.topStrings.slice(0, 5)) {
      log(`  ${c("dim", padStart(fmt(s.bytes), 10))}  L${s.line}  ${c("gray", truncate(JSON.stringify(s.value), 56))}`);
    }
  }
  log("");
}

function main(): void {
  const a = parseArgs(argv.slice(2));
  if (a.version) { out(VERSION); return; }
  if (a.help) { out(HELP); return; }

  if (!["raw", "gzip", "brotli"].includes(a.metric)) fail(`Invalid --metric "${a.metric}" (raw|gzip|brotli)`, a.json);
  if (a.metric === "brotli" && !a.brotli) fail("--metric brotli conflicts with --no-brotli", a.json);
  if (a.metric === "gzip" && !a.gzip) fail("--metric gzip conflicts with --no-gzip", a.json);

  // Assemble budgets from --config (or an auto-discovered .sizerc.json) + --max + --budget.
  const budgetSpecs: Budget[] = [];
  let metric = a.metric;
  const configPath = a.config ?? (a.noConfig ? undefined : discoverConfig(cwd()));
  if (configPath) {
    let cfg;
    try { cfg = loadConfig(configPath); } catch (e) { fail(`Config: ${(e as Error).message}`, a.json); }
    if (cfg!.metric && !argvHas("--metric") && !argvHas("-m")) metric = cfg!.metric;
    if (cfg!.max !== undefined && !a.max) budgetSpecs.push({ pattern: "**", max: cfg!.max });
    budgetSpecs.push(...cfg!.budgets);
  }
  if (a.max) {
    try { budgetSpecs.push(parseBudgetSpec(`**:${a.max}`)); } catch (e) { fail(`--max: ${(e as Error).message}`, a.json); }
  }
  for (const spec of a.budgets) {
    try { budgetSpecs.push(parseBudgetSpec(spec)); } catch (e) { fail(`--budget "${spec}": ${(e as Error).message}`, a.json); }
  }

  const paths = a.positional.length ? a.positional : defaultPaths();

  let result: AnalyzeResult;
  try {
    result = analyze(paths, {
      cwd: cwd(),
      gzip: a.gzip,
      brotli: a.brotli,
      ...(a.gzipLevel !== undefined ? { gzipLevel: a.gzipLevel } : {}),
      ...(a.brotliQuality !== undefined ? { brotliQuality: a.brotliQuality } : {}),
      includeMaps: a.includeMaps,
      includeHidden: a.includeHidden,
      includeNodeModules: a.includeNodeModules,
    });
  } catch (e) {
    fail((e as Error).message, a.json);
  }

  if (result!.files.length === 0) {
    fail(`No files matched: ${paths.join(", ")}`, a.json);
  }

  // Composition breakdown of a single file (short-circuits the normal report).
  if (a.breakdown) {
    const target = result!.files[0]!; // files are sorted largest-first
    let comp: CompositionResult;
    try { comp = analyzeCompositionFile(join(cwd(), target.path)); } catch (e) { fail(`--breakdown: ${(e as Error).message}`, a.json); }
    if (a.json) {
      out(JSON.stringify({ ok: true, path: target.path, ...comp! }, null, 2));
    } else if (a.summary) {
      const top = comp!.segments[0]!;
      out(`${target.path} · ${formatSize(comp!.totalBytes, { binary: a.binary })} · ${comp!.lines} lines · top ${top.kind} ${top.percent}%`);
    } else {
      renderBreakdown(target.path, comp!, a);
    }
    return;
  }

  // Budgets.
  const budgetResults = evaluateBudgets(budgetSpecs, result!.files, metric);
  const budgetsOk = budgetsPass(budgetResults);

  // Baseline diff.
  let diff: DiffResult | undefined;
  let increaseBreached = false;
  if (a.baseline) {
    let base;
    try { base = loadBaseline(a.baseline); } catch (e) { fail(`--baseline: ${(e as Error).message}`, a.json); }
    diff = diffBaseline(result!, base!, metric);
    const increaseSpec = a.maxIncrease ?? a.failOver;
    if (increaseSpec) {
      const flag = a.maxIncrease ? "--max-increase" : "--fail-over";
      let threshold;
      try { threshold = parseMaxIncrease(increaseSpec); } catch (e) { fail(`${flag}: ${(e as Error).message}`, a.json); }
      increaseBreached = exceedsMaxIncrease(diff, threshold!);
    }
  }

  // Save baseline (after measuring; done regardless of output mode).
  if (a.saveBaseline) {
    try { saveBaseline(a.saveBaseline, result!); } catch (e) { fail(`--save-baseline: ${(e as Error).message}`, a.json); }
  }

  // Output.
  const ctx = {
    metric,
    ...(budgetResults.length ? { budgets: budgetResults } : {}),
    ...(diff ? { diff } : {}),
    ...(a.top ? { top: a.top } : {}),
    binary: a.binary,
  };
  if (a.json) {
    const report = buildJsonReport(result!, ctx);
    report.ok = budgetsOk && !increaseBreached;
    if (a.saveBaseline) report.baselineSaved = a.saveBaseline;
    out(JSON.stringify(report, null, 2));
  } else if (a.summary) {
    out(formatSummaryLine(result!, ctx));
    if (a.saveBaseline) log(c("dim", `baseline written to ${a.saveBaseline}`));
  } else if (a.format === "comment") {
    out(toMarkdownComment(result!, ctx));
    if (a.saveBaseline) log(c("dim", `\nBaseline written to ${a.saveBaseline}`));
  } else if (a.format === "md" || a.format === "markdown") {
    out(toMarkdown(result!, ctx));
    if (a.saveBaseline) log(c("dim", `\nBaseline written to ${a.saveBaseline}`));
  } else {
    renderHuman(result!, a, budgetResults, diff);
    if (a.saveBaseline) log(`  ${c("green", "✓")} baseline written to ${c("bold", a.saveBaseline)}\n`);
  }

  // CI exit code.
  if (!budgetsOk || increaseBreached) exit(1);
}

function argvHas(flag: string): boolean {
  return argv.slice(2).includes(flag);
}

try {
  main();
} catch (err) {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
}
