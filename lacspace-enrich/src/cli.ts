import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdout, stderr, argv, exit } from "node:process";
import { serializeRows } from "lacspace-scraper";
import { enrichMany, flattenProfile } from "./lib.js";
import type { EnrichedProfile } from "./types.js";

const C = { reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m", green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m" };
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");

const FORMATS = ["json", "ndjson", "csv", "xlsx"] as const;
type Format = (typeof FORMATS)[number];

interface Args {
  inputs: string[]; input?: string; format: Format; out?: string;
  noContact: boolean; concurrency?: number; timeout?: number; help: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = { inputs: [], format: "json", noContact: false, help: false };
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
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (!arg.startsWith("-")) a.inputs.push(arg);
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-enrich"))} ${c("dim", "— domain/email → company + contact profile, free")}

${c("bold", "Usage")}
  npx lacspace-enrich <domain|url|email> [more…] [options]

${c("bold", "Input")}
  -d, --domain <x>       A domain, URL or email (repeatable)
      --domains <list>   Comma-separated list
  -i, --input <file>     Read one domain/email per line from a file

${c("bold", "Options")}
      --no-contact-pages Don't fetch /contact & /about for extra emails
      --concurrency <n>  Parallel lookups (default 4)
      --timeout <ms>     Per-request timeout
  -f, --format <fmt>     json | ndjson | csv | xlsx      (default json)
  -o, --out <file>       Output file, or "-" for stdout
  -h, --help             Show this help

${c("bold", "What you get")}
  name · description · logo · emails · phones · address · socials
  (facebook/instagram/whatsapp/linkedin/x/youtube/tiktok/telegram) · tech stack

${c("bold", "Examples")}
  npx lacspace-enrich acme.com
  npx lacspace-enrich hello@acme.com --format csv
  npx lacspace-enrich --domains "a.com,b.com,c.com" -f xlsx -o companies.xlsx
  npx lacspace-enrich --input domains.txt -f csv -o enriched.csv

${c("dim", "Only collects public business data. Respect each site's Terms and local")}
${c("dim", "data-protection law; use it lawfully.")}
`;

function summary(p: EnrichedProfile): string {
  if (p.error) return `  ${c("red", "✗")} ${p.domain} ${c("dim", "— " + p.error)}`;
  const bits = [
    p.emails?.length ? `${p.emails.length} email${p.emails.length === 1 ? "" : "s"}` : "",
    p.phones?.length ? `${p.phones.length} phone${p.phones.length === 1 ? "" : "s"}` : "",
    p.socials ? `${Object.keys(p.socials).length} social${Object.keys(p.socials).length === 1 ? "" : "s"}` : "",
    p.tech?.length ? `${p.tech.length} tech` : "",
  ].filter(Boolean).join(" · ");
  return `  ${c("green", "✔")} ${c("bold", p.name ?? p.domain)} ${c("dim", `(${p.domain})`)}  ${c("dim", bits)}`;
}

async function main(): Promise<void> {
  const args = parseArgs(argv.slice(2));
  if (args.input) {
    try { args.inputs.push(...readFileSync(resolve(args.input), "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))); }
    catch { log(c("red", `\n✗ Could not read --input "${args.input}".\n`)); exit(1); return; }
  }
  if (args.help || args.inputs.length === 0) { stdout.write(HELP + "\n"); return; }
  if (!FORMATS.includes(args.format)) { log(c("red", `\n✗ Unknown format "${args.format}".`)); exit(1); return; }

  const toStdout = args.out === "-";
  if (!toStdout) log(`\n${c("bold", c("magenta", "◆ lacspace-enrich"))} ${c("dim", `— enriching ${args.inputs.length} domain${args.inputs.length === 1 ? "" : "s"}`)}\n`);

  const opts: { contactPages: boolean; concurrency?: number; timeoutMs?: number; onProgress?: (m: string) => void } = { contactPages: !args.noContact };
  if (args.concurrency !== undefined) opts.concurrency = args.concurrency;
  if (args.timeout !== undefined) opts.timeoutMs = args.timeout;
  if (!toStdout) opts.onProgress = (m) => log(`  ${c("cyan", "◷")} ${c("dim", m)}`);

  const profiles = await enrichMany(args.inputs, opts);
  if (!toStdout) { log(""); for (const p of profiles) log(summary(p)); }

  const rows = args.format === "json" || args.format === "ndjson"
    ? (profiles as unknown as Record<string, unknown>[])
    : profiles.map(flattenProfile);
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
