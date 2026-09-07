import { stdout, stderr, argv, exit, env } from "node:process";
import { readFileSync, writeFileSync } from "node:fs";
import { assembleRequest, sendRequest, toCurl } from "./request.js";
import type { AssembleOptions, RequestSpec, ResponseRecord, SendOptions } from "./request.js";
import { runHttpFile } from "./runner.js";
import type { RequestRunResult } from "./runner.js";
import { parseEnvJson, parseDotenv, parseKvPairs } from "./vars.js";
import { humanSize, statusColor, prettyJson, paint } from "./format.js";

const VERSION = "0.1.0";
const NO_COLOR = !!env["NO_COLOR"];
const COLOR = !NO_COLOR;

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m",
  red: "\x1b[31m", magenta: "\x1b[35m", blue: "\x1b[34m",
};
const c = (k: keyof typeof C, s: string): string => (COLOR ? `${C[k]}${s}${C.reset}` : s);
const log = (s = ""): void => void stderr.write(s + "\n");

const METHODS = new Set([
  "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "TRACE", "CONNECT",
]);

interface Args {
  positional: string[];
  headers: string[];
  query: string[];
  form: string[];
  jsonKv: string[];
  data?: string;
  json?: string;        // --json '<obj>' body
  jsonOut: boolean;     // --json machine output
  bearer?: string;
  user?: string;
  timeout?: number;
  maxRedirects?: number;
  noRedirect: boolean;
  maxSize?: number;
  out?: string;
  include: boolean;
  verbose: boolean;
  fail: boolean;
  curl: boolean;
  showSecrets: boolean;
  vars: string[];
  envName?: string;
  envFile?: string;
  name?: string;
  help: boolean;
  version: boolean;
}

function parseSize(raw: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(raw.trim());
  if (!m) return Number(raw);
  const n = Number(m[1]);
  const unit = (m[2] ?? "b").toLowerCase();
  const mult = unit === "kb" ? 1024 : unit === "mb" ? 1024 ** 2 : unit === "gb" ? 1024 ** 3 : 1;
  return Math.round(n * mult);
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    positional: [], headers: [], query: [], form: [], jsonKv: [],
    jsonOut: false, noRedirect: false, include: false, verbose: false,
    fail: false, curl: false, showSecrets: false, vars: [], help: false, version: false,
  };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const nextVal = (): string => list[++i] ?? "";
    switch (arg) {
      case "-H": case "--header": a.headers.push(nextVal()); break;
      case "-q": case "--query": a.query.push(nextVal()); break;
      case "--form": a.form.push(nextVal()); break;
      case "-j": a.jsonKv.push(nextVal()); break;
      case "-d": case "--data": a.data = nextVal(); break;
      case "--json": {
        const peek = list[i + 1];
        if (peek !== undefined && (peek.startsWith("{") || peek.startsWith("["))) a.json = nextVal();
        else a.jsonOut = true;
        break;
      }
      case "-b": case "--bearer": a.bearer = nextVal(); break;
      case "-u": case "--user": a.user = nextVal(); break;
      case "--timeout": a.timeout = Number(nextVal()); break;
      case "--max-redirects": a.maxRedirects = Number(nextVal()); break;
      case "--no-redirect": a.noRedirect = true; break;
      case "--max-size": a.maxSize = parseSize(nextVal()); break;
      case "-o": case "--out": a.out = nextVal(); break;
      case "-i": case "--include": a.include = true; break;
      case "-v": case "--verbose": a.verbose = true; break;
      case "--fail": a.fail = true; break;
      case "--curl": a.curl = true; break;
      case "--show-secrets": a.showSecrets = true; break;
      case "--var": a.vars.push(nextVal()); break;
      case "--env": a.envName = nextVal(); break;
      case "--env-file": a.envFile = nextVal(); break;
      case "--name": a.name = nextVal(); break;
      case "-h": case "--help": a.help = true; break;
      case "--version": a.version = true; break;
      default:
        if (arg === "-V") a.version = true;
        else if (!arg.startsWith("-")) a.positional.push(arg);
        break;
    }
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-http"))} ${c("dim", "— a keyless terminal API client + .http file runner")}

