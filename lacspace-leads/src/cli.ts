import { writeFileSync, existsSync, readFileSync, unlinkSync } from "node:fs";
import { resolve, extname } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin, stdout, stderr, argv, exit } from "node:process";
import { scrapeLeads as searchLeads } from "./scrape.js";
import { searchLeadsBatch } from "./batch.js";
import { runConfig, assertConfig } from "./config.js";
import { serialize, computeStats, rowsToLeads } from "./export.js";
import { convertFile, readRows } from "./convert.js";
import { dedupeLeads, subtractLeads } from "./filter.js";
import {
  checkpointPath,
  loadCheckpoint,
  saveCheckpoint,
  clearCheckpoint,
  recordQuery,
  isDone,
  emptyCheckpoint,
  type Checkpoint,
} from "./checkpoint.js";
import { summarize, formatSummary } from "./summary.js";
import { createLiveWriter, type LiveWriter } from "./live.js";
import { leadsToEnrichInput } from "./pipe.js";
import { createPusher, formatPushSummary, maskUrl, resolvePush, validatePushUrl, type Pusher } from "./push.js";
import type { BatchQuery } from "./batch.js";
import { parseLatLngPair, parseDistance } from "./geo.js";
import { sweepLeads, MAX_PER_SEARCH } from "./sweep.js";
import { groupLeads, groupSlug, SPLIT_KEYS, type SplitKey } from "./split.js";
import { composeQuery, defaultFilename, expandQueries, normalizeFields, resolvePreset } from "./query.js";
import type { Lead, LeadStats } from "./types.js";
import {
  ALL_FIELDS,
  DEFAULT_FIELDS,
  ENRICHED_FIELDS,
  FIELD_PRESETS,
  type LeadField,
  type LeadFilters,
  type OutputFormat,
  type SearchOptions,
  type SortKey,
} from "./types.js";

const SOCIAL_FIELDS = ENRICHED_FIELDS.filter((f) => f !== "email");
const OUTPUT_FORMATS: OutputFormat[] = ["json", "ndjson", "csv", "xlsx"];

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");

interface Args {
  city?: string; area?: string; type?: string; query?: string; near?: string; radius?: string;
  fields?: string; preset?: string; format: OutputFormat; out?: string; append: boolean;
  limit: number; total?: number; target?: number; step?: string; tiles?: number; split?: string;
  headless: boolean; details: boolean; delay: number;
  emails: boolean; socials: boolean; verifyEmails: boolean;
  minRating?: number; minReviews?: number; hasPhone: boolean; hasWebsite: boolean; noWebsite: boolean; hasEmail: boolean; hasValidEmail: boolean; hasContact: boolean; nameExclude?: string;
  openNow: boolean; price?: number; category?: string; businessStatus?: string;
  config?: string;
  dedupe?: SearchOptions["dedupe"]; sort?: SortKey; desc?: boolean;
  country?: string; locale?: string; region?: string; concurrency?: number; cleanUrls: boolean;
  proxy?: string; retries?: number; jitter: boolean;
  sheet?: string; maxTime?: number;
  resume: boolean; summary: boolean; dedupeAcross?: string; enrichOut?: string; live: boolean;
  push?: string; pushToken?: string;
  yes: boolean; help: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    format: "json", append: false, limit: 60, headless: false, details: true, delay: 700,
    emails: false, socials: false, verifyEmails: false,
    hasPhone: false, hasWebsite: false, noWebsite: false, hasEmail: false, hasValidEmail: false, hasContact: false,
    openNow: false,
    cleanUrls: true, jitter: false, resume: false, summary: false, live: true, yes: false, help: false,
  };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "--city" || arg === "--cities") a.city = next();
    else if (arg === "--area" || arg === "--areas") a.area = next();
    else if (arg === "-t" || arg === "--type" || arg === "--types") a.type = next();
    else if (arg === "-q" || arg === "--query") a.query = next();
    else if (arg === "--near") a.near = next();
    else if (arg === "--radius") a.radius = next();
    else if (arg === "--fields") a.fields = next();
    else if (arg === "--preset") a.preset = next();
    else if (arg === "-f" || arg === "--format") a.format = next() as OutputFormat;
    else if (arg === "-o" || arg === "--out") a.out = next();
    else if (arg === "--append") a.append = true;
    else if (arg === "-n" || arg === "--limit") a.limit = parseInt(next(), 10) || a.limit;
    else if (arg === "--target" || arg === "--want" || arg === "--goal") a.target = parseInt(next(), 10) || a.target;
    else if (arg === "--step" || arg === "--tile-step") a.step = next();
    else if (arg === "--tiles" || arg === "--max-tiles") a.tiles = parseInt(next(), 10) || a.tiles;
    else if (arg === "--split" || arg === "--split-by") a.split = next();
    else if (arg === "--no-website" || arg === "--without-website") a.noWebsite = true;
    else if (arg === "--total") a.total = parseInt(next(), 10) || a.total;
    else if (arg === "--headless") a.headless = true;
    else if (arg === "--no-details") a.details = false;
    else if (arg === "--delay") a.delay = parseInt(next(), 10) || a.delay;
    else if (arg === "--emails" || arg === "--email") a.emails = true;
    else if (arg === "--socials" || arg === "--social") a.socials = true;
    else if (arg === "--enrich") { a.emails = true; a.socials = true; }
    else if (arg === "--verify-emails" || arg === "--verify") { a.verifyEmails = true; a.emails = true; }
    else if (arg === "--proxy") a.proxy = next();
    else if (arg === "--retries") a.retries = parseInt(next(), 10);
    else if (arg === "--jitter") a.jitter = true;
    else if (arg === "--min-rating") a.minRating = parseFloat(next());
    else if (arg === "--min-reviews") a.minReviews = parseInt(next(), 10);
    else if (arg === "--has-phone") a.hasPhone = true;
    else if (arg === "--has-website") a.hasWebsite = true;
    else if (arg === "--has-email") { a.hasEmail = true; a.emails = true; }
    else if (arg === "--has-valid-email") { a.hasValidEmail = true; a.verifyEmails = true; a.emails = true; }
    else if (arg === "--has-contact") a.hasContact = true;
    else if (arg === "--open-now") a.openNow = true;
    else if (arg === "--price") a.price = parseInt(next(), 10);
    else if (arg === "--category") a.category = next();
    else if (arg === "--business-status") a.businessStatus = next();
    else if (arg === "--name-exclude" || arg === "--exclude-names") a.nameExclude = next();
    else if (arg === "--resume") a.resume = true;
    else if (arg === "--no-live") a.live = false;
    else if (arg === "--live") a.live = true;
    else if (arg === "--summary") a.summary = true;
    else if (arg === "--dedupe-across") a.dedupeAcross = next();
    else if (arg === "--enrich-out") a.enrichOut = next();
    else if (arg === "--config") a.config = next();
    else if (arg === "--push") a.push = next();
    else if (arg === "--push-token") a.pushToken = next();
    else if (arg === "--dedupe") a.dedupe = next() as SearchOptions["dedupe"];
    else if (arg === "--sort") a.sort = next() as SortKey;
    else if (arg === "--desc") a.desc = true;
    else if (arg === "--asc") a.desc = false;
    else if (arg === "--country") a.country = next();
    else if (arg === "--lang" || arg === "--locale") a.locale = next();
    else if (arg === "--region" || arg === "--gl") a.region = next();
    else if (arg === "--concurrency") a.concurrency = parseInt(next(), 10) || a.concurrency;
    else if (arg === "--no-clean-urls") a.cleanUrls = false;
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
  npx lacspace-leads convert <file> [-f json|ndjson|csv|xlsx] [-o out]

