import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { stdout, stderr, argv, exit } from "node:process";
import { scrape } from "./scrape.js";
import { crawl } from "./crawl.js";
import { serializeRows, convertFile } from "./convert.js";
import type { AutoOptions, CrawlOptions, OutputFormat, Schema, ScrapeOptions } from "./types.js";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m", red: "\x1b[31m", magenta: "\x1b[35m",
};
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;
const log = (s = ""): void => void stderr.write(s + "\n");

const OUTPUT_FORMATS: OutputFormat[] = ["json", "ndjson", "csv", "xlsx"];
const AUTO_KEYS = ["metadata", "headings", "links", "images", "emails", "phones", "openGraph", "jsonLd", "feeds", "text", "tables"];

interface Args {
  urls: string[];
  fields: [string, string][];
  schema?: string; item?: string; auto?: string | boolean;
  engine?: "http" | "browser"; waitFor?: string;
  format: OutputFormat; out?: string; sheet?: string;
  headers?: string; userAgent?: string; timeout?: number; retries?: number;
  delay?: number; jitter: boolean; proxy?: string; concurrency?: number; robots: boolean;
  urlsFile?: string;
  depth?: number; limit?: number; allOrigins: boolean; include?: string; exclude?: string; linkSelector?: string; sitemap?: string;
  help: boolean;
}

function parseArgs(list: string[]): Args {
  const a: Args = { urls: [], fields: [], format: "json", jitter: false, robots: true, allOrigins: false, help: false };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    if (arg === "-s" || arg === "--schema") a.schema = next();
    else if (arg === "--field") { const [n, ...r] = next().split("="); if (n) a.fields.push([n, r.join("=")]); }
    else if (arg === "--item") a.item = next();
    else if (arg === "--auto") { const v = list[i + 1]; if (v && !v.startsWith("-")) { a.auto = next(); } else a.auto = true; }
    else if (arg === "--engine") a.engine = next() as Args["engine"];
    else if (arg === "--browser") a.engine = "browser";
    else if (arg === "--wait-for") a.waitFor = next();
    else if (arg === "-f" || arg === "--format") a.format = next() as OutputFormat;
    else if (arg === "-o" || arg === "--out") a.out = next();
    else if (arg === "--sheet") a.sheet = next();
    else if (arg === "--headers") a.headers = next();
    else if (arg === "--user-agent" || arg === "--ua") a.userAgent = next();
    else if (arg === "--timeout") a.timeout = parseInt(next(), 10);
    else if (arg === "--retries") a.retries = parseInt(next(), 10);
    else if (arg === "--delay") a.delay = parseInt(next(), 10);
    else if (arg === "--jitter") a.jitter = true;
    else if (arg === "--proxy") a.proxy = next();
    else if (arg === "--concurrency") a.concurrency = parseInt(next(), 10);
    else if (arg === "--no-robots") a.robots = false;
    else if (arg === "--urls") a.urlsFile = next();
    else if (arg === "--depth") a.depth = parseInt(next(), 10);
    else if (arg === "--limit" || arg === "-n") a.limit = parseInt(next(), 10);
    else if (arg === "--all-origins") a.allOrigins = true;
    else if (arg === "--include") a.include = next();
    else if (arg === "--exclude") a.exclude = next();
    else if (arg === "--link-selector") a.linkSelector = next();
    else if (arg === "--sitemap") a.sitemap = next();
    else if (arg === "-h" || arg === "--help") a.help = true;
    else if (arg.startsWith("-")) { /* unknown flag ignored */ }
    else a.urls.push(arg);
  }
  return a;
}

