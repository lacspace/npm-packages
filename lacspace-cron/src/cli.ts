import { stdout, stderr, argv, exit } from "node:process";
import { explainCron } from "./explain.js";
import { nextRuns } from "./schedule.js";
import { isValidCron, CronError } from "./parse.js";

const VERSION = "0.1.0";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");

interface Args {
  expr?: string;
  next: number;
  tz?: string;
  from?: string;
  json: boolean;
  help: boolean;
  version: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = { next: 5, json: false, help: false, version: false };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--next" || arg === "-n") a.next = Number(next());
    else if (arg === "--tz" || arg === "-t") a.tz = next();
    else if (arg === "--from") a.from = next();
    else if (arg === "--json") a.json = true;
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (!arg.startsWith("-") && a.expr === undefined) a.expr = arg;
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-cron"))} ${c("dim", "— explain, validate & preview cron expressions")}

${c("bold", "Usage")}
  npx lacspace-cron "<expr>" [options]

${c("bold", "Options")}
  -n, --next <n>     How many upcoming run times to show (default 5)
  -t, --tz <IANA>    Timezone for run times (e.g. Asia/Kathmandu). Default: host tz
      --from <ISO>   Compute runs from this instant instead of now
      --json         Emit { valid, expression, description, next: [ISO…] }
  -h, --help         Show this help
  -v, --version      Print the version

${c("bold", "Supported syntax")}
  5-field  ${c("dim", "min hour day-of-month month day-of-week")}
  6-field  ${c("dim", "sec min hour day-of-month month day-of-week")}
  ${c("dim", "* , - / ? ranges, steps, lists · JAN-DEC · SUN-SAT (7=Sun)")}
  ${c("dim", "macros: @yearly @monthly @weekly @daily @hourly")}
  ${c("dim", "not supported: L W # modifiers and @reboot")}

${c("bold", "Examples")}
  npx lacspace-cron "0 9 * * 1-5"
  npx lacspace-cron "*/15 * * * *" --next 4
  npx lacspace-cron "0 0 1 * *" --tz America/New_York
  npx lacspace-cron "@daily" --json
`;

function formatInTz(date: Date, tz: string): string {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, hour12: false, weekday: "short",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  });
  return fmt.format(date);
}

function main(): void {
  const args = parseArgs(argv.slice(2));
  if (args.version) { stdout.write(VERSION + "\n"); return; }
  if (args.help || !args.expr) { stdout.write(HELP + "\n"); return; }

  const expr = args.expr;
  const tz = args.tz ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");

  let from: Date | undefined;
  if (args.from) {
    from = new Date(args.from);
    if (Number.isNaN(from.getTime())) {
      log(c("red", `\n✗ Invalid --from date: "${args.from}"\n`));
      exit(1);
      return;
    }
  }

  if (!isValidCron(expr)) {
    // Re-run to surface the specific message.
    try { explainCron(expr); } catch (err) {
      if (args.json) {
        stdout.write(JSON.stringify({ valid: false, expression: expr, error: (err as Error).message }) + "\n");
      } else {
        log(c("red", `\n✗ ${(err as Error).message}\n`));
      }
      exit(1);
      return;
    }
  }

  let description: string;
  let runs: Date[];
  try {
    description = explainCron(expr);
    const opts: { count: number; tz: string; from?: Date } = { count: Math.max(0, args.next || 0), tz };
    if (from) opts.from = from;
    runs = args.next > 0 ? nextRuns(expr, opts) : [];
  } catch (err) {
    const msg = err instanceof CronError ? err.message : String(err);
    if (args.json) {
      stdout.write(JSON.stringify({ valid: false, expression: expr, error: msg }) + "\n");
    } else {
      log(c("red", `\n✗ ${msg}\n`));
    }
    exit(1);
    return;
  }

  if (args.json) {
    stdout.write(JSON.stringify({
      valid: true,
      expression: expr,
      description,
      next: runs.map((d) => d.toISOString()),
    }) + "\n");
    return;
  }

  log(`\n${c("bold", c("magenta", "◆ lacspace-cron"))}  ${c("dim", expr)}`);
  log(`  ${c("cyan", description)}\n`);
  if (runs.length) {
    log(`  ${c("bold", `Next ${runs.length}`)} ${c("dim", `run${runs.length === 1 ? "" : "s"} · ${tz}`)}`);
    for (const d of runs) {
      log(`    ${c("green", "→")} ${formatInTz(d, tz)}  ${c("dim", d.toISOString())}`);
    }
    log("");
  }
}

try {
  main();
} catch (err) {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
}