${c("bold", "Search options")}
  -t, --type <text>     Business type/keyword. Comma-separate for several,
                        e.g. "restaurants,cafes"
      --city <text>     City. Comma-separate for several.
      --area <text>     Area/neighbourhood. Comma-separate to sweep a whole
                        city, e.g. --area "Baneshwor,Thamel,Patan"
  -q, --query <text>    Raw query verbatim (overrides city/area/type)
      --near <lat,lng>  Centre the search on a coordinate (radius search)
      --radius <dist>   Keep only leads within this of --near, e.g. 2km, 500m, 1mi
      --fields <list>   Columns: ${ALL_FIELDS.join(",")}
      --preset <name>   Field bundle: ${Object.keys(FIELD_PRESETS).join(" | ")}
  -n, --limit <n>       Max listings per SEARCH   (default 60, Google caps ~120)
      --target <n>      How many leads you want IN TOTAL — keeps searching
                        (every area you named, then tiles the map) until it has
                        them. Use this one for 500+.
      --step <dist>     Spacing between map tiles      (default 2.5km)
      --tiles <n>       Most map tiles to try          (default 49)
      --split <key>     Write one file per city | area | type
      --no-website      Only businesses with NO website (the pitch list)
      --total <n>       Cap the merged result (batch searches)
      --no-details      Names + Maps URLs only (fast, no per-listing open)

${c("bold", "Enrichment (visits each website)")}
      --emails          Also find an email from each website
      --socials         Also find Facebook/Instagram/WhatsApp/LinkedIn/X/
                        YouTube/TikTok/Telegram
      --enrich          Both of the above
      --verify-emails   Check each email's domain has MX records (implies --emails)
      --concurrency <n> Websites to enrich in parallel   (default 3)

${c("bold", "Clean-up")}
      --country <c>     Normalise phones to E.164 for this country
                        (ISO-2 like NP/US, or a calling code like 977)
      --no-clean-urls   Don't tidy website URLs (redirects/tracking params)

${c("bold", "Filters & order")}
      --min-rating <n>  Keep only ratings ≥ n
      --min-reviews <n> Keep only ≥ n reviews
      --has-phone       Keep only leads with a phone
      --has-website     Keep only leads with a website
      --has-email       Keep only leads with an email (implies --emails)
      --has-valid-email Keep only leads with an MX-verified email (implies --verify-emails)
      --has-contact     Keep only leads reachable by phone, email OR website
      --open-now        Keep only leads open at scrape time
      --price <1-4>     Keep only leads at this price tier ($=1 … $$$$=4)
      --category <text> Keep only leads whose category/tags contain this text
      --business-status <s>  Keep only this status (operational | closed | temporarily-closed)
      --name-exclude <list>  Drop leads whose name contains any of these terms
      --dedupe <key>    website | phone | name | smart | none   (default smart:
                        same website, else same phone, else same name)
      --dedupe-across <file>  Drop leads already present in an existing master file
      --sort <key>      rating | reviews | name | priceLevel | distance
      --desc / --asc    Sort direction (distance defaults nearest-first)

${c("bold", "Campaigns")}
      --config <file>   Run a saved JSON campaign: { "searches":[…], shared options,
                        "out", "format", "append" }. Repeatable, schedulable.

${c("bold", "Output")}
  -f, --format <fmt>    json | ndjson | csv | xlsx      (default json)
  -o, --out <file>      Output file, or "-" for stdout (default: slug + date)
      --append          Merge into an existing output file (accumulate + dedupe)
      --sheet <name>    Excel sheet name         (default "Leads")
      --summary         Print run stats (rating bands, % with contact, top categories)
      --enrich-out <f>  Also write { name, website, domain } NDJSON for lacspace-enrich
      --resume          Continue an interrupted run: keeps the rows already in the
                        output file, skips those listings and fills up to --target
                        (multi-area sweeps also use their checkpoint file)
      --no-live         Write the file only at the end. By default every lead is
                        added to the file the moment it is found (csv/ndjson rows
                        append, json stays valid, xlsx is rewritten), so stopping
                        early never loses what was collected