const HELP = `
${c("bold", c("magenta", "◆ lacspace-scraper"))} ${c("dim", "— free website scraper: any site → JSON/CSV/Excel, no API keys")}

${c("bold", "Usage")}
  npx lacspace-scraper <url...> [options]           ${c("dim", "scrape one or more pages")}
  npx lacspace-scraper crawl <url> [options]        ${c("dim", "follow links across a site")}
  npx lacspace-scraper convert <file> [-f fmt] [-o] ${c("dim", "JSON↔NDJSON↔CSV↔Excel")}

${c("bold", "Extraction")}
  -s, --schema <json|file>  CSS-selector schema, e.g. '{"title":"h1","price":".price"}'
      --field <name=sel>    Add one field; sel can end @attr and [] for all,
                            e.g. --field "links=a@href[]"  --field "price=.price"
      --item <selector>     Repeating container → one record per match (lists/cards)
      --auto [list]         Auto-detect. Bare = metadata,headings,links,images,og,jsonLd.
                            Or pick: ${AUTO_KEYS.join(",")}

${c("bold", "Engine & network")}
      --browser             Render with a real browser (JS-heavy sites; needs playwright-core)
      --wait-for <selector> Browser: wait for this selector before extracting
      --user-agent <ua>     Custom User-Agent      --headers <json>   Extra request headers
      --timeout <ms>        Per-request timeout (default 15000)   --retries <n>  (default 1)
      --delay <ms>          Pause between requests   --jitter   Randomise it ±40%
      --concurrency <n>     Parallel requests (default 4)   --proxy <url>   Browser proxy
      --no-robots           Do NOT respect robots.txt (respected by default)

${c("bold", "Crawl (subcommand)")}
      --depth <n>           Link depth from the seed (default 2)
  -n, --limit <n>           Max pages to fetch (default 50)
      --sitemap <url>       Seed the crawl from a sitemap.xml
      --all-origins         Follow off-site links (default: same origin only)
      --include <list>      Only URLs containing one of these (comma-separated)
      --exclude <list>      Skip URLs containing any of these
      --link-selector <sel> Which links to follow (default a[href])

${c("bold", "Output")}
  -f, --format <fmt>        json | ndjson | csv | xlsx   (default json)
  -o, --out <file>          Output file, or "-" for stdout   --sheet <name>  Excel tab
      --urls <file>         Read URLs to scrape from a file (one per line)

${c("bold", "Examples")}
  npx lacspace-scraper https://example.com --auto -f json
  npx lacspace-scraper https://news.site --item "article" --field "title=h2" --field "url=a@href" -f csv
  npx lacspace-scraper https://shop.site --field "name=.product h3" --field "price=.price" -f xlsx
  npx lacspace-scraper crawl https://docs.site --depth 2 --limit 40 --auto metadata,text -f ndjson
  npx lacspace-scraper https://app.site --browser --wait-for ".loaded" --auto
  npx lacspace-scraper convert data.json -f xlsx

${c("dim", "Please scrape responsibly: respect robots.txt, each site's Terms and local")}
${c("dim", "data-protection law; keep volumes modest and identify your bot honestly.")}
`;

function buildSchema(a: Args): Schema | undefined {
  const schema: Schema = {};
  if (a.schema) {
    const raw = a.schema.trim();
    const json = raw.startsWith("{") ? raw : (existsSync(raw) ? readFileSync(raw, "utf8") : "");
    if (json) {
      try { Object.assign(schema, JSON.parse(json)); }
      catch { log(c("red", `\n✗ --schema is not valid JSON.\n`)); exit(1); }
    }
  }
  for (const [name, spec] of a.fields) {
    let s = spec;
    const all = s.endsWith("[]");
    if (all) s = s.slice(0, -2);
    const at = s.indexOf("@");
    const selector = at >= 0 ? s.slice(0, at) : s;
    const attr = at >= 0 ? s.slice(at + 1) : undefined;
    schema[name] = { selector, ...(attr ? { attr } : {}), ...(all ? { all: true } : {}) };
  }
  return Object.keys(schema).length ? schema : undefined;
}

function buildAuto(a: Args): boolean | AutoOptions | undefined {
  if (a.auto === undefined) return undefined;
  if (a.auto === true) return true;
  const opts: AutoOptions = {};
  for (const key of String(a.auto).split(",").map((k) => k.trim())) {
    if (AUTO_KEYS.includes(key)) (opts as Record<string, boolean>)[key] = true;
  }
  return opts;
}

function commonOpts(a: Args): ScrapeOptions {
  const o: ScrapeOptions = { robots: a.robots, jitter: a.jitter };
  const schema = buildSchema(a);
  const auto = buildAuto(a);
  if (schema) o.schema = schema;
  if (auto !== undefined) o.auto = auto;
  else if (!schema) o.auto = true; // default to auto when nothing else specified
  if (a.item) o.item = a.item;
  if (a.engine) o.engine = a.engine;
  if (a.waitFor) o.waitFor = a.waitFor;
  if (a.userAgent) o.userAgent = a.userAgent;
  if (a.timeout !== undefined) o.timeoutMs = a.timeout;
  if (a.retries !== undefined) o.retries = a.retries;
  if (a.delay !== undefined) o.delayMs = a.delay;
  if (a.proxy) o.proxy = a.proxy;
  if (a.concurrency !== undefined) o.concurrency = a.concurrency;
  if (a.headers) { try { o.headers = JSON.parse(a.headers); } catch { log(c("yellow", "  ! --headers ignored (not valid JSON)")); } }
  o.onProgress = (m) => log(`  ${c("cyan", "◷")} ${c("dim", m)}`);
  return o;
}

function outName(urls: string[], format: string): string {
  let host = "scrape";
  try { host = new URL(urls[0] ?? "").hostname.replace(/^www\./, "").replace(/[^a-z0-9]+/gi, "-"); } catch { /* keep */ }
  return `${host || "scrape"}-${new Date().toISOString().slice(0, 10)}.${format}`;
}

