import { stdout, stderr, argv, exit } from "node:process";
import { writeFileSync } from "node:fs";
import { explainCron } from "./explain.js";
import { nextRuns, prevRuns, runsBetween, overlaps, dstWarnings } from "./schedule.js";
import type { DstWarning } from "./schedule.js";
import { describeRelative, toICS } from "./format.js";
import { isValidSchedule, CronError } from "./parse.js";

const VERSION = "0.2.0";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");

interface Args {
  positional: string[];
  next: number;
  prev: number;
  tz?: string;
  from?: string;
  to?: string;
  seed?: string;
  countBetween: boolean;
  relative: boolean;
  ics: boolean;
  icsFile?: string;
  json: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    positional: [], next: 5, prev: 0, countBetween: false,
    relative: false, ics: false, json: false, help: false, version: false,
  };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const nextVal = (): string => list[++i] ?? "";
    if (arg === "--next" || arg === "-n") a.next = Number(nextVal());
    else if (arg === "--prev" || arg === "-p") a.prev = Number(nextVal());
    else if (arg === "--tz" || arg === "-t") a.tz = nextVal();
    else if (arg === "--from") a.from = nextVal();
    else if (arg === "--to") a.to = nextVal();
    else if (arg === "--seed") a.seed = nextVal();
    else if (arg === "--count-between") a.countBetween = true;
    else if (arg === "--relative" || arg === "-r") a.relative = true;
    else if (arg === "--ics") {
      a.ics = true;
      const peek = list[i + 1];
      if (peek && !peek.startsWith("-") && /\.ics$/i.test(peek)) a.icsFile = list[++i];
    } else if (arg === "--json") a.json = true;
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (!arg.startsWith("-")) a.positional.push(arg);
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-cron"))} ${c("dim", "— explain, validate & preview cron expressions")}

${c("bold", "Usage")}
  npx lacspace-cron "<expr>" [options]
  npx lacspace-cron compare "<a>" "<b>" [options]

${c("bold", "Options")}
  -n, --next <n>       How many upcoming run times to show (default 5)
  -p, --prev <n>       Also show the previous n run times (before --from/now)
  -t, --tz <IANA>      Timezone for run times (e.g. Asia/Kathmandu). Default: host tz
      --from <ISO>     Compute runs from this instant instead of now
      --to <ISO>       With --from: list every run in the [from, to] window
      --count-between  With --from/--to: print just the count of runs
  -r, --relative       Annotate each run with a relative time ("in 3 hours")
      --seed <str>     Seed for Jenkins-style H tokens (default: the expression)
      --ics [file.ics] Emit an iCalendar (.ics) of the next N runs (stdout or file)
      --json           Machine-readable JSON output
  -h, --help           Show this help
  -v, --version        Print the version

${c("bold", "Supported syntax")}
  5-field  ${c("dim", "min hour day-of-month month day-of-week")}
  6-field  ${c("dim", "sec min hour day-of-month month day-of-week")}
  ${c("dim", "* , - / ? ranges, steps, lists · JAN-DEC · SUN-SAT (7=Sun)")}
  ${c("dim", "day tokens: L  L-3  LW  15W (dom) · 5L  5#3 / FRI#3 (dow)")}
  ${c("dim", "hashed:  H  H(0-30)  H/15   ·   interval:  @every 90s / 2h30m")}
  ${c("dim", "macros:  @yearly @monthly @weekly @daily @hourly")}
  ${c("dim", "not supported: @reboot")}

${c("bold", "Examples")}
  npx lacspace-cron "0 9 * * 1-5" --relative
  npx lacspace-cron "0 0 L * *"                 ${c("dim", "# last day of the month")}
  npx lacspace-cron "0 9 * * 5L"                ${c("dim", "# last Friday")}
  npx lacspace-cron "H H(0-6) * * *" --seed my-job
  npx lacspace-cron "@every 90s" --next 4
  npx lacspace-cron "0 3 * * *" --from 2026-01-01 --to 2026-01-31 --count-between
  npx lacspace-cron "0 9 * * 1-5" --ics runs.ics
  npx lacspace-cron compare "0 * * * *" "*/15 * * * *"