${c("bold", "Push to a CRM / Lacspace Mail")}
      --push <url>      Also POST finished leads (batches of 10 / every 3s) to this
                        https endpoint while the file is written as usual
      --push-token <t>  Bearer token for --push. Prefer the env var
                        LACSPACE_LEADS_PUSH_TOKEN (shell history can't see it)

${c("bold", "Runtime")}
      --delay <ms>      Pause between listings    (default 700)
      --jitter          Randomise the delay ±40% (more human)
      --retries <n>     Retry a listing that fails to open   (default 1)
      --max-time <s>    Stop collecting after n seconds
      --proxy <url>     Route the browser via a proxy (http://user:pass@host:port)
      --lang <locale>   Browser locale, e.g. en-US, ne-NP   (default en-US)
      --region <cc>     Region bias for results, e.g. np, us
      --headless        Run the browser without a window
  -y, --yes             Skip prompts + the browser-open confirmation
  -h, --help            Show this help

${c("bold", "Examples")}
  npx lacspace-leads restaurants --city Kathmandu --area Baneshwor -f xlsx
  npx lacspace-leads "dental clinic" --city Pokhara --emails --has-email -f csv -n 40
  npx lacspace-leads gyms --city Lalitpur --min-rating 4 --sort reviews --desc
  npx lacspace-leads cafes --city Kathmandu --area "Thamel,Baneshwor,Patan" --country NP
  npx lacspace-leads salons --city Pokhara --preset outreach --country NP -f csv -o -
  npx lacspace-leads dentists --city Pokhara --verify-emails --has-valid-email -f csv
  npx lacspace-leads cafes --city Kathmandu -o master.csv --append   # accumulate daily
  npx lacspace-leads restaurants --near "27.7172,85.3240" --radius 2km -f csv
  npx lacspace-leads bars --city Pokhara --open-now --price 2 --summary
  npx lacspace-leads cafes --city Kathmandu --area "Thamel,Patan,Baneshwor" --resume -o sweep.csv
  npx lacspace-leads gyms --city Lalitpur --dedupe-across master.csv -o new.csv --append
  npx lacspace-leads clinics --city Pokhara --enrich-out sites.ndjson   # feed lacspace-enrich
  npx lacspace-leads convert leads.json -f xlsx
  LACSPACE_LEADS_PUSH_TOKEN=… npx lacspace-leads restaurants --city Kathmandu --target 300 --push https://api.lacspace.com/api/webmail/leads/import

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

/** Resolve + validate --push (flag → config → env). Exits on a bad URL, before any scraping. */
function setupPush(args: Args, config?: { push?: { url?: string; token?: string } }): { url: string; token?: string } | undefined {
  const p = resolvePush({ flagUrl: args.push, flagToken: args.pushToken, config: config?.push, env: process.env });
  if (!p) {
    if (args.pushToken) log(c("yellow", "  ! --push-token given without --push; ignoring it."));
    return undefined;
  }
  try { validatePushUrl(p.url); } catch (err) {
    log(c("red", `\n✗ ${(err as Error).message}\n`));
    exit(1);
  }
  if (args.pushToken) log(c("yellow", "  ! --push-token is visible in shell history and the process list; prefer LACSPACE_LEADS_PUSH_TOKEN."));
  return p;
}

function startPusher(p: { url: string; token?: string }, file: string, search: { type?: string; city?: string; area?: string; target?: number }): Pusher {
  const s: { type?: string; city?: string; area?: string; target?: number } = {};
  if (search.type) s.type = search.type;
  if (search.city) s.city = search.city;
  if (search.area) s.area = search.area;
  if (search.target !== undefined) s.target = search.target;
  return createPusher({
    url: p.url,
    ...(p.token ? { token: p.token } : {}),
    search: s,
    file,
    onWarn: (m) => log(c("yellow", `  ! ${m}`)),
  });
}

async function endPush(pusher: Pusher | undefined, stats: LeadStats, timeoutMs?: number): Promise<void> {
  if (!pusher) return;
  const st = await pusher.finish(stats, timeoutMs !== undefined ? { timeoutMs } : undefined);
  log(`  ${st.rejected || st.failed || st.dropped ? c("yellow", "!") : c("green", "✔")} ${c("dim", formatPushSummary(st))}`);
}

const pushEcho = (p: { url: string; token?: string }): string => `${maskUrl(p.url)}${p.token ? c("dim", " (token ***)") : c("dim", " (no token)")}`;

/** `lacspace-leads convert <file> [-f fmt] [-o out] [--sheet name]` */
async function runConvert(rest: string[]): Promise<void> {
  const a = parseArgs(rest);
  const input = rest.find((x) => !x.startsWith("-") && x !== a.format && x !== a.out && x !== a.sheet);
  if (!input) { log(c("red", "\n✗ convert needs an input file: lacspace-leads convert <file> [-f fmt] [-o out]\n")); exit(1); return; }
  if ((rest.includes("-f") || rest.includes("--format")) && !OUTPUT_FORMATS.includes(a.format)) {
    log(c("red", `\n✗ Unknown format "${a.format}". Use: ${OUTPUT_FORMATS.join(", ")}.\n`));
    exit(1); return;
  }
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

/** `lacspace-leads --config campaign.json` — run a saved multi-search campaign. */
async function runConfigFile(args: Args): Promise<void> {
  log(`\n${c("bold", c("magenta", "◆ lacspace-leads config"))} ${c("dim", "— running a saved campaign")}\n`);
  let config;
  try {
    config = JSON.parse(readFileSync(resolve(args.config!), "utf8"));
    assertConfig(config);
  } catch (err) {
    log(c("red", `\n✗ Could not load --config: ${(err as Error).message}\n`));
    exit(1); return;
  }

  const format = (config.format ?? args.format) as OutputFormat;
  if (!OUTPUT_FORMATS.includes(format)) { log(c("red", `\n✗ Unknown format "${format}".`)); exit(1); return; }
  const pushCfg = setupPush(args, config);
  if (pushCfg) log(`  ${c("dim", "push")}    ${pushEcho(pushCfg)}`);

  log(`  ${c("dim", "searches")} ${config.searches.length}   ${c("dim", "format")} ${format}${config.append ? c("dim", "  (append)") : ""}${args.resume ? c("dim", "  (resume)") : ""}\n`);

  const out = resolve(args.out ?? config.out ?? defaultFilename("leads-campaign", format));

  // Resume support for scheduled/long campaigns: checkpoint next to `out`.
  let cpFile: string | undefined;
  let checkpoint: Checkpoint | undefined;
  const resumeHooks: {
    skip?: (q: BatchQuery) => boolean;
    seedLeads?: Lead[];
    onQueryDone?: (q: BatchQuery, found: Lead[]) => void;
  } = {};
  if (args.resume) {
    cpFile = checkpointPath(out);
    checkpoint = loadCheckpoint(cpFile) ?? emptyCheckpoint();
    const cp = checkpoint;
    const file = cpFile;
    if (cp.done.length) log(`  ${c("cyan", "◷")} ${c("dim", `resuming — ${cp.done.length} searches already done, ${cp.leads.length} leads carried over`)}`);
    resumeHooks.seedLeads = cp.leads;
    resumeHooks.skip = (q) => isDone(cp, q);
    resumeHooks.onQueryDone = (q, found) => { recordQuery(cp, q, found); saveCheckpoint(file, cp); };
  }

  const uniq = (xs: (string | undefined)[]): string | undefined => [...new Set(xs.map((x) => x?.trim()).filter((x): x is string => !!x))].join(", ") || undefined;
  const pusher = pushCfg
    ? startPusher(pushCfg, out, {
        type: uniq(config.searches.map((q) => q.type ?? q.query)),
        city: uniq(config.searches.map((q) => q.city)),
        area: uniq(config.searches.map((q) => q.area)),
        ...(config.total !== undefined ? { target: config.total } : {}),
      })
    : undefined;

  const controller = new AbortController();
  const onSig = (): void => controller.abort();
  process.once("SIGINT", onSig);
  let leads: Lead[];
  try {
    leads = await runConfig(config, {
      signal: controller.signal,
      onProgress: (m) => log(`  ${c("cyan", "◷")} ${c("dim", m)}`),
      ...(pusher ? { onResult: (l: Lead) => pusher.push(l) } : {}),
      ...resumeHooks,
    });
  } catch (err) {
    log(c("red", `\n✗ ${(err as Error).message}`));
    await endPush(pusher, computeStats([]), 3000);
    exit(1); return;
  } finally {
    process.removeListener("SIGINT", onSig);
  }
  if (!leads.length) { log(c("yellow", "\n  No leads collected.\n")); if (cpFile) clearCheckpoint(cpFile); await endPush(pusher, computeStats([])); return; }

  const fields = config.fields
    ? normalizeFields(config.fields as string[])
    : ALL_FIELDS.filter((f) => leads.some((l) => l[f] !== undefined));

  // Cross-file dedupe (drop leads already in a master file), same as the main path.
  if (args.dedupeAcross && existsSync(args.dedupeAcross)) {
    try {
      const master = rowsToLeads(await readRows(args.dedupeAcross));
      const before = leads.length;
      leads = subtractLeads(leads, master, (config.dedupe ?? "smart") as NonNullable<SearchOptions["dedupe"]>);
      log(`  ${c("cyan", "◷")} ${c("dim", `dropped ${before - leads.length} already in ${args.dedupeAcross} → ${leads.length} new`)}`);
    } catch (err) { log(c("yellow", `  ! couldn't read --dedupe-across (${(err as Error).message})`)); }
  }

  if ((args.append || config.append) && existsSync(out)) {
    try {
      const existing = rowsToLeads(await readRows(out));
      const before = existing.length;
      leads = dedupeLeads([...existing, ...leads], config.dedupe ?? "smart");
      log(`  ${c("cyan", "◷")} ${c("dim", `merged with ${before} existing → ${leads.length} total`)}`);
    } catch (err) { log(c("yellow", `  ! couldn't append (${(err as Error).message}); overwriting`)); }
  }

  if (args.enrichOut) {
    const inputs = leadsToEnrichInput(leads);
    const nd = inputs.map((o) => JSON.stringify(o)).join("\n") + (inputs.length ? "\n" : "");
    const enrichPath = resolve(args.enrichOut);
    writeFileSync(enrichPath, nd);
    log(`  ${c("cyan", "◷")} ${c("dim", `wrote ${inputs.length} enrich input${inputs.length === 1 ? "" : "s"} → ${enrichPath}`)}`);
  }

  const serOpts: { sheetName?: string } = {};
  if (args.sheet ?? config.sheet) serOpts.sheetName = (args.sheet ?? config.sheet) as string;
  const { data, binary } = serialize(leads, format, fields, serOpts);
  writeFileSync(out, binary ? Buffer.from(data as Uint8Array) : (data as string));
  if (cpFile) clearCheckpoint(cpFile);
  const s = computeStats(leads);
  log(`\n  ${c("green", "✔")} Saved ${c("bold", String(leads.length))} leads → ${c("cyan", out)}`);
  log(`    ${c("dim", `${s.withPhone} with a phone · ${s.withWebsite} with a website · ${s.withEmail} with an email`)}`);
  await endPush(pusher, s);
  if (args.summary) {
    log("");
    formatSummary(summarize(leads)).split("\n").forEach((line, i) => {
      log("  " + (i === 0 ? c("bold", c("magenta", line)) : c("dim", line)));
    });
  }
  log("");
}

async function main(): Promise<void> {
  const raw = argv.slice(2);
  if (raw[0] === "convert") { await runConvert(raw.slice(1)); return; }

  const args = parseArgs(raw);
  if (args.help) { stdout.write(HELP + "\n"); return; }

  if (args.config) { await runConfigFile(args); return; }

  log(`\n${c("bold", c("magenta", "◆ lacspace-leads"))} ${c("dim", "— Google Maps → JSON/CSV/Excel, free")}\n`);

  if (!args.query && !args.type && !args.yes) {
    args.type = await prompt(`${c("green", "?")} Business type ${c("dim", "(e.g. restaurants)")}: `);
    args.city = args.city ?? (await prompt(`${c("green", "?")} City ${c("dim", "(one, or several: Kathmandu, Pokhara)")}: `));
    args.area = args.area ?? (await prompt(`${c("green", "?")} Area ${c("dim", "(optional, several allowed: Baneshwor, Thamel)")}: `));
    const fmt = await prompt(`${c("green", "?")} Format ${c("dim", "(json/csv/xlsx)")} ${c("dim", "[json]")}: `, "json");
    if (fmt === "csv" || fmt === "xlsx" || fmt === "json") args.format = fmt;
    const lim = await prompt(`${c("green", "?")} How many leads in total ${c("dim", "[60]")}: `, "60");
    const wanted = parseInt(lim, 10) || args.limit;
    // Above what a single Google search returns, switch to a target sweep so the
    // number typed here is the number actually collected.
    if (wanted > MAX_PER_SEARCH) {
      args.target = wanted;
      log(`  ${c("dim", `${wanted} is more than one search returns, so I'll sweep every area, then tile the map.`)}`);
    } else {
      args.limit = wanted;
    }
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

  if (!OUTPUT_FORMATS.includes(args.format)) {
    log(c("red", `\n✗ Unknown format "${args.format}". Use: ${OUTPUT_FORMATS.join(", ")}.`));
    exit(1);
    return;
  }
  if (args.preset && !resolvePreset(args.preset)) {
    log(c("red", `\n✗ Unknown preset "${args.preset}". Use: ${Object.keys(FIELD_PRESETS).join(", ")}.`));
    exit(1);
    return;
  }
  const pushCfg = setupPush(args);

  // Radius search: parse the centre point and (optional) radius up front.
  const nearPoint = args.near ? parseLatLngPair(args.near) : undefined;
  const tileStepM = args.step ? parseDistance(args.step) : undefined;

  // --split city/area reads each lead's ADDRESS and --no-website reads its
  // WEBSITE; both only exist when listings are opened. Say so rather than
  // quietly filing every lead under "other".
  if (!args.details && (args.split || args.noWebsite)) {
    const needs = [args.split ? `--split ${args.split}` : "", args.noWebsite ? "--no-website" : ""].filter(Boolean).join(" and ");
    log(c("yellow", `  ! ${needs} needs each listing's details, but --no-details is on — turning details back on.`));
    args.details = true;
  }
  if (args.near && !nearPoint) {
    log(c("red", `\n✗ --near must be "lat,lng", e.g. --near "27.7172,85.3240".`));
    exit(1);
    return;
  }
  const radiusM = args.radius ? parseDistance(args.radius) : undefined;
  if (args.radius && radiusM === undefined) {
    log(c("red", `\n✗ --radius must be a distance like 2km, 500m or 1mi.`));
    exit(1);
    return;
  }
  if (args.radius && !nearPoint) {
    log(c("red", `\n✗ --radius needs a centre — add --near "lat,lng".`));
    exit(1);
    return;
  }

  // Resolve the field set: explicit list wins, else a preset, else defaults;
  // then fold in any enrichment opt-ins.
  const base = args.fields
    ? normalizeFields(args.fields)
    : resolvePreset(args.preset) ?? [...DEFAULT_FIELDS];
  const wanted = new Set<LeadField>(base);
  if (args.emails) wanted.add("email");
  if (args.socials) for (const f of SOCIAL_FIELDS) wanted.add(f);
  if (args.verifyEmails) { wanted.add("email"); wanted.add("emailStatus"); }
  if (nearPoint) wanted.add("distanceKm");
  // Make sure a filter always has the column it needs to judge, even under a
  // narrow --fields / --preset.
  if (args.openNow) wanted.add("openNow");
  if (args.price !== undefined) wanted.add("priceLevel");
  if (args.businessStatus) wanted.add("businessStatus");
  if (args.category) { wanted.add("category"); wanted.add("categories"); }
  const fields = ALL_FIELDS.filter((f) => wanted.has(f));
  const toStdout = args.out === "-";
  const out = toStdout ? "-" : resolve(args.out ?? defaultFilename(query, args.format));

  const filters: LeadFilters = {};
  if (args.minRating !== undefined) filters.minRating = args.minRating;
  if (args.minReviews !== undefined) filters.minReviews = args.minReviews;
  if (args.hasPhone) filters.hasPhone = true;
  if (args.hasWebsite) filters.hasWebsite = true;
  if (args.noWebsite) filters.noWebsite = true;
  if (args.hasEmail) filters.hasEmail = true;
  if (args.hasValidEmail) filters.hasValidEmail = true;
  if (args.hasContact) filters.hasContact = true;
  if (args.openNow) filters.openNow = true;
  if (args.price !== undefined) {
    if (!(args.price >= 1 && args.price <= 4)) {
      log(c("red", `\n✗ --price must be 1–4 ($ … $$$$).`));
      exit(1);
      return;
    }
    filters.priceLevel = args.price;
  }
  if (args.category) filters.category = args.category;
  if (args.businessStatus) filters.businessStatus = args.businessStatus;
  if (args.nameExclude) filters.excludeNames = args.nameExclude.split(",").map((s) => s.trim()).filter(Boolean);
  const hasFilters = Object.keys(filters).length > 0;

  // A comma-separated type/city/area fans out into several searches.
  const queries = expandQueries({
    type: args.type ?? "",
    city: args.city ?? "",
    area: args.area ?? "",
    query: args.query ?? "",
  });
  const isBatch = queries.length > 1;

  if (isBatch) log(`\n  ${c("dim", "searches")} ${c("bold", String(queries.length))} ${c("dim", "→")} ${queries.map((q) => { try { return composeQuery(q); } catch { return "?"; } }).join("  ·  ")}`);
  else log(`\n  ${c("dim", "search")}  ${c("bold", query)}`);
  log(`  ${c("dim", "fields")}  ${fields.join(", ")}`);
  if (args.emails || args.socials) log(`  ${c("dim", "enrich")}  ${[args.emails && "emails", args.socials && "socials"].filter(Boolean).join(" + ")} ${c("dim", `(${args.concurrency ?? 3}× parallel, visits each website)`)}`);
  if (args.verifyEmails) log(`  ${c("dim", "verify")}  email domains (MX lookup)`);
  if (hasFilters) log(`  ${c("dim", "filters")} ${Object.entries(filters).map(([k, v]) => `${k}=${v}`).join(", ")}`);
  if (nearPoint) log(`  ${c("dim", "near")}    ${nearPoint.lat},${nearPoint.lng}${radiusM !== undefined ? c("dim", ` (within ${args.radius})`) : c("dim", " (centred, no radius filter)")}`);
  if (args.sort) log(`  ${c("dim", "sort")}    ${args.sort} ${args.desc === false ? "asc" : "desc"}`);
  else if (nearPoint) log(`  ${c("dim", "sort")}    distance (nearest first)`);
  if (args.country) log(`  ${c("dim", "phones")}  E.164 for ${args.country}`);
  if (args.proxy) log(`  ${c("dim", "proxy")}   ${args.proxy.replace(/\/\/[^@]+@/, "//***@")}`);
  if (pushCfg) log(`  ${c("dim", "push")}    ${pushEcho(pushCfg)} ${c("dim", "(the file is written as well)")}`);
  log(`  ${c("dim", "limit")}   ${args.limit}${isBatch ? "/search" : ""}${args.total ? ` (cap ${args.total})` : ""}   ${c("dim", "format")} ${args.format}   ${c("dim", "→")} ${toStdout ? "stdout" : out}${args.append ? c("dim", " (append)") : ""}`);
  if (!args.yes) {
    const ok = await prompt(`\n${c("yellow", "!")} This opens a browser and searches Google Maps. Continue? ${c("dim", "[y/N]")} `);
    if (!/^y(es)?$/i.test(ok)) { log(c("dim", "\n  cancelled.\n")); return; }
  }
  log("");

  const controller = new AbortController();
  const onSig = (): void => {
    if (controller.signal.aborted) {
      writerRef.current?.flush();
      log(c("yellow", "\n  ! Quit. Rows already written stay in the file; --resume continues from them.\n"));
      if (pusherRef.current) {
        const p = pusherRef.current;
        pusherRef.current = undefined;
        void endPush(p, computeStats([...(writerRef.current?.leads ?? [])]), 2000).finally(() => exit(130));
        return;
      }
      exit(130);
    }
    controller.abort();
    log(c("yellow", "\n  ! Stopping — finishing the leads in hand. Press Ctrl-C again to quit at once (rows already written stay in the file)."));
  };
  const writerRef: { current?: LiveWriter } = {};
  const pusherRef: { current?: Pusher } = {};
  process.on("SIGINT", onSig);

  // Rows already in the output (append / resume) and in a master file, read BEFORE the run:
  // the live writer rewrites the output as it goes.
  let existing: Lead[] = [];
  if ((args.append || args.resume) && !toStdout && existsSync(out)) {
    try { existing = rowsToLeads(await readRows(out)); } catch (err) { log(c("yellow", `  ! couldn't read "${out}" (${(err as Error).message}); starting it fresh`)); }
  }
  let master: Lead[] | undefined;
  if (args.dedupeAcross && existsSync(args.dedupeAcross)) {
    try { master = rowsToLeads(await readRows(args.dedupeAcross)); } catch (err) { log(c("yellow", `  ! couldn't read --dedupe-across "${args.dedupeAcross}" (${(err as Error).message}); keeping all`)); }
  }
  const dedupeBy = args.dedupe ?? "smart";
  const inMaster = master?.length ? (l: Lead): boolean => subtractLeads([l], master!, dedupeBy).length === 0 : undefined;
  // --resume on a single search or a --target run continues from the rows in the file.
  const resumeRows = args.resume && !isBatch ? existing : [];
  if (resumeRows.length) log(`  ${c("cyan", "◷")} ${c("dim", `resuming — ${resumeRows.length} leads already in ${out}; skipping those listings`)}`);

  // Live output: each finished lead goes into the file the moment it is ready.
  const liveFormat = toStdout ? (args.format === "csv" || args.format === "ndjson") : true;
  let writer: LiveWriter | undefined;
  const outExisted = !toStdout && existsSync(out);
  // Nothing found: don't leave behind a file this run created empty.
  const dropEmpty = (): void => {
    if (!writer || toStdout) return;
    if (outExisted) writer.finish([...existing]);
    else { writer.finish([]); try { unlinkSync(out); } catch { /* already gone */ } }
  };
  if (args.live && liveFormat && !(toStdout && args.split)) {
    try {
      writer = createLiveWriter({
        file: out, format: args.format, fields, dedupe: dedupeBy, seed: existing,
        ...(args.sheet ? { sheetName: args.sheet } : {}),
        ...(toStdout ? { stdout } : {}),
        onWriteError: (e) => log(c("yellow", `  ! couldn't write ${out} (${e.message}) — is it open in another app? Rows are kept and written as soon as it's free.`)),
      });
      writerRef.current = writer;
      if (!toStdout) log(`  ${c("cyan", "◷")} ${c("dim", `writing live → ${out}`)}`);
    } catch (err) { log(c("yellow", `  ! live output off: ${(err as Error).message}`)); }
  }
  const goal = args.target ?? (isBatch ? args.total : undefined) ?? (isBatch ? undefined : args.limit);
  // --push: finished leads also stream to an endpoint, in the background. The file is written as usual.
  const pusher = pushCfg
    ? startPusher(pushCfg, toStdout ? "stdout" : out, {
        ...(args.type ? { type: args.type } : args.query ? { type: args.query } : {}),
        ...(args.city ? { city: args.city } : {}),
        ...(args.area ? { area: args.area } : {}),
        ...(goal !== undefined ? { target: goal } : {}),
      })
    : undefined;
  pusherRef.current = pusher;
  const finishPush = async (list: Lead[], timeoutMs?: number): Promise<void> => {
    const p = pusherRef.current;
    pusherRef.current = undefined;
    await endPush(p, computeStats(list), timeoutMs);
  };
  const startedAt = Date.now();
  let fresh0 = 0;
  const onResult = (lead: Lead): void => {
    if (inMaster?.(lead)) return;
    if (writer && !writer.add(lead)) return;
    pusher?.push(lead);
    fresh0++;
    const have = resumeRows.length + fresh0;
    const mins = (Date.now() - startedAt) / 60000;
    const rate = mins > 0.05 ? fresh0 / mins : 0;
    const left = goal !== undefined ? Math.max(0, goal - have) : 0;
    const eta = rate > 0 && left > 0 ? `, ~${Math.ceil(left / rate)} min left` : "";
    const bits = [lead.phone, lead.website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, ""), lead.email].filter(Boolean).join(" · ");
    log(`  ${c("green", "✚")} ${c("bold", goal !== undefined ? `${have}/${goal}` : String(have))} ${lead.name ?? "(no name)"}${bits ? c("dim", ` — ${bits}`) : ""}${rate ? c("dim", `  (${rate.toFixed(1)}/min${eta})`) : ""}`);
  };

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
    cleanUrls: args.cleanUrls,
    enrich: args.emails || args.socials,
    verifyEmails: args.verifyEmails,
    jitter: args.jitter,
    signal: controller.signal,
    onProgress: (m) => log(`  ${c("cyan", "◷")} ${c("dim", m)}`),
    onResult,
  };
  if (resumeRows.length) {
    const names = new Set(resumeRows.map((l) => l.name?.trim().toLowerCase()).filter(Boolean));
    const urls = new Set(resumeRows.map((l) => l.mapsUrl).filter(Boolean));
    opts.skipListing = (l) => urls.has(l.href) || (!!l.name && names.has(l.name.trim().toLowerCase()));
  }
  // Count only what really lands in the file toward a target (master duplicates don't).
  if (args.target !== undefined && (resumeRows.length || inMaster)) opts.remaining = () => args.target! - resumeRows.length - fresh0;
  if (hasFilters) opts.filters = filters;
  opts.dedupe = dedupeBy;
  if (nearPoint) opts.near = { lat: nearPoint.lat, lng: nearPoint.lng };
  if (radiusM !== undefined) opts.radiusM = radiusM;
  // Nearest-first is the natural default for a radius search.
  if (args.sort) opts.sort = args.sort;
  else if (nearPoint) opts.sort = "distance";
  if (args.desc !== undefined) opts.sortDir = args.desc ? "desc" : "asc";
  if (args.country) opts.country = args.country;
  if (args.locale) opts.locale = args.locale;
  if (args.region) opts.region = args.region;
  if (args.concurrency !== undefined) opts.concurrency = args.concurrency;
  if (args.proxy) opts.proxy = args.proxy;
  if (args.retries !== undefined) opts.retries = args.retries;
  if (args.maxTime !== undefined) opts.maxMs = args.maxTime * 1000;

  // Resume support: for a multi-search sweep, persist progress to a checkpoint
  // next to the output file and skip queries already collected on a prior run.
  let cpFile: string | undefined;
  let checkpoint: Checkpoint | undefined;
  if (args.resume && !toStdout) {
    if (isBatch) {
      cpFile = checkpointPath(out);
      checkpoint = loadCheckpoint(cpFile) ?? emptyCheckpoint();
      if (checkpoint.done.length) {
        log(`  ${c("cyan", "◷")} ${c("dim", `resuming — ${checkpoint.done.length} of ${queries.length} searches already done, ${checkpoint.leads.length} leads carried over`)}`);
      }
    } else {
      log(c("dim", "  (--resume applies to multi-search sweeps; ignored for a single search)"));
    }
  }

  let leads;
  let sweptShort = false;
  try {
    if (args.target !== undefined) {
      // Target mode: keep searching until we have the number that was asked for.
      const sweepOpts = {
        ...opts,
        target: args.target,
        onNotice: (m: string) => log(`  ${c("cyan", "◷")} ${c("dim", m)}`),
      } as Parameters<typeof sweepLeads>[0];
      if (tileStepM !== undefined) sweepOpts.stepM = tileStepM;
      if (args.tiles !== undefined) sweepOpts.maxTiles = args.tiles;
      if (args.limit !== 60) sweepOpts.perSearch = args.limit;
      const swept = await sweepLeads(sweepOpts);
      leads = swept.leads;
      sweptShort = swept.stats.saturated && leads.length < args.target;
      log(`  ${c("cyan", "◷")} ${c("dim", `${swept.stats.searches} search${swept.stats.searches === 1 ? "" : "es"} + ${swept.stats.tiles} map tile${swept.stats.tiles === 1 ? "" : "s"} → ${swept.stats.unique} unique`)}`);
    } else if (isBatch) {
      const batchOpts = { ...opts } as SearchOptions & { total?: number } & {
        skip?: (q: BatchQuery) => boolean;
        seedLeads?: Lead[];
        onQueryDone?: (q: BatchQuery, found: Lead[]) => void;
      };
      if (args.total !== undefined) batchOpts.total = args.total;
      if (checkpoint && cpFile) {
        const cp = checkpoint;
        const file = cpFile;
        batchOpts.seedLeads = cp.leads;
        batchOpts.skip = (q) => isDone(cp, q);
        batchOpts.onQueryDone = (q, found) => { recordQuery(cp, q, found); saveCheckpoint(file, cp); };
      }
      leads = await searchLeadsBatch(queries, batchOpts);
    } else {
      leads = await searchLeads(opts);
    }
  } catch (err) {
    if (writer && writer.added) {
      writer.flush();
      log(c("yellow", `\n  ! ${(err as Error).message}`));
      log(`  ${c("green", "✔")} ${c("bold", String(writer.count))} leads are saved in ${c("cyan", out)}. Run the same command with ${c("bold", "--resume")} to continue.\n`);
      await finishPush([...writer.leads], 3000);
      exit(controller.signal.aborted ? 130 : 1);
      return;
    }
    log(c("red", `\n✗ ${(err as Error).message}`));
    await finishPush([], 3000);
    exit(1);
    return;
  } finally {
    process.removeListener("SIGINT", onSig);
  }
  const stoppedEarly = controller.signal.aborted;

  if (sweptShort) {
    log(c("yellow", `\n  ! The map ran out of new results at ${leads.length} — that is everything Google lists here.`));
    log(c("dim", "    Widen it: more areas (--areas a,b,c), more cities (--cities x,y), a bigger --step, or related --types.\n"));
  } else if (args.target === undefined && args.limit > leads.length && leads.length >= MAX_PER_SEARCH - 20) {
    log(c("yellow", `\n  ! Google stops a single search at about ${MAX_PER_SEARCH} results, so --limit ${args.limit} could only return ${leads.length}.`));
    log(c("dim", `    To really get ${args.limit}, ask for a total: --target ${args.limit} — it sweeps every area you name, then tiles the map.\n`));
  }

  if (leads.length === 0 && !resumeRows.length) {
    log(c("yellow", "\n  No leads collected. Try a broader area, looser filters, or a smaller --limit.\n"));
    dropEmpty();
    if (cpFile) clearCheckpoint(cpFile);
    await finishPush([]);
    return;
  }

  // Cross-file dedupe: drop leads already present in an existing master file, so
  // this run only writes what's genuinely new.
  if (master) {
    const before = leads.length;
    leads = subtractLeads(leads, master, dedupeBy);
    log(`  ${c("cyan", "◷")} ${c("dim", `dropped ${before - leads.length} already in ${args.dedupeAcross} → ${leads.length} new`)}`);
    if (leads.length === 0) {
      log(c("yellow", "\n  Nothing new — every lead was already in the master file.\n"));
      dropEmpty();
      if (cpFile) clearCheckpoint(cpFile);
      await finishPush([]);
      return;
    }
  }

  // Append mode: merge the new leads onto whatever's already in the file, then
  // dedupe — so repeated runs accumulate one master list.
  let fresh = leads.length;
  if ((args.append || resumeRows.length) && !toStdout && existing.length) {
    const before = existing.length;
    const merged: Lead[] = dedupeLeads([...existing, ...leads], dedupeBy);
    fresh = merged.length - before;
    log(`  ${c("cyan", "◷")} ${c("dim", `merged with ${before} existing → ${merged.length} total (${fresh} new)`)}`);
    leads = merged;
    if (args.target !== undefined && resumeRows.length) leads = leads.slice(0, Math.max(args.target, before));
  }

  // Optional: write the enrich-pipeline input (name/website/domain) as NDJSON,
  // ready to feed to lacspace-enrich. No hard dependency on that package.
  if (args.enrichOut) {
    const inputs = leadsToEnrichInput(leads);
    const nd = inputs.map((o) => JSON.stringify(o)).join("\n") + (inputs.length ? "\n" : "");
    const enrichPath = resolve(args.enrichOut);
    writeFileSync(enrichPath, nd);
    log(`  ${c("cyan", "◷")} ${c("dim", `wrote ${inputs.length} enrich input${inputs.length === 1 ? "" : "s"} → ${enrichPath} (feed to lacspace-enrich)`)}`);
  }

  // Optional: a headline summary of the run (rating bands, contact %, top cats).
  const printSummary = (): void => {
    if (!args.summary) return;
    log("");
    formatSummary(summarize(leads)).split("\n").forEach((line, i) => {
      log("  " + (i === 0 ? c("bold", c("magenta", line)) : c("dim", line)));
    });
  };

  const serOpts: { sheetName?: string } = {};
  if (args.sheet) serOpts.sheetName = args.sheet;
  const { data, binary } = serialize(leads, args.format, fields, serOpts);

  if (toStdout) {
    // Write the payload to real stdout so it can be piped; keep logs on stderr.
    // (Already streamed row by row when live.)
    if (!writer) {
      stdout.write(binary ? Buffer.from(data as Uint8Array) : (data as string));
      if (!binary) stdout.write("\n");
    }
    log(`\n  ${c("green", "✔")} ${c("bold", String(leads.length))} leads written to stdout ${c("dim", `(${args.format})`)}\n`);
    await finishPush(leads);
    printSummary();
    return;
  }

  if (args.split) {
    const key = args.split.trim().toLowerCase() as SplitKey;
    if (!SPLIT_KEYS.includes(key)) {
      log(c("yellow", `  ! --split "${args.split}" is not one of ${SPLIT_KEYS.join(", ")} — writing a single file instead.`));
    } else {
      const requested = (key === "area" ? args.area : key === "city" ? args.city : "")
        ?.split(",").map((x) => x.trim()).filter(Boolean) ?? [];
      const groups = groupLeads(leads, key, requested);
      const ext = extname(out) || `.${args.format}`;
      const stem = out.slice(0, out.length - ext.length);
      log("");
      for (const [group, rows] of groups) {
        const file = `${stem}-${groupSlug(group)}${ext}`;
        const part = serialize(rows, args.format, fields, serOpts);
        writeFileSync(file, part.binary ? Buffer.from(part.data as Uint8Array) : (part.data as string));
        log(`  ${c("green", "✔")} ${c("bold", String(rows.length))} leads → ${c("cyan", file)}`);
      }
    }
  }

  // The final file: the same rows the live file grew, now sorted/merged as asked.
  if (writer) writer.finish(leads);
  else writeFileSync(out, binary ? Buffer.from(data as Uint8Array) : (data as string));
  if (cpFile && !stoppedEarly) clearCheckpoint(cpFile); // sweep finished cleanly — drop the checkpoint

  const s = computeStats(leads);
  log(`\n  ${c("green", "✔")} Saved ${c("bold", String(leads.length))} leads → ${c("cyan", out)}${args.append && fresh !== leads.length ? c("dim", ` (${fresh} new)`) : ""}`);
  const parts = [`${s.withPhone} with a phone`, `${s.withWebsite} with a website`];
  if (args.emails) parts.push(`${s.withEmail} with an email`);
  if (args.verifyEmails) parts.push(`${s.withValidEmail} MX-valid`);
  if (args.socials) parts.push(`${s.withSocial} with a social link`);
  if (s.avgRating !== undefined) parts.push(`avg ★ ${s.avgRating}`);
  log(`    ${c("dim", parts.join(" · "))}`);
  if (stoppedEarly) log(c("yellow", `  ! Stopped early. Run the same command with --resume to carry on from these ${leads.length}.`));
  await finishPush(leads);
  printSummary();
  log("");
}

main().catch((err: unknown) => {
  log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
  exit(1);
});
