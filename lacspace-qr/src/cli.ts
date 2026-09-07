import { stdout, stderr, argv, exit, env } from "node:process";
import { writeFileSync, readFileSync, mkdirSync, existsSync } from "node:fs";
import { join, extname } from "node:path";
import { makeQr } from "./matrix.js";
import type { QrCode, QrOptions } from "./matrix.js";
import type { EccLevel } from "./tables.js";
import { renderToTerminal } from "./terminal.js";
import { renderToAnsi } from "./ansi.js";
import { renderToSvg } from "./svg.js";
import type { ModuleShape, Gradient, LogoOptions } from "./svg.js";
import { renderToPng } from "./png.js";
import {
  wifiPayload,
  vcardPayload,
  emailPayload,
  telPayload,
  smsPayload,
  geoPayload,
  urlPayload,
  calendarPayload,
} from "./payloads.js";
import { parseBatch, safeFilename } from "./batch.js";

const VERSION = "0.2.0";

const NO_COLOR = Boolean(env["NO_COLOR"]) || !stdout.isTTY;
const RAW = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};
const C = RAW;
const c = (k: keyof typeof C, s: string): string => (NO_COLOR ? s : `${C[k]}${s}${C.reset}`);
const log = (s = ""): void => void stderr.write(s + "\n");

type Format = "term" | "ansi" | "svg" | "png";

interface Args {
  positional: string[];
  format: Format;
  out?: string;
  outDir: string;
  ecc: EccLevel;
  qrVersion?: number;
  minVersion?: number;
  mask?: number;
  size?: number;
  scale?: number;
  margin?: number;
  fg?: string;
  bg?: string;
  radius?: number;
  shape?: string;
  eye?: string;
  logo?: string;
  logoSize?: number;
  gradient?: string;
  invert: boolean;
  batch?: string;
  mode?: "numeric" | "alphanumeric" | "byte";
  json: boolean;
  help: boolean;
  version: boolean;
  // preset fields
  ssid?: string;
  password?: string;
  security?: string;
  hidden: boolean;
  name?: string;
  org?: string;
  title?: string;
  tel?: string;
  email?: string;
  url?: string;
  address?: string;
  subject?: string;
  body?: string;
  message?: string;
  start?: string;
  end?: string;
  location?: string;
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    positional: [], format: "term", outDir: "out", ecc: "M",
    invert: false, hidden: false, json: false, help: false, version: false,
  };
  const num = (s: string): number => Number(s);
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const val = (): string => list[++i] ?? "";
    switch (arg) {
      case "-f": case "--format": a.format = val() as Format; break;
      case "-o": case "--out": a.out = val(); break;
      case "--out-dir": a.outDir = val(); break;
      case "--ecc": a.ecc = val().toUpperCase() as EccLevel; break;
      case "--qr-version": a.qrVersion = num(val()); break;
      case "--min-version": a.minVersion = num(val()); break;
      case "--mask": a.mask = num(val()); break;
      case "--mode": a.mode = val() as Args["mode"]; break;
      case "--size": a.size = num(val()); break;
      case "--scale": a.scale = num(val()); break;
      case "--margin": case "--quiet": a.margin = num(val()); break;
      case "--fg": a.fg = val(); break;
      case "--bg": a.bg = val(); break;
      case "--radius": a.radius = num(val()); break;
      case "--shape": a.shape = val(); break;
      case "--eye": a.eye = val(); break;
      case "--logo": a.logo = val(); break;
      case "--logo-size": a.logoSize = num(val()); break;
      case "--gradient": a.gradient = val(); break;
      case "--ansi": a.format = "ansi"; break;
      case "--invert": a.invert = true; break;
      case "--batch": a.batch = val(); break;
      case "--json": a.json = true; break;
      // preset flags
      case "--ssid": a.ssid = val(); break;
      case "--password": case "--pass": a.password = val(); break;
      case "--security": case "--sec": a.security = val(); break;
      case "--hidden": a.hidden = true; break;
      case "--name": a.name = val(); break;
      case "--org": a.org = val(); break;
      case "--vtitle": a.title = val(); break;
      case "--tel": case "--phone": a.tel = val(); break;
      case "--email": a.email = val(); break;
      case "--url": a.url = val(); break;
      case "--address": a.address = val(); break;
      case "--subject": a.subject = val(); break;
      case "--body": a.body = val(); break;
      case "--message": case "--msg": a.message = val(); break;
      case "--start": a.start = val(); break;
      case "--end": a.end = val(); break;
      case "--location": case "--loc": a.location = val(); break;
      case "-h": case "--help": a.help = true; break;
      case "-v": case "--version": a.version = true; break;
      default:
        if (!arg.startsWith("-")) a.positional.push(arg);
        else { log(c("yellow", `warning: unknown flag ${arg}`)); }
    }
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-qr"))} ${c("dim", "— keyless, zero-dep QR generator (terminal · SVG · PNG)")}