async function runConvert(rest: string[]): Promise<void> {
  const a = parseArgs(rest);
  const input = a.urls[0];
  if (!input) { log(c("red", "\n✗ convert needs an input file: lacspace-scraper convert <file> [-f fmt] [-o out]\n")); exit(1); return; }
  if ((rest.includes("-f") || rest.includes("--format")) && !OUTPUT_FORMATS.includes(a.format)) {
    log(c("red", `\n✗ Unknown format "${a.format}". Use: ${OUTPUT_FORMATS.join(", ")}.\n`)); exit(1); return;
  }
  log(`\n${c("bold", c("magenta", "◆ lacspace-scraper convert"))}\n`);
  try {
    const opts: { format?: OutputFormat; out?: string; sheetName?: string } = {};
    if (rest.includes("-f") || rest.includes("--format")) opts.format = a.format;
    if (a.out) opts.out = a.out;
    if (a.sheet) opts.sheetName = a.sheet;
    const r = await convertFile(input, opts);
    log(`  ${c("green", "✔")} Converted ${c("bold", String(r.count))} rows → ${c("cyan", r.out)} ${c("dim", `(${r.format})`)}\n`);
  } catch (err) { log(c("red", `\n✗ ${(err as Error).message}\n`)); exit(1); }
}

function writeOut(records: Record<string, unknown>[], a: Args): void {
  if (!OUTPUT_FORMATS.includes(a.format)) { log(c("red", `\n✗ Unknown format "${a.format}". Use: ${OUTPUT_FORMATS.join(", ")}.`)); exit(1); return; }
  const toStdout = a.out === "-";
  const { data, binary } = serializeRows(records, a.format, a.sheet ? { sheetName: a.sheet } : {});
  if (toStdout) {
    stdout.write(binary ? Buffer.from(data as Uint8Array) : (data as string));
    if (!binary) stdout.write("\n");
    log(`\n  ${c("green", "✔")} ${c("bold", String(records.length))} records → stdout ${c("dim", `(${a.format})`)}\n`);
    return;
  }
  const out = resolve(a.out ?? outName(a.urls, a.format));
  writeFileSync(out, binary ? Buffer.from(data as Uint8Array) : (data as string));
  log(`\n  ${c("green", "✔")} Saved ${c("bold", String(records.length))} records → ${c("cyan", out)}\n`);
}

async function main(): Promise<void> {
  const raw = argv.slice(2);
  if (raw[0] === "convert") { await runConvert(raw.slice(1)); return; }

  const isCrawl = raw[0] === "crawl";
  const a = parseArgs(isCrawl ? raw.slice(1) : raw);
  if (a.help || (a.urls.length === 0 && !a.urlsFile)) { stdout.write((a.help ? HELP : HELP) + "\n"); return; }

  if (a.urlsFile) {
    try { a.urls.push(...readFileSync(a.urlsFile, "utf8").split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"))); }
    catch { log(c("red", `\n✗ Could not read --urls file "${a.urlsFile}".\n`)); exit(1); return; }
  }

  log(`\n${c("bold", c("magenta", isCrawl ? "◆ lacspace-scraper crawl" : "◆ lacspace-scraper"))} ${c("dim", "— free, robots-aware")}\n`);
  const opts = commonOpts(a);

  try {
    if (isCrawl) {
      const co: CrawlOptions = { ...opts, sameOrigin: !a.allOrigins };
      if (a.depth !== undefined) co.depth = a.depth;
      if (a.limit !== undefined) co.limit = a.limit;
      if (a.include) co.include = a.include.split(",").map((s) => s.trim()).filter(Boolean);
      if (a.exclude) co.exclude = a.exclude.split(",").map((s) => s.trim()).filter(Boolean);
      if (a.linkSelector) co.linkSelector = a.linkSelector;
      if (a.sitemap) co.sitemap = a.sitemap;
      const r = await crawl(a.urls[0]!, co);
      log(`  ${c("dim", `crawled ${r.pages} page(s) in ${(r.elapsedMs / 1000).toFixed(1)}s · ${r.errors.length} error(s)`)}`);
      if (r.records.length === 0) { log(c("yellow", "\n  No records. Try --depth/--limit higher, or --auto.\n")); return; }
      writeOut(r.records, a);
    } else {
      const r = await scrape(a.urls, opts);
      log(`  ${c("dim", `${r.pages} page(s) in ${(r.elapsedMs / 1000).toFixed(1)}s · ${r.errors.length} error(s)`)}`);
      if (r.records.length === 0) { log(c("yellow", "\n  No records collected.\n")); return; }
      writeOut(r.records, a);
    }
  } catch (err) {
    log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
    exit(1);
  }
}

main().catch((err: unknown) => { log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`)); exit(1); });
