import { readFileSync, appendFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdout, stderr, argv, exit } from "node:process";
import { createReceiver } from "./receiver.js";
import type { ReceiverOptions } from "./receiver.js";
import { replayRequests } from "./replay.js";
import { parseCaptureFile, serializeCapture } from "./capture.js";
import type { CapturedRequest } from "./capture.js";
import type { SignatureScheme } from "./verify.js";
import { formatCapture, summaryLine, c } from "./format.js";

const log = (s = ""): void => void stderr.write(s + "\n");

function version(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as { version?: string };
    return pkg.version ?? "0.1.0";
  } catch {
    return "0.1.0";
  }
}

interface Args {
  command?: string;
  positionals: string[];
  port?: number;
  path?: string;
  save?: string;
  forward?: string;
  status?: number;
  body?: string;
  secret?: string;
  verify?: SignatureScheme;
  header?: string;
  to?: string;
  index?: number;
  delay?: number;
  help: boolean;
  version: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = { positionals: [], help: false, version: false };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--port" || arg === "-p") a.port = parseInt(next(), 10);
    else if (arg === "--path") a.path = next();
    else if (arg === "--save") a.save = next();
    else if (arg === "--forward") a.forward = next();
    else if (arg === "--status") a.status = parseInt(next(), 10);
    else if (arg === "--body") a.body = next();
    else if (arg === "--secret") a.secret = next();
    else if (arg === "--verify") a.verify = next() as SignatureScheme;
    else if (arg === "--header") a.header = next();
    else if (arg === "--to") a.to = next();
    else if (arg === "--index" || arg === "-i") a.index = parseInt(next(), 10);
    else if (arg === "--delay") a.delay = parseInt(next(), 10);
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
${c("bold", c("magenta", "◆ lacspace-webhook"))} ${c("dim", "— capture, inspect, verify & replay webhooks, locally")}

${c("bold", "Usage")}
  npx lacspace-webhook listen [options]
  npx lacspace-webhook replay <capture.ndjson> --to <url> [options]
  npx lacspace-webhook list <capture.ndjson>

${c("bold", "listen")} ${c("dim", "— start a local receiver (runs until Ctrl-C)")}
      --port <n>         Port to listen on (default 4000)
      --path <path>      Only accept this path (default: any path)
      --save <file>      Append each request to an NDJSON file
      --forward <url>    Proxy requests to a local URL and relay its response
      --status <n>       Response status when not forwarding (default 200)
      --body <text>      Response body when not forwarding (default {"ok":true})
      --secret <key>     Secret for signature verification
      --verify <scheme>  github | stripe | hmac-sha256
      --header <name>    Signature header for hmac-sha256 (default X-Signature)

${c("bold", "replay")} ${c("dim", "— re-send captured requests to a target")}
      --to <url>         Target base URL (required)
  -i, --index <n>        Replay only record #n (default: all, in order)
      --delay <ms>       Wait between requests

${c("bold", "list")} ${c("dim", "— summarize a capture file")}

${c("bold", "General")}
  -h, --help             Show this help
  -v, --version          Print version

${c("bold", "Examples")}
  npx lacspace-webhook listen --port 4000 --save hooks.ndjson
  npx lacspace-webhook listen --forward http://localhost:3000/api/webhook
  npx lacspace-webhook listen --secret whsec_… --verify stripe
  npx lacspace-webhook replay hooks.ndjson --to http://localhost:3000 --delay 250
  npx lacspace-webhook list hooks.ndjson

${c("dim", "Local-only: it binds to your machine. To receive webhooks from a public")}
${c("dim", "service, pair it with a tunnel like cloudflared or ngrok.")}
`;

function cmdListen(args: Args): void {
  const port = args.port ?? 4000;
  const opts: ReceiverOptions = {};
  if (args.path) opts.path = args.path;
  if (args.forward) opts.forward = args.forward;
  if (args.status !== undefined && !Number.isNaN(args.status)) opts.status = args.status;
  if (args.body !== undefined) opts.body = args.body;
  if (args.secret) opts.secret = args.secret;
  if (args.verify) opts.verify = args.verify;
  if (args.header) opts.signatureHeader = args.header;

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

  const { server, close } = createReceiver(opts);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") log(c("red", `\n✗ Port ${port} is already in use. Try --port <other>.\n`));
    else log(c("red", `\n✗ ${err.message}\n`));
    exit(1);
  });

  server.listen(port, () => {
    log(`\n${c("bold", c("magenta", "◆ lacspace-webhook"))} ${c("dim", "— listening")}`);
    log(`  ${c("green", "▶")} ${c("bold", `http://localhost:${port}${args.path ?? ""}`)}`);
    if (args.forward) log(`  ${c("cyan", "⇄")} ${c("dim", `forwarding → ${args.forward}`)}`);
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

  log(`\n${c("bold", c("magenta", "◆ lacspace-webhook"))} ${c("dim", `— replaying ${records.length} request${records.length === 1 ? "" : "s"} → ${args.to}`)}\n`);

  const opts: { to: string; delay?: number } = { to: args.to };
  if (args.delay !== undefined && !Number.isNaN(args.delay)) opts.delay = args.delay;

  const results = await replayRequests(records, opts);
  results.forEach((r, i) => {
    const rec = records[i]!;
    const ok = r.status >= 200 && r.status < 400;
    log(`  ${ok ? c("green", "✔") : c("red", "✗")} ${c("dim", String(i).padStart(3))} ${rec.method.padEnd(6)} ${rec.path.slice(0, 40).padEnd(40)} ${c(ok ? "green" : "red", String(r.status))}`);
  });
  log("");
}

function cmdList(args: Args): void {
  const file = args.positionals[0];
  if (!file) throw new Error("list needs a <capture.ndjson> file");
  const records = loadRecords(file);
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