${c("bold", "Usage")}
  npx lacspace-http [METHOD] <url> [options]      ${c("dim", "# ad-hoc request")}
  npx lacspace-http run <file.http> [options]     ${c("dim", "# run a .http/.rest file")}

${c("bold", "Request options")}
  -H, --header "K: V"    Add a request header (repeatable)
  -q, --query k=v        Add a query-string param (repeatable)
  -d, --data <str>       Raw request body (@file to read a file, @- for stdin)
      --json '<obj>'     JSON body from a literal object/array + content-type
  -j k=v                 JSON body shorthand (k:=v for a raw JSON value)
      --form k=v         urlencoded form field (repeatable)
  -b, --bearer <token>   Authorization: Bearer <token>
  -u, --user user:pass   HTTP Basic auth
      --timeout <ms>     Abort after ms (default 30000)
      --no-redirect      Do not follow redirects
      --max-redirects N  Follow at most N redirects (default 5)
      --max-size <n>     Cap the response body read (e.g. 10mb, default 10MB)

${c("bold", "Output options")}
  -i, --include          Show response headers
  -v, --verbose          Show the request line, headers and body too
  -o, --out <file>       Write the response body to a file
      --curl             Print the equivalent curl command (secrets masked)
      --show-secrets     Do not mask credentials in --curl / --verbose
      --fail             Exit non-zero on a non-2xx response
      --json             Emit a machine record { status, headers, timeMs, body }

${c("bold", "Runner options (run)")}
      --env <name>       Select an env block from http-client.env.json
      --env-file <path>  Load vars from a .json (needs --env) or .env file
      --var k=v          Set/override a variable (repeatable)
      --name <req>       Run only the request with this # @name

  -h, --help             Show this help
      --version          Print the version

${c("bold", ".http directives")}
  ${c("dim", "# @name login             name a request (for --name and chaining)")}
  ${c("dim", "# @capture tok = body.$.token   grab a value for later requests")}
  ${c("dim", "# @assert status == 200   fail the run if the check fails")}
  ${c("dim", "# @assert body.$.ok == true · header.content-type contains json · time < 800")}

${c("bold", "Examples")}
  npx lacspace-http https://httpbin.org/get
  npx lacspace-http POST https://httpbin.org/post -j name=Ada -j admin:=true
  npx lacspace-http https://api.example.com/me -b "$TOKEN" -i
  npx lacspace-http GET https://httpbin.org/get --curl
  npx lacspace-http run api.http --env dev
  npx lacspace-http run smoke.http --var host=http://localhost:3000
