import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { env, stdout, stderr, argv, exit } from "node:process";
import { serializeRows } from "lacspace-scraper";
import { runChecks, loadState, saveState } from "./check.js";
import { lineDiff, jsonDiff } from "./core.js";
import { notify } from "./notify.js";
import { appendHistory, readHistory, summarizeHistory } from "./history.js";
import type { CheckResult, MonitorConfig, NotifyChannel, SmtpConfig, Watch, WatchType } from "./types.js";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m" };
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");

const DEFAULT_STATE = ".lacspace-monitor.json";

interface Args {
  urls: string[]; selector?: string; attr?: string; json?: string; type?: WatchType; label?: string;
  header?: string; contains?: string; absent?: string; match?: string; when?: string;
  config?: string; state: string; webhook?: string; interval?: number; history?: string;
  slack?: string; discord?: string; telegram?: string; email?: string; smtp?: string;
  format?: "json" | "ndjson" | "csv" | "xlsx"; out?: string; quiet: boolean; failOnChange: boolean; help: boolean;
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
  const a: Args = { urls: [], state: DEFAULT_STATE, quiet: false, failOnChange: false, help: false };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--selector" || arg === "-s") a.selector = next();
    else if (arg === "--attr") a.attr = next();
    else if (arg === "--json") a.json = next();
    else if (arg === "--feed") a.type = "feed";
    else if (arg === "--text") a.type = "text";
    else if (arg === "--page") a.type = "page";
    else if (arg === "--status") a.type = "status";
    else if (arg === "--response-time") a.type = "response-time";
    else if (arg === "--ssl-expiry") a.type = "ssl-expiry";
    else if (arg === "--availability") a.type = "availability";
    else if (arg === "--header") { a.header = next(); a.type = "header"; }
    else if (arg === "--contains") a.contains = next();
    else if (arg === "--absent") a.absent = next();
    else if (arg === "--match") a.match = next();
    else if (arg === "--when") a.when = next();
    else if (arg === "--label") a.label = next();
    else if (arg === "--config") a.config = next();
    else if (arg === "--state") a.state = next();
    else if (arg === "--webhook") a.webhook = next();
    else if (arg === "--slack") a.slack = next();
    else if (arg === "--discord") a.discord = next();
    else if (arg === "--telegram") a.telegram = next();
    else if (arg === "--email") a.email = next();
    else if (arg === "--smtp") a.smtp = next();
    else if (arg === "--history") a.history = next();
    else if (arg === "--interval") a.interval = parseDuration(next());
    else if (arg === "-f" || arg === "--format") a.format = next() as Args["format"];
    else if (arg === "-o" || arg === "--out") a.out = next();
    else if (arg === "--quiet" || arg === "-q") a.quiet = true;
    else if (arg === "--fail-on-change") a.failOnChange = true;
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (!arg.startsWith("-")) a.urls.push(arg);
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-monitor"))} ${c("dim", "— watch pages, APIs, feeds, status, SSL & more for changes, free")}

${c("bold", "Usage")}
  npx lacspace-monitor <url> [options]
  npx lacspace-monitor --config monitor.json [options]
  npx lacspace-monitor history <changes.ndjson>

${c("bold", "What to watch")}
  -s, --selector <css>   Watch a CSS selector's text (add --attr @href for an attribute)
      --json <path>      Watch a JSON API field, e.g. --json data.price
      --feed             Watch an RSS/Atom/JSON feed for new items
      --text             Watch the raw response body
      --page             Watch the whole page's visible text (default)
      --contains <s>     Alert when text appears/disappears on the page
      --absent <s>       Alert when text is present/absent (watch it stay gone)
      --match <regex>    Alert when a regex starts/stops matching the page
      --status           Watch the HTTP status code
      --header <name>    Watch a response header (e.g. --header etag)
      --response-time    Watch response time in ms (use with --when ">500")
      --ssl-expiry       Watch days until the TLS certificate expires
      --availability     Watch up/down (status < 400 = up)
      --label <text>     A label for reports

${c("bold", "Alert only when… (--when)")}
      --when <rule>      Gate the alert on a condition:
                         increased | decreased | changed | contains:<s> |
                         not-contains:<s> | matches:<regex> | >N | <N | >=N |
                         <=N | ==<v> | !=<v>
                         e.g. price drop: --selector .price --when decreased
                              slow:       --response-time --when ">500"
                              expiring:   --ssl-expiry --when "<14"

${c("bold", "State, history & alerts")}
      --state <file>     Snapshot store (default ${DEFAULT_STATE})
      --history <file>   Append every change to an NDJSON log
      --webhook <url>    POST changes to this URL
      --slack <url>      Slack incoming-webhook URL
      --discord <url>    Discord webhook URL
      --telegram <t>     Telegram <botToken>:<chatId>
      --email <to>       E-mail alerts (needs --smtp; auth via env)
      --smtp <host:port> SMTP server for --email (SMTP_USER/SMTP_PASS/SMTP_FROM/SMTP_SECURE env)
      --config <file>    A JSON config: { "watches":[…], "webhook", "notify", "state", "history" }

${c("bold", "Run")}
      --interval <dur>   Keep checking every <dur> (e.g. 30s, 5m, 1h). Omit = once.
  -q, --quiet            Only print (and only banner) when something changed
      --fail-on-change   Exit non-zero if anything changed (for CI gates)
  -f, --format <fmt>     Also write results: json | ndjson | csv | xlsx
  -o, --out <file>       Output file for --format
  -h, --help             Show this help

${c("bold", "Examples")}
  npx lacspace-monitor https://shop.site/p --selector ".price" --when decreased --slack $HOOK
  npx lacspace-monitor https://api.site/health --status --when "!=200" --interval 1m
  npx lacspace-monitor https://mysite.com --ssl-expiry --when "<14" --email me@x.com --smtp smtp.x.com:587
  npx lacspace-monitor https://site.com --contains "In stock" --history changes.ndjson
  npx lacspace-monitor history changes.ndjson

${c("dim", "First run captures a baseline; later runs report what moved. Please keep")}
${c("dim", "intervals sane and respect each site's Terms and robots policy.")}
`;

function diffPreview(r: CheckResult): string {
  const before = r.before ?? "";
  const after = r.after ?? "";
  if (r.type === "json") {
    const changes = jsonDiff(before, after).slice(0, 4);
    if (changes.length) {
      return changes.map((ch) =>
        `      ${c("dim", ch.path)} ${c("dim", JSON.stringify(ch.before) ?? "")} ${c("dim", "→")} ${c("cyan", JSON.stringify(ch.after) ?? "")}`).join("\n");
    }
  }
  if ((r.type === "page" || r.type === "text") && (before.includes("\n") || after.includes("\n"))) {
    const ops = lineDiff(before, after).filter((o) => o.type !== "same").slice(0, 6);
    if (ops.length) {
      return ops.map((o) =>
        o.type === "add" ? `      ${c("green", "+")} ${c("dim", o.value.slice(0, 100))}`
        : `      ${c("red", "-")} ${c("dim", o.value.slice(0, 100))}`).join("\n");
    }
  }
  return `      ${c("dim", "before")} ${before.slice(0, 120)}\n      ${c("dim", "after ")} ${c("cyan", after.slice(0, 120))}`;
}

function reportLine(r: CheckResult): string {
  if (r.error) return `  ${c("red", "✗")} ${r.label} ${c("dim", "— " + r.error)}`;
  if (r.baseline && !r.alerted) return `  ${c("dim", "•")} ${c("dim", r.label + " — baseline captured")}`;
  if (r.alerted || r.changed) {
    if (r.type === "feed") {
      const n = r.added?.length ?? 0;
      const lines = (r.added ?? []).slice(0, 5).map((i) => `      ${c("green", "+")} ${c("dim", i)}`).join("\n");
      return `  ${c("yellow", "▲")} ${c("bold", r.label)} ${c("dim", `— ${n} new item${n === 1 ? "" : "s"}`)}\n${lines}`;
    }
    const note = r.condition ? `(${r.condition})` : "changed";
    const tag = c("dim", r.baseline ? `${note} · baseline` : note);
    const detail = r.after !== undefined ? `\n${diffPreview(r)}` : "";
    return `  ${c("yellow", "▲")} ${c("bold", r.label)} ${tag}${detail}`;
  }
  return `  ${c("dim", "·")} ${c("dim", r.label + " — no change")}`;
}

function buildChannels(args: Args, cfg: Partial<MonitorConfig>): NotifyChannel[] {
  const channels: NotifyChannel[] = [];
  const webhook = args.webhook ?? cfg.webhook;
  if (webhook) channels.push({ kind: "webhook", url: webhook });
  if (args.slack) channels.push({ kind: "slack", url: args.slack });
  if (args.discord) channels.push({ kind: "discord", url: args.discord });
  if (args.telegram) {
    const idx = args.telegram.lastIndexOf(":");
    if (idx > 0) channels.push({ kind: "telegram", botToken: args.telegram.slice(0, idx), chatId: args.telegram.slice(idx + 1) });
    else log(c("yellow", `  ! --telegram expects <botToken>:<chatId>`));
  }
  if (args.email) {
    const host = args.smtp?.split(":")[0] ?? env.SMTP_HOST;
    const port = Number(args.smtp?.split(":")[1] ?? env.SMTP_PORT ?? 587);
    if (host) {
      const smtp: SmtpConfig = { host, port };
      if (env.SMTP_USER) smtp.user = env.SMTP_USER;
      if (env.SMTP_PASS) smtp.pass = env.SMTP_PASS;
      if (env.SMTP_FROM) smtp.from = env.SMTP_FROM;
      if (env.SMTP_SECURE === "1" || env.SMTP_SECURE === "true" || port === 465) smtp.secure = true;
      channels.push({ kind: "email", to: args.email, smtp });
    } else {
      log(c("yellow", `  ! --email needs --smtp host:port (or SMTP_HOST env)`));
    }
  }
  if (Array.isArray(cfg.notify)) channels.push(...cfg.notify);
  return channels;
}

async function runOnce(watches: Watch[], args: Args, cfg: Partial<MonitorConfig>): Promise<CheckResult[]> {
  const stateFile = resolve(args.state ?? cfg.state ?? DEFAULT_STATE);
  const state = loadState(stateFile);
  const opts: { headers?: Record<string, string>; timeoutMs?: number } = {};
  if (cfg.headers) opts.headers = cfg.headers;
  if (cfg.timeoutMs !== undefined) opts.timeoutMs = cfg.timeoutMs;
  const { results, state: nextState } = await runChecks(watches, state, opts);
  saveState(stateFile, nextState);

  const alerts = results.filter((r) => r.alerted && !r.error);
  const errors = results.filter((r) => r.error).length;

  for (const r of results) {
    if (args.quiet && !r.alerted && !r.error && !r.baseline) continue;
    log(reportLine(r));
  }
  if (!args.quiet || alerts.length || errors) {
    log(`\n  ${c("dim", `${alerts.length} alert${alerts.length === 1 ? "" : "s"} · ${results.length - alerts.length - errors} quiet · ${errors} error(s)`)}`);
  }

  // history log
  const historyFile = args.history ?? cfg.history;
  if (historyFile && alerts.length) {
    appendHistory(resolve(historyFile), alerts);
    log(`  ${c("green", "✔")} ${c("dim", `${alerts.length} logged → ${historyFile}`)}`);
  }

  // notifiers
  const channels = buildChannels(args, cfg);
  if (channels.length && alerts.length) {
    const outcomes = await notify(alerts, channels);
    for (const o of outcomes) {
      log(`  ${o.ok ? c("green", "✔") : c("red", "✗")} ${c("dim", `${o.kind} ${o.ok ? "delivered" : "failed"}`)}`);
    }
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

function runHistory(file: string): void {
  const entries = readHistory(resolve(file));
  const s = summarizeHistory(entries, 12);
  log(`\n${c("bold", c("magenta", "◆ lacspace-monitor history"))} ${c("dim", `— ${file}`)}\n`);
  if (!s.total) { log(c("dim", "  No changes recorded yet.\n")); return; }
  log(`  ${c("bold", String(s.total))} change${s.total === 1 ? "" : "s"} ${c("dim", `from ${s.first?.slice(0, 16).replace("T", " ")} to ${s.last?.slice(0, 16).replace("T", " ")}`)}\n`);
  log(`  ${c("bold", "Busiest watches")}`);
  for (const w of s.byLabel.slice(0, 8)) {
    log(`    ${c("cyan", String(w.count).padStart(4))}  ${w.label} ${c("dim", "· last " + w.last.slice(0, 16).replace("T", " "))}`);
  }
  log(`\n  ${c("bold", "By type")}  ${c("dim", Object.entries(s.byType).map(([k, v]) => `${k}:${v}`).join("  "))}`);
  log(`\n  ${c("bold", "Recent")}`);
  for (const e of s.recent) {
    const what = e.type === "feed" ? `${e.added?.length ?? 0} new` : `${e.before ?? "∅"} → ${e.after ?? "∅"}`;
    log(`    ${c("dim", e.at.slice(0, 16).replace("T", " "))}  ${c("bold", e.label)} ${c("dim", what)}`);
  }
  log("");
}

async function main(): Promise<void> {
  const raw = argv.slice(2);
  if (raw[0] === "history") {
    const file = raw[1];
    if (!file) { log(c("red", "\n✗ Usage: lacspace-monitor history <file.ndjson>\n")); exit(1); return; }
    runHistory(file);
    return;
  }

  const args = parseArgs(raw);
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
      if (args.header) w.header = args.header;
      if (args.contains !== undefined) w.contains = args.contains;
      if (args.absent !== undefined) w.absent = args.absent;
      if (args.match !== undefined) w.match = args.match;
      if (args.when) w.when = args.when;
      if (args.type) w.type = args.type;
      if (args.label) w.label = args.label;
      return w;
    });
  }

  if (!args.quiet) log(`\n${c("bold", c("magenta", "◆ lacspace-monitor"))} ${c("dim", `— watching ${watches.length} target${watches.length === 1 ? "" : "s"}`)}\n`);

  if (!args.interval) {
    const results = await runOnce(watches, args, cfg);
    if (args.failOnChange && results.some((r) => r.alerted)) exit(1);
    return;
  }

  log(`  ${c("dim", `checking every ${args.interval}ms — Ctrl-C to stop`)}\n`);
  let stop = false;
  process.once("SIGINT", () => { stop = true; log(c("dim", "\n  stopping…\n")); });
  for (;;) {
    if (!args.quiet) log(c("dim", `  ── ${new Date().toLocaleTimeString()} ──`));
    await runOnce(watches, args, cfg);
    if (stop) break;
    await new Promise((r) => setTimeout(r, args.interval));
    if (stop) break;
  }
}

main().catch((err: unknown) => { log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`)); exit(1); });
