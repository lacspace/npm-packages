import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr, argv, exit } from "node:process";
import { scrapeLeads as searchLeads } from "./scrape.js";
import { serialize } from "./export.js";
import { convertFile } from "./convert.js";
import { composeQuery, defaultFilename, normalizeFields } from "./query.js";
import {
  ALL_FIELDS,
  DEFAULT_FIELDS,
  type LeadField,
  type LeadFilters,
  type OutputFormat,
  type SearchOptions,
} from "./types.js";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");

interface Args {
  city?: string; area?: string; type?: string; query?: string;
  fields?: string; format: OutputFormat; out?: string;
  limit: number; headless: boolean; details: boolean; delay: number;
  emails: boolean; socials: boolean;
  minRating?: number; minReviews?: number; hasPhone: boolean; hasWebsite: boolean; hasEmail: boolean;
  dedupe?: SearchOptions["dedupe"]; sheet?: string; maxTime?: number;
  yes: boolean; help: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    format: "json", limit: 60, headless: false, details: true, delay: 700,
    emails: false, socials: false, hasPhone: false, hasWebsite: false, hasEmail: false,
    yes: false, help: false,
  };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--city") a.city = next();
    else if (arg === "--area") a.area = next();
    else if (arg === "-t" || arg === "--type") a.type = next();
    else if (arg === "-q" || arg === "--query") a.query = next();
    else if (arg === "--fields") a.fields = next();
    else if (arg === "-f" || arg === "--format") a.format = next() as OutputFormat;
    else if (arg === "-o" || arg === "--out") a.out = next();
    else if (arg === "-n" || arg === "--limit") a.limit = parseInt(next(), 10) || a.limit;
    else if (arg === "--headless") a.headless = true;
    else if (arg === "--no-details") a.details = false;
    else if (arg === "--delay") a.delay = parseInt(next(), 10) || a.delay;
    else if (arg === "--emails" || arg === "--email") a.emails = true;
    else if (arg === "--socials" || arg === "--social") a.socials = true;
    else if (arg === "--enrich") { a.emails = true; a.socials = true; }
    else if (arg === "--min-rating") a.minRating = parseFloat(next());
    else if (arg === "--min-reviews") a.minReviews = parseInt(next(), 10);
    else if (arg === "--has-phone") a.hasPhone = true;
    else if (arg === "--has-website") a.hasWebsite = true;
    else if (arg === "--has-email") { a.hasEmail = true; a.emails = true; }
    else if (arg === "--dedupe") a.dedupe = next() as SearchOptions["dedupe"];
    else if (arg === "--sheet") a.sheet = next();
    else if (arg === "--max-time") a.maxTime = parseInt(next(), 10);
    else if (arg === "-y" || arg === "--yes") a.yes = true;
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg.startsWith("--")) { /* unknown flag ignored */ }
    else if (!a.type && !a.query) a.type = arg;
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-leads"))} ${c("dim", "— free local-business lead finder (Google Maps, no API keys)")}

${c("bold", "Usage")}
  npx lacspace-leads [type] [options]
  npx lacspace-leads convert <file> [-f json|csv|xlsx] [-o out]

${c("bold", "Search options")}
  -t, --type <text>     Business type / keyword, e.g. "restaurants"
      --city <text>     City, e.g. "Kathmandu"
      --area <text>     Area / neighbourhood, e.g. "Baneshwor"
  -q, --query <text>    Raw query verbatim (overrides city/area/type)
      --fields <list>   Columns: ${ALL_FIELDS.join(",")}
  -n, --limit <n>       Max listings to collect   (default 60)
      --no-details      Names + Maps URLs only (fast, no per-listing open)

${c("bold", "Enrichment (visits each website)")}
      --emails          Also find an email from each website
      --socials         Also find Facebook / Instagram / WhatsApp
      --enrich          Both of the above

${c("bold", "Filters")}
      --min-rating <n>  Keep only ratings ≥ n
      --min-reviews <n> Keep only ≥ n reviews
      --has-phone       Keep only leads with a phone
      --has-website     Keep only leads with a website
      --has-email       Keep only leads with an email (implies --emails)
      --dedupe <key>    website | phone | name | none   (default website)

