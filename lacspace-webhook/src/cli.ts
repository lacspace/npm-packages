import { readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdout, stderr, argv, exit } from "node:process";
import { createReceiver } from "./receiver.js";
import type { ReceiverOptions, ForwardResult } from "./receiver.js";
import { replayRequests, parseFilter, parseRewrite, matchFilter } from "./replay.js";
import type { ReplayOptions, Rewrite } from "./replay.js";
import { parseCaptureFile, serializeCapture } from "./capture.js";
import type { CapturedRequest } from "./capture.js";
import type { SignatureScheme } from "./verify.js";
import { normalizeRules } from "./rules.js";
import type { Rule } from "./rules.js";
import { toCurl } from "./curl.js";
import { formatCapture, summaryLine, c } from "./format.js";

const log = (s = ""): void => void stderr.write(s + "\n");

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
    return pkg.version ?? "0.2.0";
  } catch {
    return "0.2.0";
  }
}

interface Args {
  command?: string;
  positionals: string[];
  port?: number;
  path?: string;
  save?: string;
  forwards: string[];
  retry?: number;
  status?: number;
  body?: string;
  delay?: number;
  secret?: string;
  verify?: SignatureScheme;
  header?: string;
  headers: string[];
  rules?: string;
  ui: boolean;
  to?: string;
  index?: number;
  filter?: string;
  setBody?: string;
  rewrites: string[];
  expectStatus?: number;
  expectContains?: string;
  curl: boolean;
  base?: string;
  help: boolean;
  version: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = { positionals: [], forwards: [], headers: [], rewrites: [], ui: false, curl: false, help: false, version: false };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--port" || arg === "-p") a.port = parseInt(next(), 10);
    else if (arg === "--path") a.path = next();
    else if (arg === "--save") a.save = next();
    else if (arg === "--forward") a.forwards.push(next());
    else if (arg === "--retry") a.retry = parseInt(next(), 10);
    else if (arg === "--status") a.status = parseInt(next(), 10);
    else if (arg === "--body") a.body = next();
    else if (arg === "--delay") a.delay = parseInt(next(), 10);
    else if (arg === "--secret") a.secret = next();
    else if (arg === "--verify") a.verify = next() as SignatureScheme;
    else if (arg === "--header") { const v = next(); a.header = v; a.headers.push(v); }
    else if (arg === "--rules") a.rules = next();
    else if (arg === "--ui") a.ui = true;
    else if (arg === "--to") a.to = next();
    else if (arg === "--index" || arg === "-i") a.index = parseInt(next(), 10);
    else if (arg === "--filter") a.filter = next();
    else if (arg === "--set-body") a.setBody = next();
    else if (arg === "--rewrite") a.rewrites.push(next());
    else if (arg === "--expect-status") a.expectStatus = parseInt(next(), 10);
    else if (arg === "--expect-contains") a.expectContains = next();
    else if (arg === "--curl") a.curl = true;
    else if (arg === "--base") a.base = next();
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg === "-v" || arg === "--version") a.version = true;
    else if (!arg.startsWith("-")) {
      if (a.command === undefined) a.command = arg;
      else a.positionals.push(arg);
    }
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-webhook"))} ${c("dim", "— capture, inspect, verify, mock & replay webhooks, locally")}

${c("bold", "Usage")}
  npx lacspace-webhook listen [options]
  npx lacspace-webhook replay <capture.ndjson> --to <url> [options]
  npx lacspace-webhook list <capture.ndjson> [--curl [--index n]]

${c("bold", "listen")} ${c("dim", "— start a local receiver (runs until Ctrl-C)")}
      --port <n>          Port to listen on (default 4000)
      --path <path>       Only accept this path (default: any path)
      --ui                Serve a live web inspector at /__inspector (SSE)
      --save <file>       Append each request to an NDJSON file
      --forward <url>     Forward to a local URL. Repeat or comma-list for fan-out.
      --retry <n>         Retry a failed forward n times with backoff
      --rules <file>      JSON mock rules: match → custom status/headers/body/delay
      --status <n>        Default response status (default 200)
      --body <text>       Default response body (default {"ok":true})
      --delay <ms>        Delay before the default/mock-default response
      --secret <key>      Secret for signature verification
      --verify <scheme>   auto | github | stripe | shopify | slack | svix | hmac-sha256 | sha1 | paypal
      --header <name>     Signature header for hmac-sha256/sha1 (default X-Signature)

${c("bold", "replay")} ${c("dim", "— re-send captured requests to a target")}
      --to <url>          Target base URL (required)
  -i, --index <n>         Replay only record #n (default: all, in order)
      --delay <ms>        Wait between requests
      --filter <expr>     Only replay matches, e.g. "method=POST,path=/x"
      --header "K: V"     Override/add a header (repeatable)
      --set-body <text>   Replace the body of every request
      --rewrite "a=>b"    Find/replace in the body (repeatable)
      --expect-status <n> CI assert: response status must equal n (exit 1 on mismatch)
      --expect-contains <s> CI assert: response body must contain s