`;

function readStdin(): string {
  try { return readFileSync(0, "utf8"); } catch { return ""; }
}

function resolveDataArg(data: string): string {
  if (data === "@-") return readStdin();
  if (data.startsWith("@")) return readFileSync(data.slice(1), "utf8");
  return data;
}

function fail(msg: string, jsonOut: boolean): never {
  if (jsonOut) stdout.write(JSON.stringify({ ok: false, error: msg }) + "\n");
  else log(c("red", `\n✗ ${msg}\n`));
  exit(1);
}

// ---- ad-hoc request mode --------------------------------------------------

async function runAdHoc(args: Args): Promise<void> {
  let method: string | undefined;
  let url: string | undefined;
  const [p0, p1] = [args.positional[0], args.positional[1]];
  if (p0 && METHODS.has(p0.toUpperCase())) {
    method = p0.toUpperCase();
    url = p1;
  } else {
    url = p0;
  }
  if (!url) fail("a URL is required (see --help)", args.jsonOut);
  if (!/^https?:\/\//i.test(url)) url = "http://" + url;

  const asm: AssembleOptions = {
    headers: args.headers, query: args.query, form: args.form, jsonKv: args.jsonKv,
  };
  if (method) asm.method = method;
  if (args.data !== undefined) asm.data = resolveDataArg(args.data);
  if (args.json !== undefined) asm.json = args.json;
  if (args.bearer !== undefined) asm.bearer = args.bearer;
  if (args.user !== undefined) asm.user = args.user;

  const spec = assembleRequest(url, asm);

  if (args.curl) {
    const curlOpts: { showSecrets: boolean; followRedirects: boolean; maxRedirects?: number } = {
      showSecrets: args.showSecrets, followRedirects: !args.noRedirect,
    };
    if (args.maxRedirects !== undefined) curlOpts.maxRedirects = args.maxRedirects;
    stdout.write(toCurl(spec, curlOpts) + "\n");
    return;
  }

  if (args.verbose) printRequest(spec, args.showSecrets);

  const sendOpts: SendOptions = { followRedirects: !args.noRedirect };
  if (args.timeout !== undefined) sendOpts.timeoutMs = args.timeout;
  if (args.maxSize !== undefined) sendOpts.maxSize = args.maxSize;
  if (args.maxRedirects !== undefined) sendOpts.maxRedirects = args.maxRedirects;

  let rec: ResponseRecord;
  try {
    rec = await sendRequest(spec, sendOpts);
  } catch (err) {
    fail((err as Error).message, args.jsonOut);
  }

  if (args.jsonOut) {
    stdout.write(JSON.stringify({
      status: rec.status,
      statusText: rec.statusText,
      headers: rec.headers,
      timeMs: rec.timeMs,
      size: rec.size,
      url: rec.url,
      redirected: rec.redirected,
      truncated: rec.truncated,
      body: rec.body,
    }) + "\n");
    if (args.fail && !rec.ok) exit(1);
    return;
  }

  printMeta(rec, args.include);

  // Body → file or stdout.
  if (args.out) {
    writeFileSync(args.out, rec.body);
    log(`\n${c("green", "✓")} wrote ${c("bold", args.out)} ${c("dim", `(${humanSize(rec.size)})`)}\n`);
  } else {
    const ct = rec.headers["content-type"];
    if (rec.json !== undefined) {
      stdout.write(prettyJson(rec.json, COLOR && !!stdout.isTTY) + "\n");
    } else {
      stdout.write(rec.body + (rec.body.endsWith("\n") ? "" : "\n"));
    }
    void ct;
  }

  if (args.fail && !rec.ok) exit(1);
}

function printRequest(spec: RequestSpec, showSecrets: boolean): void {
  log(`${c("blue", "→")} ${c("bold", spec.method)} ${spec.url}`);
  for (const [k, v] of spec.headers) {
    let value = v;
    if (!showSecrets && k.toLowerCase() === "authorization") {
      const scheme = v.split(/\s+/)[0] ?? "";
      value = /^(Bearer|Basic)$/i.test(scheme) ? `${scheme} ***` : "***";
    }
    log(`  ${c("dim", k + ":")} ${value}`);
  }
  if (spec.body !== undefined) log(`  ${c("dim", spec.body)}`);
  log("");
}

function printMeta(rec: ResponseRecord, includeHeaders: boolean): void {
  const col = statusColor(rec.status);
  const statusLine = `${rec.status} ${rec.statusText}`.trim();
  const timeCol = rec.timeMs > 1000 ? "yellow" : "dim";
  log(
    `${paint(col, statusLine, COLOR)} ` +
    `${c("dim", "·")} ${c(timeCol as keyof typeof C, rec.timeMs + "ms")} ` +
    `${c("dim", "·")} ${c("dim", humanSize(rec.size))}` +
    (rec.redirected ? ` ${c("dim", `· ${rec.redirectChain.length} redirect(s) → ${rec.url}`)}` : "") +
    (rec.truncated ? ` ${c("yellow", "· body truncated")}` : "") +
    (rec.crossHostRedirect ? ` ${c("yellow", "· crossed host")}` : ""),
  );
  if (includeHeaders) {
    for (const [k, v] of Object.entries(rec.headers)) log(`  ${c("cyan", k)}${c("dim", ":")} ${v}`);
  }
  log("");
}

// ---- .http file runner mode ----------------------------------------------

function loadEnvVars(args: Args): Record<string, string> {
  if (!args.envFile) {
    // Default lookup: http-client.env.json in cwd if --env is given.
    if (args.envName) {
      try {
        const raw = readFileSync("http-client.env.json", "utf8");
        return parseEnvJson(raw, args.envName);
      } catch { /* ignore missing default file */ }
    }
    return {};
  }
  const raw = readFileSync(args.envFile, "utf8");
  if (/\.json$/i.test(args.envFile)) {
    if (!args.envName) throw new Error("--env <name> is required with a JSON env file.");
    return parseEnvJson(raw, args.envName);
  }
  return parseDotenv(raw);
}

async function runFile(args: Args): Promise<void> {
  const file = args.positional[1];
  if (!file) fail("run needs a file: lacspace-http run <file.http>", args.jsonOut);
  let source: string;
  try { source = readFileSync(file, "utf8"); }
  catch (err) { fail(`cannot read ${file}: ${(err as Error).message}`, args.jsonOut); }

  let envVars: Record<string, string>;
  try { envVars = loadEnvVars(args); }
  catch (err) { fail((err as Error).message, args.jsonOut); }

  const runOpts: Parameters<typeof runHttpFile>[1] = {
    env: envVars,
    vars: parseKvPairs(args.vars),
    followRedirects: !args.noRedirect,
  };
  if (args.name !== undefined) runOpts.name = args.name;
  if (args.timeout !== undefined) runOpts.timeoutMs = args.timeout;
  if (args.maxSize !== undefined) runOpts.maxSize = args.maxSize;
  if (args.maxRedirects !== undefined) runOpts.maxRedirects = args.maxRedirects;

  if (!args.jsonOut) {
    log(`\n${c("bold", c("magenta", "◆ lacspace-http run"))}  ${c("dim", file)}`);
    log("");
    runOpts.onResult = (r) => printRunResult(r);
  }

  const result = await runHttpFile(source, runOpts);

  if (args.jsonOut) {
    stdout.write(JSON.stringify({
      ok: result.ok, passed: result.passed, failed: result.failed,
      results: result.results.map((r) => ({
        name: r.name, method: r.method, url: r.url, ok: r.ok,
        status: r.response?.status, timeMs: r.response?.timeMs,
        error: r.error, missingVars: r.missingVars,
        captured: r.captured,
        assertions: r.assertions.map((a) => ({ ok: a.ok, message: a.message })),
      })),
    }) + "\n");
  } else {
    const summary = `${result.passed} passed`
      + (result.failed ? `, ${c("red", result.failed + " failed")}` : "")
      + ` ${c("dim", `· ${result.results.length} request(s)`)}`;
    log(`${result.ok ? c("green", "✓") : c("red", "✗")} ${summary}\n`);
  }

  if (!result.ok) exit(1);
}

function printRunResult(r: RequestRunResult): void {
  const label = r.name ? c("bold", r.name) : c("dim", `${r.method} ${r.url}`);
  if (r.error) {
    log(`  ${c("red", "✗")} ${label} ${c("dim", `L${r.line}`)}`);
    log(`      ${c("red", r.error)}`);
    return;
  }
  const st = r.response ? r.response.status : 0;
  const stCol = statusColor(st);
  const mark = r.ok ? c("green", "✓") : c("red", "✗");
  log(`  ${mark} ${label} ${c("dim", "→")} ${paint(stCol, String(st), COLOR)} `
    + `${c("dim", `${r.response?.timeMs ?? 0}ms`)}`);
  for (const k of Object.keys(r.captured)) {
    log(`      ${c("cyan", "captured")} ${k}=${c("dim", truncate(r.captured[k]!, 60))}`);
  }
  for (const a of r.assertions) {
    const am = a.ok ? c("green", "✓") : c("red", "✗");
    log(`      ${am} ${c("dim", "assert")} ${a.message}`);
  }
  if (r.missingVars.length) {
    log(`      ${c("yellow", "⚠ unresolved vars:")} ${r.missingVars.join(", ")}`);
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// ---- entry ----------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(argv.slice(2));
  if (args.version) { stdout.write(VERSION + "\n"); return; }
  if (args.help || args.positional.length === 0) { stdout.write(HELP + "\n"); return; }

  if (args.positional[0] === "run") { await runFile(args); return; }
  await runAdHoc(args);
}

main().catch((err) => {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
});