`;

function hostTz(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
}

function formatInTz(date: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hour12: false, weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  return fmt.format(date);
}

function parseDateArg(raw: string, label: string): Date {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    log(c("red", `\n✗ Invalid ${label} date: "${raw}"\n`));
    exit(1);
  }
  return d;
}

function fail(msg: string, json: boolean, extra: Record<string, unknown> = {}): never {
  if (json) stdout.write(JSON.stringify({ valid: false, error: msg, ...extra }) + "\n");
  else log(c("red", `\n✗ ${msg}\n`));
  exit(1);
}

function runLine(d: Date, tz: string, relative: boolean, ref: Date): string {
  const rel = relative ? `  ${c("yellow", describeRelative(d, ref))}` : "";
  return `    ${c("green", "→")} ${formatInTz(d, tz)}  ${c("dim", d.toISOString())}${rel}`;
}

function printDst(warnings: DstWarning[]): void {
  if (!warnings.length) return;
  log(`  ${c("yellow", `⚠ DST warnings (${warnings.length})`)} ${c("dim", "· next 12 months")}`);
  for (const w of warnings.slice(0, 8)) {
    const label = w.kind === "skipped"
      ? c("red", "skipped") + c("dim", " — this local time never happens; the run is dropped")
      : c("yellow", "repeated") + c("dim", " — this local time happens twice; fires on the first");
    log(`    ${c("dim", w.local)}  ${label}`);
  }
  if (warnings.length > 8) log(`    ${c("dim", `…and ${warnings.length - 8} more`)}`);
  log("");
}

function runCompare(a: Args): void {
  const [aExpr, bExpr] = [a.positional[1], a.positional[2]];
  if (!aExpr || !bExpr) fail('compare needs two expressions: compare "<a>" "<b>"', a.json);
  const tz = a.tz ?? hostTz();
  const from = a.from ? parseDateArg(a.from, "--from") : new Date();
  const seedOpt = a.seed === undefined ? {} : { seed: a.seed };

  for (const e of [aExpr!, bExpr!]) {
    if (!isValidSchedule(e, seedOpt)) {
      try { explainCron(e, seedOpt); } catch (err) { fail((err as Error).message, a.json); }
    }
  }

  let result;
  try {
    const opts: { from: Date; tz: string; seed?: string } = { from, tz };
    if (a.seed !== undefined) opts.seed = a.seed;
    result = overlaps(aExpr!, bExpr!, opts);
  } catch (err) {
    fail(err instanceof CronError ? err.message : String(err), a.json);
  }

  if (a.json) {
    stdout.write(JSON.stringify({
      valid: true,
      compare: [aExpr, bExpr],
      overlaps: result!.overlaps,
      next: result!.next ? result!.next.toISOString() : null,
      checked: result!.checked,
      tz,
    }) + "\n");
    return;
  }

  log(`\n${c("bold", c("magenta", "◆ lacspace-cron compare"))}`);
  log(`  ${c("cyan", "A")} ${c("dim", aExpr!)}  →  ${explainCron(aExpr!, seedOpt)}`);
  log(`  ${c("cyan", "B")} ${c("dim", bExpr!)}  →  ${explainCron(bExpr!, seedOpt)}\n`);
  if (result!.overlaps && result!.next) {
    log(`  ${c("green", "✓ they overlap")} ${c("dim", `· ${tz}`)}`);
    log(`    ${c("green", "→")} ${formatInTz(result!.next, tz)}  ${c("dim", result!.next.toISOString())}\n`);
  } else {
    log(`  ${c("yellow", "✗ no common run found")} ${c("dim", `within the search window (${result!.checked} instants checked)`)}\n`);
  }
}

function main(): void {
  const args = parseArgs(argv.slice(2));
  if (args.version) { stdout.write(VERSION + "\n"); return; }
  if (args.help || args.positional.length === 0) { stdout.write(HELP + "\n"); return; }

  if (args.positional[0] === "compare") { runCompare(args); return; }

  const expr = args.positional[0]!;
  const tz = args.tz ?? hostTz();
  const seedOpt = args.seed === undefined ? {} : { seed: args.seed };

  const from = args.from ? parseDateArg(args.from, "--from") : undefined;
  const to = args.to ? parseDateArg(args.to, "--to") : undefined;
  const ref = from ?? new Date();

  if (!isValidSchedule(expr, seedOpt)) {
    try { explainCron(expr, seedOpt); } catch (err) { fail((err as Error).message, args.json); }
  }

  let description: string;
  try {
    description = explainCron(expr, seedOpt);
  } catch (err) {
    fail(err instanceof CronError ? err.message : String(err), args.json, { expression: expr });
  }

  let warnings: DstWarning[] = [];
  try {
    warnings = dstWarnings(expr, args.seed === undefined ? { from: ref, tz } : { from: ref, tz, seed: args.seed });
  } catch { /* non-fatal: DST inspection is best-effort */ }

  // --- .ics export -------------------------------------------------------
  if (args.ics) {
    let ics: string;
    try {
      const opts: { count: number; from?: Date; tz: string; seed?: string } = {
        count: Math.max(1, args.next || 5), tz,
      };
      if (from) opts.from = from;
      if (args.seed !== undefined) opts.seed = args.seed;
      ics = toICS(expr, opts);
    } catch (err) {
      fail(err instanceof CronError ? err.message : String(err), args.json);
    }
    if (args.icsFile) {
      writeFileSync(args.icsFile, ics!);
      log(`\n${c("green", "✓")} wrote ${c("bold", args.icsFile)} ${c("dim", `(${Math.max(1, args.next || 5)} events)`)}\n`);
    } else {
      stdout.write(ics!);
    }
    return;
  }

  // --- windowed runs (--from + --to) ------------------------------------
  if (to) {
    const fromWin = from ?? new Date();
    let runs: Date[];
    try {
      runs = runsBetween(expr, fromWin, to, args.seed === undefined ? { tz } : { tz, seed: args.seed });
    } catch (err) {
      fail(err instanceof CronError ? err.message : String(err), args.json);
    }
    if (args.json) {
      stdout.write(JSON.stringify({
        valid: true, expression: expr, description,
        from: fromWin.toISOString(), to: to.toISOString(),
        count: runs!.length,
        ...(args.countBetween ? {} : { runs: runs!.map((d) => d.toISOString()) }),
        ...(warnings.length ? { dst: warnings } : {}),
      }) + "\n");
      return;
    }
    log(`\n${c("bold", c("magenta", "◆ lacspace-cron"))}  ${c("dim", expr)}`);
    log(`  ${c("cyan", description)}\n`);
    if (args.countBetween) {
      log(`  ${c("bold", String(runs!.length))} ${c("dim", `run${runs!.length === 1 ? "" : "s"} between ${fromWin.toISOString()} and ${to.toISOString()}`)}\n`);
    } else {
      log(`  ${c("bold", `${runs!.length}`)} ${c("dim", `run${runs!.length === 1 ? "" : "s"} · ${tz} · window ${fromWin.toISOString()} → ${to.toISOString()}`)}`);
      for (const d of runs!) log(runLine(d, tz, args.relative, ref));
      log("");
      printDst(warnings);
    }
    return;
  }

  // --- previous + next runs ---------------------------------------------
  let previous: Date[] = [];
  let runs: Date[] = [];
  try {
    if (args.prev > 0) {
      const popts: { count: number; tz: string; from?: Date; seed?: string } = { count: args.prev, tz };
      if (from) popts.from = from;
      if (args.seed !== undefined) popts.seed = args.seed;
      previous = prevRuns(expr, popts);
    }
    if (args.next > 0) {
      const opts: { count: number; tz: string; from?: Date; seed?: string } = { count: args.next, tz };
      if (from) opts.from = from;
      if (args.seed !== undefined) opts.seed = args.seed;
      runs = nextRuns(expr, opts);
    }
  } catch (err) {
    fail(err instanceof CronError ? err.message : String(err), args.json, { expression: expr });
  }

  if (args.json) {
    stdout.write(JSON.stringify({
      valid: true,
      expression: expr,
      description,
      ...(previous.length ? { prev: previous.map((d) => d.toISOString()) } : {}),
      next: runs.map((d) => d.toISOString()),
      ...(warnings.length ? { dst: warnings } : {}),
    }) + "\n");
    return;
  }

  log(`\n${c("bold", c("magenta", "◆ lacspace-cron"))}  ${c("dim", expr)}`);
  log(`  ${c("cyan", description)}\n`);
  if (previous.length) {
    log(`  ${c("bold", `Previous ${previous.length}`)} ${c("dim", `· ${tz}`)}`);
    for (const d of previous) log(runLine(d, tz, args.relative, ref));
    log("");
  }
  if (runs.length) {
    log(`  ${c("bold", `Next ${runs.length}`)} ${c("dim", `run${runs.length === 1 ? "" : "s"} · ${tz}`)}`);
    for (const d of runs) log(runLine(d, tz, args.relative, ref));
    log("");
  }
  printDst(warnings);
}

try {
  main();
} catch (err) {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
}