${c("bold", "Usage")}
  npx lacspace-qr "<text or url>" [options]
  npx lacspace-qr <preset> [preset args] [options]
  npx lacspace-qr batch list.csv --out out/ -f svg

${c("bold", "Presets")}
  url <url>                         Encode a URL (adds https:// if missing)
  text <string>                     Encode arbitrary text
  wifi --ssid <s> --password <p>    WiFi join code (--security WPA|WEP|nopass, --hidden)
  vcard --name --org --tel --email  Contact card (also --vtitle --url --address)
  email --email <a> [--subject --body]
  tel --tel <number>                Phone dial code
  sms --tel <number> [--message]    Pre-filled SMS
  geo <lat> <lng>                   Map location
  calendar --vtitle <t> --start <d> [--end --location --body]   Calendar VEVENT

${c("bold", "Output")}
  -f, --format <term|ansi|svg|png>  Output format (default term)
      --ansi                        Full-block terminal render (alias for -f ansi)
  -o, --out <file>              Write to a file instead of stdout
      batch <list.csv|.txt>     Generate one file per row (subcommand)
      --batch <list.csv|.txt>   Same, as a flag
      --out-dir <dir>           Directory for batch output (default out)

${c("bold", "QR options")}
      --ecc <L|M|Q|H>           Error-correction level (default M)
      --qr-version <1-40>       Force the QR symbol version
      --min-version <1-40>      Minimum symbol version
      --mask <0-7>              Force a data mask (default: best by penalty)
      --mode <numeric|alphanumeric|byte>   Force the encoding mode

${c("bold", "Render options")}
      --size <px>               SVG pixel size (default 512)
      --scale <px>              PNG pixels per module (default 10)
      --margin, --quiet <n>     Quiet-zone modules (default term 2 / svg·png 4)
      --fg <colour>             Dark-module colour (svg/png, default #000000)
      --bg <colour>             Background colour (svg/png, "transparent" ok)
      --radius <0-0.5>          Rounded modules (svg)
      --shape <square|dots|rounded>   Module shape (svg)
      --eye <square|dots|rounded>     Distinct finder-eye shape (svg)
      --gradient <from,to[,angle]>    Two-tone linear-gradient foreground (svg)
      --logo <text|file|data-uri>     Centre logo/initials (svg, needs --ecc Q or H)
      --logo-size <0.05-0.35>   Logo box as a fraction of the symbol (svg)
      --invert                  Swap dark/light (terminal/ansi)

${c("bold", "Meta")}
      --json                    Print metadata as JSON (with -o for term/svg)
  -h, --help                    Show this help
  -v, --version                 Print the tool version (0.2.0)

${c("bold", "Examples")}
  npx lacspace-qr "https://lacspace.com"
  npx lacspace-qr wifi --ssid Home --password s3cret
  npx lacspace-qr "https://x.com" -f svg -o qr.svg --shape dots --eye rounded
  npx lacspace-qr "https://x.com" -f svg -o qr.svg --gradient "#4d9fff,#a855f7,45"
  npx lacspace-qr "https://lacspace.com" -f svg -o qr.svg --ecc H --logo LS
  npx lacspace-qr calendar --vtitle "Launch" --start 2026-10-01T09:00Z -f svg -o e.svg
  npx lacspace-qr batch urls.csv --out out/ -f png --scale 8
`;

function fail(msg: string, json = false): never {
  if (json) stdout.write(JSON.stringify({ ok: false, error: msg }) + "\n");
  else log(c("red", `\n✗ ${msg}\n`));
  exit(1);
}

function validate(a: Args): void {
  if (!["term", "ansi", "svg", "png"].includes(a.format)) fail(`Unknown format "${a.format}" (use term, ansi, svg or png).`, a.json);
  if (!["L", "M", "Q", "H"].includes(a.ecc)) fail(`Unknown ECC level "${a.ecc}" (use L, M, Q or H).`, a.json);
  if (a.mask !== undefined && (a.mask < 0 || a.mask > 7 || !Number.isInteger(a.mask))) fail("--mask must be 0-7.", a.json);
  if (a.qrVersion !== undefined && (a.qrVersion < 1 || a.qrVersion > 40)) fail("--qr-version must be 1-40.", a.json);
  const shapes = ["square", "dots", "rounded"];
  if (a.shape !== undefined && !shapes.includes(a.shape)) fail(`--shape must be square, dots or rounded.`, a.json);
  if (a.eye !== undefined && !shapes.includes(a.eye)) fail(`--eye must be square, dots or rounded.`, a.json);
}

/** Resolve the payload string from the positional args / preset flags. */
function resolvePayload(a: Args): string {
  const preset = a.positional[0]?.toLowerCase();
  const known = ["url", "text", "wifi", "vcard", "email", "tel", "phone", "sms", "geo", "calendar", "event"];
  if (preset && known.includes(preset)) {
    const rest = a.positional.slice(1);
    switch (preset) {
      case "url": return urlPayload(rest[0] ?? a.url ?? fail("url needs a value.", a.json));
      case "text": return rest.join(" ") || fail("text needs a value.", a.json);
      case "wifi":
        if (!a.ssid) fail("wifi needs --ssid.", a.json);
        return wifiPayload({
          ssid: a.ssid!,
          ...(a.password ? { password: a.password } : {}),
          ...(a.security ? { security: a.security as "WPA" | "WEP" | "nopass" } : {}),
          hidden: a.hidden,
        });
      case "vcard":
        return vcardPayload({
          ...(a.name ? { name: a.name } : {}),
          ...(a.org ? { org: a.org } : {}),
          ...(a.title ? { title: a.title } : {}),
          ...(a.tel ? { tel: a.tel } : {}),
          ...(a.email ? { email: a.email } : {}),
          ...(a.url ? { url: a.url } : {}),
          ...(a.address ? { address: a.address } : {}),
        });
      case "email":
        return emailPayload({
          to: a.email ?? rest[0] ?? fail("email needs --email or a value.", a.json),
          ...(a.subject ? { subject: a.subject } : {}),
          ...(a.body ? { body: a.body } : {}),
        });
      case "tel": case "phone":
        return telPayload(a.tel ?? rest[0] ?? fail("tel needs --tel or a value.", a.json));
      case "sms":
        return smsPayload({
          number: a.tel ?? rest[0] ?? fail("sms needs --tel or a value.", a.json),
          ...(a.message ? { message: a.message } : {}),
        });
      case "geo": {
        const lat = Number(rest[0]);
        const lng = Number(rest[1]);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) fail("geo needs <lat> <lng>.", a.json);
        return geoPayload(lat, lng);
      }
      case "calendar": case "event":
        if (!a.title && !a.name) fail("calendar needs --vtitle (or --name) for the summary.", a.json);
        if (!a.start) fail("calendar needs --start <date>.", a.json);
        return calendarPayload({
          title: a.title ?? a.name ?? "",
          start: a.start!,
          ...(a.end ? { end: a.end } : {}),
          ...(a.location ? { location: a.location } : {}),
          ...(a.body ? { description: a.body } : {}),
        });
    }
  }
  // Bare text/url.
  const text = a.positional.join(" ");
  if (!text) fail("Nothing to encode. Pass some text, a URL, or a preset. Try --help.", a.json);
  return text;
}

function qrOptions(a: Args): QrOptions {
  const opts: QrOptions = { ecc: a.ecc };
  if (a.qrVersion !== undefined) opts.version = a.qrVersion;
  if (a.minVersion !== undefined) opts.minVersion = a.minVersion;
  if (a.mask !== undefined) opts.mask = a.mask;
  if (a.mode !== undefined) opts.mode = a.mode;
  return opts;
}

/** Parse `--gradient from,to[,angle]` into a Gradient, or fail. */
function parseGradient(spec: string, json: boolean): Gradient {
  const parts = spec.split(",").map((s) => s.trim());
  if (parts.length < 2 || !parts[0] || !parts[1]) fail("--gradient needs from,to[,angle] (e.g. #4d9fff,#a855f7,45).", json);
  const g: Gradient = { from: parts[0]!, to: parts[1]! };
  if (parts[2] !== undefined && parts[2] !== "") {
    const angle = Number(parts[2]);
    if (!Number.isFinite(angle)) fail("--gradient angle must be a number.", json);
    g.angle = angle;
  }
  return g;
}

/** Resolve `--logo`: raw markup / data URI passes through; a file path is read. */
function resolveLogo(a: Args): LogoOptions {
  const raw = a.logo!.trim();
  let src = raw;
  if (!raw.startsWith("<") && !/^data:/i.test(raw)) {
    try {
      if (existsSync(raw)) src = readFileSync(raw, "utf8");
    } catch { /* fall through to treat as initials text */ }
  }
  const logo: LogoOptions = { src };
  if (a.logoSize !== undefined) logo.size = a.logoSize;
  return logo;
}

/** Render a QR to a string (term/ansi/svg) or bytes (png). */
function render(qr: QrCode, a: Args): { text?: string; bytes?: Uint8Array } {
  if (a.format === "term") {
    const opts: { margin?: number; invert?: boolean } = { invert: a.invert };
    if (a.margin !== undefined) opts.margin = a.margin;
    return { text: renderToTerminal(qr, opts) };
  }
  if (a.format === "ansi") {
    const opts: { margin?: number; invert?: boolean } = { invert: a.invert };
    if (a.margin !== undefined) opts.margin = a.margin;
    return { text: renderToAnsi(qr, opts) };
  }
  if (a.format === "svg") {
    const opts: Record<string, unknown> = { onWarn: (m: string) => log(c("yellow", `warning: ${m}`)) };
    if (a.size !== undefined) opts["size"] = a.size;
    if (a.margin !== undefined) opts["margin"] = a.margin;
    if (a.gradient !== undefined) opts["fg"] = parseGradient(a.gradient, a.json);
    else if (a.fg !== undefined) opts["fg"] = a.fg;
    if (a.bg !== undefined) opts["bg"] = a.bg;
    if (a.radius !== undefined) opts["radius"] = a.radius;
    if (a.shape !== undefined) opts["shape"] = a.shape as ModuleShape;
    if (a.eye !== undefined) opts["eye"] = a.eye as ModuleShape;
    if (a.logo !== undefined) opts["logo"] = resolveLogo(a);
    return { text: renderToSvg(qr, opts) };
  }
  const opts: Record<string, unknown> = {};
  if (a.scale !== undefined) opts["scale"] = a.scale;
  if (a.margin !== undefined) opts["margin"] = a.margin;
  if (a.fg !== undefined) opts["fg"] = a.fg;
  if (a.bg !== undefined) opts["bg"] = a.bg;
  return { bytes: renderToPng(qr, opts) };
}

function defaultExt(fmt: Format): string {
  return fmt === "png" ? ".png" : fmt === "svg" ? ".svg" : ".txt";
}

function runBatch(a: Args): void {
  const path = a.batch!;
  let contents: string;
  try {
    contents = readFileSync(path, "utf8");
  } catch {
    fail(`Cannot read batch file: ${path}`, a.json);
  }
  const kind = extname(path).toLowerCase() === ".csv" ? "csv" : "txt";
  const rows = parseBatch(contents!, kind);
  if (rows.length === 0) fail("Batch file has no rows.", a.json);
  try {
    mkdirSync(a.outDir, { recursive: true });
  } catch { /* dir may exist */ }

  const ext = defaultExt(a.format);
  const written: string[] = [];
  for (const row of rows) {
    const qr = makeQr(row.data, qrOptions(a));
    const file = join(a.outDir, safeFilename(row.id) + ext);
    const r = render(qr, a);
    if (r.bytes) writeFileSync(file, r.bytes);
    else writeFileSync(file, r.text ?? "");
    written.push(file);
  }

  if (a.json) {
    stdout.write(JSON.stringify({ ok: true, count: written.length, files: written }) + "\n");
    return;
  }
  log(`\n${c("green", "✓")} wrote ${c("bold", String(written.length))} ${c("dim", `QR file${written.length === 1 ? "" : "s"} to ${a.outDir}/`)}\n`);
}

function main(): void {
  const a = parseArgs(argv.slice(2));
  if (a.version) { stdout.write(VERSION + "\n"); return; }

  // `qr batch <file> [--out dir]` subcommand → the --batch path, mapping --out to the dir.
  if (a.positional[0]?.toLowerCase() === "batch" && !a.batch) {
    a.batch = a.positional[1];
    if (a.out && a.outDir === "out") { a.outDir = a.out; a.out = undefined; }
    if (!a.batch) fail("batch needs a file: qr batch list.csv --out dir/", a.json);
  }

  if (a.help || (a.positional.length === 0 && !a.batch && !a.ssid && !a.name && !a.email && !a.tel)) {
    stdout.write(HELP + "\n");
    return;
  }
  validate(a);

  if (a.batch) { runBatch(a); return; }

  const payload = resolvePayload(a);
  let qr: QrCode;
  try {
    qr = makeQr(payload, qrOptions(a));
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err), a.json);
  }

  const r = render(qr!, a);

  // Write to a file if requested.
  if (a.out) {
    if (r.bytes) writeFileSync(a.out, r.bytes);
    else writeFileSync(a.out, (r.text ?? "") + (a.format === "svg" ? "\n" : "\n"));
    if (a.json) {
      stdout.write(JSON.stringify(meta(qr!, payload, { file: a.out })) + "\n");
    } else {
      log(`\n${c("green", "✓")} wrote ${c("bold", a.out)} ${c("dim", `· v${qr!.version} · ecc ${qr!.ecc} · mask ${qr!.mask} · ${qr!.size}×${qr!.size}`)}\n`);
    }
    return;
  }

  // No file: PNG must go to a path, not the terminal.
  if (a.format === "png") fail("PNG output needs -o <file> (binary can't go to the terminal).", a.json);

  if (a.json) {
    stdout.write(JSON.stringify(meta(qr!, payload, a.format === "svg" ? { svg: r.text } : {})) + "\n");
    return;
  }

  if (a.format === "svg") {
    stdout.write((r.text ?? "") + "\n");
    return;
  }

  // Terminal: the QR to stdout, a one-line summary to stderr.
  stdout.write((r.text ?? "") + "\n");
  log(c("dim", `  ${payload.length > 48 ? payload.slice(0, 45) + "…" : payload}  ·  v${qr!.version} · ecc ${qr!.ecc} · mask ${qr!.mask} · ${qr!.size}×${qr!.size}`));
}

function meta(qr: QrCode, payload: string, extra: Record<string, unknown>): Record<string, unknown> {
  return {
    ok: true,
    payload,
    version: qr.version,
    ecc: qr.ecc,
    mask: qr.mask,
    mode: qr.mode,
    size: qr.size,
    ...extra,
  };
}

try {
  main();
} catch (err) {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
}
