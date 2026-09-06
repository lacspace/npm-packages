import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { stdout, stderr, argv, exit } from "node:process";
import { serializeRows } from "lacspace-scraper";
import { enrichMany, flattenProfile, selectFields, guessEmails } from "./lib.js";
import { normalizeDomain } from "./detect.js";
import type { EnrichedProfile } from "./types.js";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m" };
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");

const FORMATS = ["json", "ndjson", "csv", "xlsx"] as const;
type Format = (typeof FORMATS)[number];

interface Args {
  inputs: string[]; input?: string; format: Format; out?: string;
  noContact: boolean; concurrency?: number; timeout?: number; help: boolean;
  dns: boolean; rdap: boolean; noPages: boolean; assets?: string; verbose: boolean;
  resume: boolean; rate?: number; fields?: string[];
}

function parseArgs(list: string[]): Args {
  const a: Args = { inputs: [], format: "json", noContact: false, help: false, dns: false, rdap: false, noPages: false, verbose: false, resume: false };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--domain" || arg === "--email" || arg === "-d") a.inputs.push(next());
    else if (arg === "--domains") a.inputs.push(...next().split(",").map((s) => s.trim()).filter(Boolean));
    else if (arg === "--input" || arg === "-i") a.input = next();
    else if (arg === "-f" || arg === "--format") a.format = next() as Format;
    else if (arg === "-o" || arg === "--out") a.out = next();
    else if (arg === "--no-contact-pages") a.noContact = true;
    else if (arg === "--concurrency") a.concurrency = parseInt(next(), 10);
    else if (arg === "--timeout") a.timeout = parseInt(next(), 10);
    else if (arg === "--dns") a.dns = true;
    else if (arg === "--rdap") a.rdap = true;
    else if (arg === "--no-pages") a.noPages = true;
    else if (arg === "--assets") a.assets = next();
    else if (arg === "--verbose" || arg === "-v") a.verbose = true;
    else if (arg === "--resume") a.resume = true;
    else if (arg === "--rate") a.rate = parseInt(next(), 10);
    else if (arg === "--fields") a.fields = next().split(",").map((s) => s.trim()).filter(Boolean);
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (!arg.startsWith("-")) a.inputs.push(arg);
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-enrich"))} ${c("dim", "— domain/email → company + contact profile, free")}

${c("bold", "Usage")}
  npx lacspace-enrich <domain|url|email> [more…] [options]
  npx lacspace-enrich guess "<Full Name>" <domain> [options]

${c("bold", "Input")}
  -d, --domain <x>       A domain, URL or email (repeatable)
      --domains <list>   Comma-separated list
  -i, --input <file>     Read one domain/email per line from a file

${c("bold", "Enrichment")}
      --no-contact-pages Don't fetch /contact & /about for extra emails
      --no-pages         Skip key-page discovery (contact/about/careers/pricing/blog/status)
      --dns              Add DNS/deliverability signals (MX, SPF, DMARC, DKIM) + MX-verify emails
      --rdap             Add domain registration via RDAP (registrar, dates, nameservers)
      --assets <dir>     Download each site's logo + favicon into <dir>

${c("bold", "Batch & output")}
      --concurrency <n>  Parallel lookups (default 4)
      --timeout <ms>     Per-request timeout
      --rate <ms>        Min gap between requests to the SAME host (rate limit)
      --resume           Skip domains already present in the --out file, append the rest
      --fields <a,b,c>   Only these columns in csv/xlsx output (in this order)
  -v, --verbose          Print per-field confidence + source notes
  -f, --format <fmt>     json | ndjson | csv | xlsx      (default json)
  -o, --out <file>       Output file, or "-" for stdout
  -h, --help             Show this help

${c("bold", "What you get")}
  name · description · logo · emails · phones · address · socials
  (facebook/instagram/whatsapp/linkedin/x/youtube/tiktok/telegram) · tech stack
  + (v0.2) DNS/SPF/DMARC/DKIM · RDAP registration · categorized tech · key pages

${c("bold", "Examples")}
  npx lacspace-enrich acme.com
  npx lacspace-enrich acme.com --dns --rdap -v
  npx lacspace-enrich hello@acme.com --format csv
  npx lacspace-enrich --domains "a.com,b.com,c.com" -f xlsx -o companies.xlsx
  npx lacspace-enrich --input domains.txt --resume --rate 800 -f csv -o enriched.csv
  npx lacspace-enrich guess "Jane Doe" acme.com --known ceo@acme.com

${c("dim", "Only collects public business data. Respect each site's Terms and local")}
${c("dim", "data-protection law; use it lawfully.")}
`;

function summary(p: EnrichedProfile): string {
  if (p.error) {
    const extra = [p.dns?.hasMx !== undefined ? (p.dns.hasMx ? "has MX" : "no MX") : "", p.registration?.registrar ? p.registration.registrar : ""].filter(Boolean).join(" · ");
    return `  ${c("red", "✗")} ${p.domain} ${c("dim", "— " + p.error)}${extra ? c("dim", "  [" + extra + "]") : ""}`;
  }
  const bits = [
    p.emails?.length ? `${p.emails.length} email${p.emails.length === 1 ? "" : "s"}` : "",
    p.phones?.length ? `${p.phones.length} phone${p.phones.length === 1 ? "" : "s"}` : "",
    p.socials ? `${Object.keys(p.socials).length} social${Object.keys(p.socials).length === 1 ? "" : "s"}` : "",
    p.tech?.length ? `${p.tech.length} tech` : "",
    p.dns?.mailProvider ? p.dns.mailProvider : p.dns?.hasMx ? "MX" : "",
    p.registration?.registrar ? p.registration.registrar : "",
    p.pages ? `${Object.keys(p.pages).length} pages` : "",
  ].filter(Boolean).join(" · ");
  return `  ${c("green", "✔")} ${c("bold", p.name ?? p.domain)} ${c("dim", `(${p.domain})`)}  ${c("dim", bits)}`;
}

function verboseBlock(p: EnrichedProfile): string {
  const lines: string[] = [];
  if (p.sources) for (const [k, s] of Object.entries(p.sources)) lines.push(`      ${c("dim", `${k}: ${s.source ?? "?"}${s.confidence !== undefined ? ` (${Math.round(s.confidence * 100)}%)` : ""}`)}`);
  if (p.dns) { const d = p.dns; lines.push(`      ${c("dim", `dns: ${d.hasMx ? "MX" : "no-MX"}${d.mailProvider ? ` via ${d.mailProvider}` : ""} · spf ${d.spfPolicy ?? "—"} · dmarc ${d.dmarcPolicy ?? "—"} · dkim ${d.dkim ? "yes" : "no"}`)}`); }
  if (p.emailStatus) for (const [e, s] of Object.entries(p.emailStatus)) lines.push(`      ${c("dim", `email ${e}: ${s}`)}`);
  if (p.registration?.source === "rdap") lines.push(`      ${c("dim", `rdap: ${p.registration.registrar ?? "?"}${p.registration.createdAt ? ` · reg ${p.registration.createdAt.slice(0, 10)}` : ""}${p.registration.expiresAt ? ` · exp ${p.registration.expiresAt.slice(0, 10)}` : ""}`)}`);
  if (p.techDetailed?.length) lines.push(`      ${c("dim", `tech: ${p.techDetailed.map((t) => `${t.name}[${t.category}${t.version ? " " + t.version : ""}]`).join(", ")}`)}`);
  return lines.join("\n");
}

/** Read the domains already recorded in an existing output file (for --resume). */
function existingDomains(path: string, format: Format): Set<string> {
  const set = new Set<string>();
  try {
    const raw = readFileSync(path, "utf8");
    if (format === "json") {
      const arr = JSON.parse(raw) as { domain?: string }[];
      for (const r of Array.isArray(arr) ? arr : []) if (r?.domain) set.add(normalizeDomain(String(r.domain)));
    } else if (format === "ndjson") {
      for (const line of raw.split(/\r?\n/)) { if (!line.trim()) continue; try { const r = JSON.parse(line) as { domain?: string }; if (r?.domain) set.add(normalizeDomain(String(r.domain))); } catch { /* skip */ } }
    } else if (format === "csv") {
      const lines = raw.split(/\r?\n/).filter(Boolean);
      const header = (lines.shift() ?? "").split(",").map((h) => h.replace(/^"|"$/g, "").trim());
      const col = header.indexOf("domain");
      if (col >= 0) for (const line of lines) { const cell = line.split(",")[col]?.replace(/^"|"$/g, "").trim(); if (cell) set.add(normalizeDomain(cell)); }
    }
  } catch { /* no existing file */ }
  return set;
}

async function runGuess(rest: string[]): Promise<void> {
  const a = parseArgs(rest);
  const positional = a.inputs;
  const name = positional[0];
  const domain = positional[1];
  let known: string | undefined; let limit: number | undefined;
  for (let i = 0; i < rest.length; i++) { if (rest[i] === "--known") known = rest[i + 1]; if (rest[i] === "--limit") limit = parseInt(rest[i + 1] ?? "", 10); }
  if (!name || !domain) { log(c("red", `\n✗ Usage: lacspace-enrich guess "<Full Name>" <domain> [--known "Colleague:email"|email] [--limit n]\n`)); exit(1); return; }
  const opts: { knownEmail?: string; knownContact?: { name: string; email: string }; limit?: number } = {};
  if (known) {
    // "--known Bob Smith:bsmith@acme.com" reveals the org pattern from a colleague;
    // a bare email is treated as a known address for the same person.
    const colon = known.indexOf(":");
    if (colon > 0 && known.slice(colon + 1).includes("@")) opts.knownContact = { name: known.slice(0, colon).trim(), email: known.slice(colon + 1).trim() };
    else opts.knownEmail = known;
  }
  if (limit !== undefined && !Number.isNaN(limit)) opts.limit = limit;
  const guesses = guessEmails(name, domain, opts);
  const toStdout = a.out === "-";
  const rows = guesses as unknown as Record<string, unknown>[];
  const { data, binary } = serializeRows(rows as Record<string, unknown>[], a.format);
  if (toStdout || !a.out) {
    if (!toStdout) { log(`\n${c("bold", c("magenta", "◆ email guesses"))} ${c("dim", `— ${name} @ ${normalizeDomain(domain)}`)}\n`); for (const g of guesses) log(`  ${c("green", "•")} ${c("bold", g.email)}  ${c("dim", `${g.pattern} · ${Math.round(g.confidence * 100)}%`)}`); log(""); }
    else { stdout.write(binary ? Buffer.from(data as Uint8Array) : (data as string)); if (!binary) stdout.write("\n"); }
    return;
  }
  const out = resolve(a.out);
  writeFileSync(out, binary ? Buffer.from(data as Uint8Array) : (data as string));
  log(`\n  ${c("green", "✔")} Saved ${c("bold", String(guesses.length))} guesses → ${c("cyan", out)}\n`);
}

async function main(): Promise<void> {
  const raw = argv.slice(2);
  if (raw[0] === "guess") { await runGuess(raw.slice(1)); return; }

  const args = parseArgs(raw);
  if (args.input) {
    try { args.inputs.push(...readFileSync(resolve(args.input), "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))); }
    catch { log(c("red", `\n✗ Could not read --input "${args.input}".\n`)); exit(1); return; }
  }
  if (args.help || args.inputs.length === 0) { stdout.write(HELP + "\n"); return; }
  if (!FORMATS.includes(args.format)) { log(c("red", `\n✗ Unknown format "${args.format}".`)); exit(1); return; }

  const toStdout = args.out === "-";

  // --resume: drop inputs already present in the output file.
  let existing: EnrichedProfile[] = [];
  if (args.resume && args.out && !toStdout && existsSync(resolve(args.out))) {
    const seen = existingDomains(resolve(args.out), args.format);
    const before = args.inputs.length;
    args.inputs = args.inputs.filter((x) => !seen.has(normalizeDomain(x)));
    if (!toStdout && before !== args.inputs.length) log(`  ${c("dim", `resume: skipping ${before - args.inputs.length} already-enriched domain(s)`)}`);
    if ((args.format === "json" || args.format === "ndjson")) {
      try { const r = readFileSync(resolve(args.out), "utf8"); existing = args.format === "json" ? (JSON.parse(r) as EnrichedProfile[]) : r.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l) as EnrichedProfile); } catch { /* ignore */ }
    }
    if (args.inputs.length === 0) { log(`\n  ${c("green", "✔")} Nothing new to enrich.\n`); return; }
  }

  if (!toStdout) log(`\n${c("bold", c("magenta", "◆ lacspace-enrich"))} ${c("dim", `— enriching ${args.inputs.length} domain${args.inputs.length === 1 ? "" : "s"}`)}\n`);

  const opts: { contactPages: boolean; concurrency?: number; timeoutMs?: number; onProgress?: (m: string) => void; dns?: boolean; rdap?: boolean; discoverPages?: boolean; assetsDir?: string; perHostRateMs?: number } = { contactPages: !args.noContact };
  if (args.concurrency !== undefined) opts.concurrency = args.concurrency;
  if (args.timeout !== undefined) opts.timeoutMs = args.timeout;
  if (args.dns) opts.dns = true;
  if (args.rdap) opts.rdap = true;
  if (args.noPages) opts.discoverPages = false;
  if (args.assets) opts.assetsDir = resolve(args.assets);
  if (args.rate !== undefined) opts.perHostRateMs = args.rate;
  if (!toStdout) opts.onProgress = (m) => log(`  ${c("cyan", "◷")} ${c("dim", m)}`);

  const fresh = await enrichMany(args.inputs, opts);
  const profiles = [...existing, ...fresh];
  if (!toStdout) { log(""); for (const p of fresh) { log(summary(p)); if (args.verbose) { const v = verboseBlock(p); if (v) log(v); } } }

  const rows = args.format === "json" || args.format === "ndjson"
    ? (profiles as unknown as Record<string, unknown>[])
    : profiles.map(flattenProfile).map((r) => (args.fields ? selectFields(r, args.fields) : r));
  const { data, binary } = serializeRows(rows as Record<string, unknown>[], args.format);

  if (toStdout) {
    stdout.write(binary ? Buffer.from(data as Uint8Array) : (data as string));
    if (!binary) stdout.write("\n");
    return;
  }
  const out = resolve(args.out ?? `enriched-${new Date().toISOString().slice(0, 10)}.${args.format}`);
  writeFileSync(out, binary ? Buffer.from(data as Uint8Array) : (data as string));
  log(`\n  ${c("green", "✔")} Saved ${c("bold", String(profiles.length))} profile${profiles.length === 1 ? "" : "s"} → ${c("cyan", out)}\n`);
}

main().catch((err: unknown) => { log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`)); exit(1); });
