import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdout, stderr, argv, exit } from "node:process";
import { serializeRows } from "lacspace-scraper";
import { runChecks, loadState, saveState, sendWebhook } from "./check.js";
import type { CheckResult, MonitorConfig, Watch, WatchType } from "./types.js";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m" };
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");

const DEFAULT_STATE = ".lacspace-monitor.json";

interface Args {
  urls: string[]; selector?: string; attr?: string; json?: string; type?: WatchType; label?: string;
  config?: string; state: string; webhook?: string; interval?: number;
  format?: "json" | "ndjson" | "csv" | "xlsx"; out?: string; quiet: boolean; help: boolean;
}

function parseDuration(s: string): number | undefined {
  const m = /^(\d+(?:\.\d+)?)\s*(ms|s|m|h|d)?$/.exec(s.trim());
  if (!m) return undefined;
  const n = parseFloat(m[1]!);
  const unit = m[2] ?? "s";
  const mult = { ms: 1, s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit]!;
  return Math.round(n * mult);
}

function parseArgs(list: string[]): Args {
  const a: Args = { urls: [], state: DEFAULT_STATE, quiet: false, help: false };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--selector" || arg === "-s") a.selector = next();
    else if (arg === "--attr") a.attr = next();
    else if (arg === "--json") a.json = next();
    else if (arg === "--feed") a.type = "feed";
    else if (arg === "--text") a.type = "text";
    else if (arg === "--page") a.type = "page";
    else if (arg === "--label") a.label = next();
    else if (arg === "--config") a.config = next();
    else if (arg === "--state") a.state = next();
    else if (arg === "--webhook") a.webhook = next();
    else if (arg === "--interval") a.interval = parseDuration(next());
    else if (arg === "-f" || arg === "--format") a.format = next() as Args["format"];
    else if (arg === "-o" || arg === "--out") a.out = next();
    else if (arg === "--quiet" || arg === "-q") a.quiet = true;
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (!arg.startsWith("-")) a.urls.push(arg);
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-monitor"))} ${c("dim", "— watch pages, APIs & feeds for changes, free")}

${c("bold", "Usage")}
  npx lacspace-monitor <url> [options]
  npx lacspace-monitor --config monitor.json [options]

${c("bold", "What to watch")}
  -s, --selector <css>   Watch a CSS selector's text (add --attr @href for an attribute)
      --json <path>      Watch a JSON API field, e.g. --json data.price
      --feed             Watch an RSS/Atom/JSON feed for new items
      --text             Watch the raw response body
      --page             Watch the whole page's visible text (default)
      --label <text>     A label for reports

${c("bold", "State & alerts")}
      --state <file>     Snapshot store (default ${DEFAULT_STATE})
      --webhook <url>    POST changes to this URL
      --config <file>    A JSON config: { "watches":[…], "webhook", "state" }

${c("bold", "Run")}
      --interval <dur>   Keep checking every <dur> (e.g. 30s, 5m, 1h). Omit = once.
  -q, --quiet            Only print watches that changed
  -f, --format <fmt>     Also write results: json | ndjson | csv | xlsx
  -o, --out <file>       Output file for --format
  -h, --help             Show this help

${c("bold", "Examples")}
  npx lacspace-monitor https://example.com --selector "h1" --label "Homepage"
  npx lacspace-monitor https://api.site/status --json data.status --interval 1m
  npx lacspace-monitor https://blog.site/rss.xml --feed --webhook https://hooks.site/x
  npx lacspace-monitor --config monitor.json --interval 10m

${c("dim", "First run captures a baseline; later runs report what moved. Please keep")}
${c("dim", "intervals sane and respect each site's Terms and robots policy.")}
`;

function reportLine(r: CheckResult): string {
  if (r.error) return `  ${c("red", "✗")} ${r.label} ${c("dim", "— " + r.error)}`;
  if (r.baseline) return `  ${c("dim", "•")} ${c("dim", r.label + " — baseline captured")}`;
  if (r.changed) {
    if (r.type === "feed") {
      const n = r.added?.length ?? 0;
      const lines = (r.added ?? []).slice(0, 5).map((i) => `      ${c("green", "+")} ${c("dim", i)}`).join("\n");
      return `  ${c("yellow", "▲")} ${c("bold", r.label)} ${c("dim", `— ${n} new item${n === 1 ? "" : "s"}`)}\n${lines}`;
    }
    const before = (r.before ?? "").slice(0, 120);
    const after = (r.after ?? "").slice(0, 120);
    return `  ${c("yellow", "▲")} ${c("bold", r.label)} ${c("dim", "changed")}\n      ${c("dim", "before")} ${before}\n      ${c("dim", "after ")} ${c("cyan", after)}`;
  }
  return `  ${c("dim", "·")} ${c("dim", r.label + " — no change")}`;
}

async function runOnce(watches: Watch[], args: Args, cfg: Partial<MonitorConfig>): Promise<CheckResult[]> {
  const stateFile = resolve(args.state ?? cfg.state ?? DEFAULT_STATE);
  const state = loadState(stateFile);
  const opts: { headers?: Record<string, string>; timeoutMs?: number } = {};
  if (cfg.headers) opts.headers = cfg.headers;
  if (cfg.timeoutMs !== undefined) opts.timeoutMs = cfg.timeoutMs;
  const { results, state: nextState } = await runChecks(watches, state, opts);
  saveState(stateFile, nextState);

  for (const r of results) {
    if (args.quiet && !r.changed && !r.error && !r.baseline) continue;
    log(reportLine(r));
  }
  const changed = results.filter((r) => r.changed);
  const errors = results.filter((r) => r.error).length;
  log(`\n  ${c("dim", `${changed.length} changed · ${results.length - changed.length - errors} unchanged · ${errors} error(s)`)}`);

  const webhook = args.webhook ?? cfg.webhook;
  if (webhook && changed.length) {
    const ok = await sendWebhook(webhook, changed);
    log(`  ${ok ? c("green", "✔") : c("red", "✗")} ${c("dim", `webhook ${ok ? "delivered" : "failed"}`)}`);
  }
  if (args.format) {
    const rows = results as unknown as Record<string, unknown>[];
    const { data, binary } = serializeRows(rows, args.format);
    const out = resolve(args.out ?? `monitor-${new Date().toISOString().slice(0, 10)}.${args.format}`);
    writeFileSync(out, binary ? Buffer.from(data as Uint8Array) : (data as string));
    log(`  ${c("green", "✔")} ${c("dim", `results → ${out}`)}`);
  }
  return results;
}

async function main(): Promise<void> {
  const args = parseArgs(argv.slice(2));
  if (args.help || (args.urls.length === 0 && !args.config)) { stdout.write(HELP + "\n"); return; }

  let cfg: Partial<MonitorConfig> = {};
  let watches: Watch[];
  if (args.config) {
    try {
      cfg = JSON.parse(readFileSync(resolve(args.config), "utf8"));
      if (!Array.isArray(cfg.watches) || cfg.watches.length === 0) throw new Error('config needs a non-empty "watches" array.');
      watches = cfg.watches;
    } catch (err) { log(c("red", `\n✗ Could not load --config: ${(err as Error).message}\n`)); exit(1); return; }
  } else {
    watches = args.urls.map((url) => {
      const w: Watch = { url };
      if (args.selector) w.selector = args.selector;
      if (args.attr) w.attr = args.attr;
      if (args.json) { w.path = args.json; w.type = "json"; }
      if (args.type) w.type = args.type;
      if (args.label) w.label = args.label;
      return w;
    });
  }

  log(`\n${c("bold", c("magenta", "◆ lacspace-monitor"))} ${c("dim", `— watching ${watches.length} target${watches.length === 1 ? "" : "s"}`)}\n`);

  if (!args.interval) { await runOnce(watches, args, cfg); return; }

  log(`  ${c("dim", `checking every ${args.interval}ms — Ctrl-C to stop`)}\n`);
  let stop = false;
  process.once("SIGINT", () => { stop = true; log(c("dim", "\n  stopping…\n")); });
  for (;;) {
    log(c("dim", `  ── ${new Date().toLocaleTimeString()} ──`));
    await runOnce(watches, args, cfg);
    if (stop) break;
    await new Promise((r) => setTimeout(r, args.interval));
    if (stop) break;
  }
}

main().catch((err: unknown) => { log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`)); exit(1); });