${c("bold", "list")} ${c("dim", "— summarize a capture file, or export as curl")}
      --curl              Print a ready-to-run curl for each record
  -i, --index <n>         With --curl: only record #n
      --base <url>        Base URL for the curl target (default http://localhost:4000)

${c("bold", "General")}
  -h, --help              Show this help
  -v, --version           Print version

${c("bold", "Examples")}
  npx lacspace-webhook listen --ui --save hooks.ndjson
  npx lacspace-webhook listen --forward http://localhost:3000/api,http://localhost:3100/api --retry 2
  npx lacspace-webhook listen --secret whsec_… --verify auto
  npx lacspace-webhook listen --rules rules.json
  npx lacspace-webhook list hooks.ndjson --curl --index 0
  npx lacspace-webhook replay hooks.ndjson --to http://localhost:3000 --filter method=POST --expect-status 200

${c("dim", "Local-only: it binds to your machine. To receive webhooks from a public")}
${c("dim", "service, pair it with a tunnel like cloudflared or ngrok.")}
`;

function loadRules(file: string): Rule[] {
  const text = readFileSync(resolve(file), "utf8");
  return normalizeRules(JSON.parse(text));
}

function cmdListen(args: Args): void {
  const port = args.port ?? 4000;
  const opts: ReceiverOptions = {};
  if (args.path) opts.path = args.path;
  if (args.forwards.length) opts.forward = args.forwards;
  if (args.retry !== undefined && !Number.isNaN(args.retry)) opts.forwardRetry = args.retry;
  if (args.status !== undefined && !Number.isNaN(args.status)) opts.status = args.status;
  if (args.body !== undefined) opts.body = args.body;
  if (args.delay !== undefined && !Number.isNaN(args.delay)) opts.delay = args.delay;
  if (args.secret) opts.secret = args.secret;
  if (args.verify) opts.verify = args.verify;
  if (args.header) opts.signatureHeader = args.header;
  if (args.ui) opts.ui = true;
  if (args.rules) {
    try {
      opts.rules = loadRules(args.rules);
    } catch (err) {
      log(c("red", `\n✗ could not load rules: ${(err as Error).message}\n`));
      exit(1);
    }
  }

  let count = 0;
  const savePath = args.save ? resolve(args.save) : undefined;

  opts.onRequest = (record, verify): void => {
    count++;
    log("");
    log(c("dim", `── #${count} ──`));
    log(formatCapture(record, verify));
    if (savePath) {
      try {
        appendFileSync(savePath, serializeCapture(record) + "\n");
      } catch (err) {
        log(c("red", `  ✗ could not save: ${(err as Error).message}`));
      }
    }
  };

  opts.onForward = (_record, results: ForwardResult[]): void => {
    for (const r of results) {
      const mark = r.ok ? c("green", "✔") : c("red", "✗");
      const status = r.status !== undefined ? c(r.ok ? "green" : "red", String(r.status)) : c("red", r.error ?? "failed");
      const attempts = r.attempts > 1 ? c("dim", ` (${r.attempts} attempts)`) : "";
      log(`  ${mark} ${c("cyan", "⇄")} ${c("dim", r.target)} → ${status}${attempts}`);
    }
  };

  const { server, close } = createReceiver(opts);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") log(c("red", `\n✗ Port ${port} is already in use. Try --port <other>.\n`));
    else log(c("red", `\n✗ ${err.message}\n`));
    exit(1);
  });

  server.listen(port, () => {
    log(`\n${c("bold", c("magenta", "◆ lacspace-webhook"))} ${c("dim", "— listening")}`);
    log(`  ${c("green", "▶")} ${c("bold", `http://localhost:${port}${args.path ?? ""}`)}`);
    if (args.ui) log(`  ${c("magenta", "◆")} ${c("bold", `http://localhost:${port}/__inspector`)} ${c("dim", "— live inspector")}`);
    if (args.forwards.length) log(`  ${c("cyan", "⇄")} ${c("dim", `forwarding → ${args.forwards.join(", ")}`)}`);
    if (args.retry) log(`  ${c("cyan", "↻")} ${c("dim", `retry ${args.retry}× on forward failure`)}`);
    if (opts.rules) log(`  ${c("cyan", "⚑")} ${c("dim", `${opts.rules.length} mock rule${opts.rules.length === 1 ? "" : "s"} active`)}`);
    if (args.verify) log(`  ${c("cyan", "⚿")} ${c("dim", `verifying ${args.verify} signatures`)}`);
    if (savePath) log(`  ${c("cyan", "▤")} ${c("dim", `saving → ${savePath}`)}`);
    log(c("dim", "\n  Point a webhook (or curl) at the URL above. Ctrl-C to stop.\n"));
  });

  process.once("SIGINT", () => {
    log(c("dim", `\n  stopping… captured ${count} request${count === 1 ? "" : "s"}.\n`));
    void close().then(() => exit(0));
  });
}

function loadRecords(file: string): CapturedRequest[] {
  const text = readFileSync(resolve(file), "utf8");
  const records = parseCaptureFile(text);
  if (records.length === 0) throw new Error(`No captured requests in ${file}`);
  return records;
}

async function cmdReplay(args: Args): Promise<void> {
  const file = args.positionals[0];
  if (!file) throw new Error("replay needs a <capture.ndjson> file");
  if (!args.to) throw new Error("replay needs --to <url>");

  let records = loadRecords(file);
  if (args.index !== undefined && !Number.isNaN(args.index)) {
    const rec = records[args.index];
    if (!rec) throw new Error(`--index ${args.index} is out of range (0..${records.length - 1})`);
    records = [rec];
  }

  const opts: ReplayOptions = { to: args.to };
  if (args.delay !== undefined && !Number.isNaN(args.delay)) opts.delay = args.delay;
  if (args.filter) opts.filter = parseFilter(args.filter);
  if (args.retry !== undefined && !Number.isNaN(args.retry)) opts.retry = args.retry;
  if (args.setBody !== undefined) opts.setBody = args.setBody;
  if (args.rewrites.length) opts.rewrite = args.rewrites.map(parseRewrite) as Rewrite[];
  if (args.expectStatus !== undefined && !Number.isNaN(args.expectStatus)) opts.expectStatus = args.expectStatus;
  if (args.expectContains !== undefined) opts.expectContains = args.expectContains;
  if (args.headers.length) {
    const overrides: Record<string, string> = {};
    for (const h of args.headers) {
      const idx = h.indexOf(":");
      if (idx === -1) continue;
      overrides[h.slice(0, idx).trim()] = h.slice(idx + 1).trim();
    }
    if (Object.keys(overrides).length) opts.headers = overrides;
  }

  const doAssert = opts.expectStatus !== undefined || opts.expectContains !== undefined;
  log(`\n${c("bold", c("magenta", "◆ lacspace-webhook"))} ${c("dim", `— replaying → ${args.to}`)}\n`);

  const results = await replayRequests(records, opts);
  // Results align to the (optionally filtered) subset — mirror that for labels.
  const shown = opts.filter ? records.filter((rec) => matchFilter(rec, opts.filter)) : records;
  let failures = 0;
  results.forEach((r, i) => {
    const rec = shown[i] ?? records[i] ?? records[0]!;
    const httpOk = r.status >= 200 && r.status < 400;
    const pass = r.ok !== undefined ? r.ok : httpOk;
    if (doAssert && r.ok === false) failures++;
    const mark = pass ? c("green", "✔") : c("red", "✗");
    const attempts = r.attempts && r.attempts > 1 ? c("dim", ` (${r.attempts} attempts)`) : "";
    const reason = r.reason ? c("red", ` — ${r.reason}`) : "";
    log(`  ${mark} ${c("dim", String(i).padStart(3))} ${rec.method.padEnd(6)} ${rec.path.slice(0, 40).padEnd(40)} ${c(pass ? "green" : "red", String(r.status))}${attempts}${reason}`);
  });
  if (results.length === 0) log(c("dim", "  (no records matched the filter)"));
  log("");

  if (doAssert && failures > 0) {
    log(c("red", `✗ ${failures} assertion${failures === 1 ? "" : "s"} failed.\n`));
    exit(1);
  }
}

function cmdList(args: Args): void {
  const file = args.positionals[0];
  if (!file) throw new Error("list needs a <capture.ndjson> file");
  const records = loadRecords(file);

  if (args.curl) {
    const base = args.base;
    const which = args.index !== undefined && !Number.isNaN(args.index) ? [records[args.index]] : records;
    if (args.index !== undefined && !which[0]) throw new Error(`--index ${args.index} is out of range (0..${records.length - 1})`);
    which.forEach((rec, i) => {
      if (!rec) return;
      if (which.length > 1) log(c("dim", `# ${i}  ${rec.method} ${rec.path}`));
      stdout.write(toCurl(rec, base ? { base } : {}) + "\n");
      if (which.length > 1) log("");
    });
    return;
  }

  log(`\n${c("bold", c("magenta", "◆ lacspace-webhook"))} ${c("dim", `— ${records.length} captured request${records.length === 1 ? "" : "s"} in ${file}`)}\n`);
  log(`${c("dim", "  #   method path                         content-type                       bytes  time")}`);
  records.forEach((r, i) => log("  " + summaryLine(r, i)));
  log("");
}

async function main(): Promise<void> {
  const args = parseArgs(argv.slice(2));
  if (args.version) { stdout.write(version() + "\n"); return; }
  if (args.help || !args.command) { stdout.write(HELP + "\n"); return; }

  switch (args.command) {
    case "listen": cmdListen(args); return;
    case "replay": await cmdReplay(args); return;
    case "list": cmdList(args); return;
    default:
      log(c("red", `\n✗ Unknown command "${args.command}". Try --help.\n`));
      exit(1);
  }
}

main().catch((err: unknown) => { log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`)); exit(1); });