${c("bold", "Output")}
  -f, --format <fmt>    json | csv | xlsx        (default json)
  -o, --out <file>      Output file (default: a slug + date)
      --sheet <name>    Excel sheet name         (default "Leads")

${c("bold", "Runtime")}
      --delay <ms>      Pause between listings    (default 700)
      --max-time <s>    Stop collecting after n seconds
      --headless        Run the browser without a window
  -y, --yes             Skip prompts + the browser-open confirmation
  -h, --help            Show this help

${c("bold", "Examples")}
  npx lacspace-leads restaurants --city Kathmandu --area Baneshwor -f xlsx
  npx lacspace-leads "dental clinic" --city Pokhara --emails --has-email -f csv -n 40
  npx lacspace-leads gyms --city Lalitpur --min-rating 4 --no-details -n 100
  npx lacspace-leads convert leads.json -f xlsx

${c("dim", "Please scrape responsibly: keep volumes small, respect Google's Terms of")}
${c("dim", "Service and local data-protection law, and use only public business data.")}
`;

async function prompt(q: string, fallback = ""): Promise<string> {
  const rl = createInterface({ input: stdin, output: stderr });
  try {
    const ans = (await rl.question(q)).trim();
    return ans || fallback;
  } finally {
    rl.close();
  }
}

/** `lacspace-leads convert <file> [-f fmt] [-o out] [--sheet name]` */
async function runConvert(rest: string[]): Promise<void> {
  const a = parseArgs(rest);
  const input = rest.find((x) => !x.startsWith("-") && x !== a.format && x !== a.out && x !== a.sheet);
  if (!input) { log(c("red", "\n✗ convert needs an input file: lacspace-leads convert <file> [-f fmt] [-o out]\n")); exit(1); return; }
  log(`\n${c("bold", c("magenta", "◆ lacspace-leads convert"))}\n`);
  try {
    const opts: { format?: OutputFormat; out?: string; sheetName?: string } = {};
    if (rest.includes("-f") || rest.includes("--format")) opts.format = a.format;
    if (a.out) opts.out = a.out;
    if (a.sheet) opts.sheetName = a.sheet;
    const r = await convertFile(input, opts);
    log(`  ${c("green", "✔")} Converted ${c("bold", String(r.count))} rows → ${c("cyan", r.out)} ${c("dim", `(${r.format})`)}\n`);
  } catch (err) {
    log(c("red", `\n✗ ${(err as Error).message}\n`));
    exit(1);
  }
}

async function main(): Promise<void> {
  const raw = argv.slice(2);
  if (raw[0] === "convert") { await runConvert(raw.slice(1)); return; }

  const args = parseArgs(raw);
  if (args.help) { stdout.write(HELP + "\n"); return; }

  log(`\n${c("bold", c("magenta", "◆ lacspace-leads"))} ${c("dim", "— Google Maps → JSON/CSV/Excel, free")}\n`);

  if (!args.query && !args.type && !args.yes) {
    args.type = await prompt(`${c("green", "?")} Business type ${c("dim", "(e.g. restaurants)")}: `);
    args.city = args.city ?? (await prompt(`${c("green", "?")} City ${c("dim", "(optional)")}: `));
    args.area = args.area ?? (await prompt(`${c("green", "?")} Area ${c("dim", "(optional)")}: `));
    const fmt = await prompt(`${c("green", "?")} Format ${c("dim", "(json/csv/xlsx)")} ${c("dim", "[json]")}: `, "json");
    if (fmt === "csv" || fmt === "xlsx" || fmt === "json") args.format = fmt;
    const lim = await prompt(`${c("green", "?")} How many ${c("dim", "[60]")}: `, "60");
    args.limit = parseInt(lim, 10) || args.limit;
    const em = await prompt(`${c("green", "?")} Also find emails from websites? ${c("dim", "(slower) [y/N]")} `);
    if (/^y/i.test(em)) args.emails = true;
  }

  let query: string;
  try {
    query = composeQuery(args);
  } catch (err) {
    log(c("red", `\n✗ ${(err as Error).message}`));
    exit(1);
    return;
  }

  // Resolve the field set: user list, else defaults, plus any enrichment opt-ins.
  const base = args.fields ? normalizeFields(args.fields) : [...DEFAULT_FIELDS];
  const wanted = new Set<LeadField>(base);
  if (args.emails) wanted.add("email");
  if (args.socials) { wanted.add("facebook"); wanted.add("instagram"); wanted.add("whatsapp"); }
  const fields = ALL_FIELDS.filter((f) => wanted.has(f));
  const out = resolve(args.out ?? defaultFilename(query, args.format));

  const filters: LeadFilters = {};
  if (args.minRating !== undefined) filters.minRating = args.minRating;
  if (args.minReviews !== undefined) filters.minReviews = args.minReviews;
  if (args.hasPhone) filters.hasPhone = true;
  if (args.hasWebsite) filters.hasWebsite = true;
  if (args.hasEmail) filters.hasEmail = true;
  const hasFilters = Object.keys(filters).length > 0;

  log(`\n  ${c("dim", "search")}  ${c("bold", query)}`);
  log(`  ${c("dim", "fields")}  ${fields.join(", ")}`);
  if (args.emails || args.socials) log(`  ${c("dim", "enrich")}  ${[args.emails && "emails", args.socials && "socials"].filter(Boolean).join(" + ")} ${c("dim", "(visits each website)")}`);
  if (hasFilters) log(`  ${c("dim", "filters")} ${Object.entries(filters).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  log(`  ${c("dim", "limit")}   ${args.limit}   ${c("dim", "format")} ${args.format}   ${c("dim", "→")} ${out}`);
  if (!args.yes) {
    const ok = await prompt(`\n${c("yellow", "!")} This opens a browser and searches Google Maps. Continue? ${c("dim", "[y/N]")} `);
    if (!/^y(es)?$/i.test(ok)) { log(c("dim", "\n  cancelled.\n")); return; }
  }
  log("");

  const controller = new AbortController();
  const onSig = (): void => { controller.abort(); };
  process.once("SIGINT", onSig);

  const opts: SearchOptions = {
    type: args.type ?? "",
    query: args.query ?? "",
    city: args.city ?? "",
    area: args.area ?? "",
    limit: args.limit,
    fields,
    headless: args.headless,
    details: args.details,
    delayMs: args.delay,
    enrich: args.emails || args.socials,
    signal: controller.signal,
    onProgress: (m) => log(`  ${c("cyan", "◷")} ${c("dim", m)}`),
  };
  if (hasFilters) opts.filters = filters;
  if (args.dedupe) opts.dedupe = args.dedupe;
  if (args.maxTime !== undefined) opts.maxMs = args.maxTime * 1000;

  let leads;
  try {
    leads = await searchLeads(opts);
  } catch (err) {
    log(c("red", `\n✗ ${(err as Error).message}`));
    exit(1);
    return;
  } finally {
    process.removeListener("SIGINT", onSig);
  }

  if (leads.length === 0) {
    log(c("yellow", "\n  No leads collected. Try a broader area, looser filters, or a smaller --limit.\n"));
    return;
  }

  const serOpts: { sheetName?: string } = {};
  if (args.sheet) serOpts.sheetName = args.sheet;
  const { data, binary } = serialize(leads, args.format, fields, serOpts);
  writeFileSync(out, binary ? Buffer.from(data as Uint8Array) : (data as string));

  const withPhone = leads.filter((l) => l.phone).length;
  const withSite = leads.filter((l) => l.website).length;
  const withEmail = leads.filter((l) => l.email).length;
  log(`\n  ${c("green", "✔")} Saved ${c("bold", String(leads.length))} leads → ${c("cyan", out)}`);
  const stats = [`${withPhone} with a phone`, `${withSite} with a website`];
  if (args.emails) stats.push(`${withEmail} with an email`);
  log(`    ${c("dim", stats.join(" · "))}\n`);
}

main().catch((err: unknown) => {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
});
