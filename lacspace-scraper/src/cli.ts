import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { stdout, stderr, argv, exit } from "node:process";
import { scrape } from "./scrape.js";
import { crawl } from "./crawl.js";
import { fetchPage } from "./fetch.js";
import { parseHTML } from "./html.js";
import { extractFeeds } from "./extract.js";
import { parseFeed } from "./feed.js";
import { parseFieldSpec } from "./transform.js";
import { dedupeRecords } from "./dedupe.js";
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
  detailFields: [string, string][];
  headerList: [string, string][];
  cookies: [string, string][];
  proxies: string[];
  schema?: string; item?: string; auto?: string | boolean;
  engine?: "http" | "browser"; waitFor?: string; wait?: string;
  screenshot?: string; pdf?: string; scroll?: number;
  paginate?: string; maxPages?: number; follow?: string;
  unique?: string; dedupe: boolean;
  format: OutputFormat; out?: string; sheet?: string;
  headers?: string; userAgent?: string; timeout?: number; retries?: number;
  delay?: number; jitter: boolean; rate?: number; concurrency?: number; robots: boolean;
  urlsFile?: string;
  depth?: number; limit?: number; allOrigins: boolean; include?: string; exclude?: string; linkSelector?: string; sitemap?: string;
  help: boolean;
}

/** Split a "name=value" (or "name: value") pair on the FIRST separator. */
function splitPair(s: string, sep: string): [string, string] | undefined {
  const i = s.indexOf(sep);
  if (i < 0) return undefined;
  const name = s.slice(0, i).trim();
  return name ? [name, s.slice(i + 1).trim()] : undefined;
}

function parseArgs(list: string[]): Args {
  const a: Args = {
    urls: [], fields: [], detailFields: [], headerList: [], cookies: [], proxies: [],
    format: "json", jitter: false, dedupe: false, robots: true, allOrigins: false, help: false,
  };
  for (let i = 0; i < list.length; i++) {
    const arg = list[i]!;
    const next = (): string => list[++i] ?? "";
    const optionalNext = (): string | undefined => { const v = list[i + 1]; return v && !v.startsWith("-") ? next() : undefined; };
    if (arg === "-s" || arg === "--schema") a.schema = next();
    else if (arg === "--field") { const p = splitPair(next(), "="); if (p) a.fields.push(p); }
    else if (arg === "--detail-field") { const p = splitPair(next(), "="); if (p) a.detailFields.push(p); }
    else if (arg === "--item") a.item = next();
    else if (arg === "--auto") { const v = optionalNext(); a.auto = v ?? true; }
    else if (arg === "--engine") a.engine = next() as Args["engine"];
    else if (arg === "--browser") a.engine = "browser";
    else if (arg === "--wait-for") a.waitFor = next();
    else if (arg === "--wait") a.wait = next();
    else if (arg === "--screenshot") a.screenshot = next();
    else if (arg === "--pdf") a.pdf = next();
    else if (arg === "--scroll") { const v = optionalNext(); a.scroll = v ? parseInt(v, 10) : 10; }
    else if (arg === "--paginate") a.paginate = next();
    else if (arg === "--max-pages") a.maxPages = parseInt(next(), 10);
    else if (arg === "--follow") a.follow = next();
    else if (arg === "--unique") a.unique = next();
    else if (arg === "--dedupe") a.dedupe = true;
    else if (arg === "-f" || arg === "--format") a.format = next() as OutputFormat;
    else if (arg === "-o" || arg === "--out") a.out = next();
    else if (arg === "--sheet") a.sheet = next();
    else if (arg === "--headers") a.headers = next();
    else if (arg === "--header") { const p = splitPair(next(), ":"); if (p) a.headerList.push(p); }
    else if (arg === "--cookie") { const p = splitPair(next(), "="); if (p) a.cookies.push(p); }
    else if (arg === "--user-agent" || arg === "--ua") a.userAgent = next();
    else if (arg === "--timeout") a.timeout = parseInt(next(), 10);
    else if (arg === "--retries") a.retries = parseInt(next(), 10);
    else if (arg === "--delay") a.delay = parseInt(next(), 10);
    else if (arg === "--jitter") a.jitter = true;
    else if (arg === "--rate") a.rate = parseInt(next(), 10);
    else if (arg === "--proxy") a.proxies.push(next());
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
  npx lacspace-scraper feed <url> [options]         ${c("dim", "parse an RSS/Atom/JSON feed")}
  npx lacspace-scraper convert <file> [-f fmt] [-o] ${c("dim", "JSON↔NDJSON↔CSV↔Excel")}

${c("bold", "Extraction")}
  -s, --schema <json|file>  CSS-selector schema, e.g. '{"title":"h1","price":".price"}'
      --field <name=sel>    Add one field; sel can end @attr and [] for all, and carry a
                            | transform pipe, e.g. --field "price=.price | number"
      --item <selector>     Repeating container → one record per match (lists/cards)
      --auto [list]         Auto-detect. Bare = metadata,headings,links,images,og,jsonLd.
                            Or pick: ${AUTO_KEYS.join(",")}
  ${c("dim", "transforms:")} trim lower upper number int float date absolute split:<sep> slice:a:b
              replace:a:b regex:<pat>[:group] prepend:<s> append:<s> default:<s>

${c("bold", "Pagination & detail pages")}
      --paginate <selector> Follow the "next page" link and accumulate records
      --max-pages <n>       Stop paginating after n pages
      --follow <field|sel>  Visit each record's link and merge in detail fields
      --detail-field <n=sel> A field to pull from each followed detail page (repeatable)

${c("bold", "Clean-up")}
      --unique <field>      Drop records with a duplicate value for this field
      --dedupe              Drop fully-identical records
  -n, --limit <n>           Cap the number of output records (scrape/feed)

${c("bold", "Engine & network")}
      --browser             Render with a real browser (JS-heavy sites; needs playwright-core)
      --wait-for <selector> Browser: wait for this selector before extracting
      --wait <sel|ms>       Browser: wait for a selector, or a fixed number of ms
      --scroll [n]          Browser: auto-scroll n passes to trigger lazy content (default 10)
      --screenshot <file>   Browser: save a full-page PNG    --pdf <file>  save a PDF
      --user-agent <ua>     Custom User-Agent      --headers <json>   Extra request headers
      --header "K: V"       Add one request header (repeatable)
      --cookie "k=v"        Add one cookie (repeatable)
      --proxy <url>         Proxy (repeatable → rotate per request; http needs undici)
      --timeout <ms>        Per-request timeout (default 15000)   --retries <n>  (default 1)
      --delay <ms>          Pause between requests   --jitter   Randomise it ±40%
      --rate <ms>           Minimum delay between requests to the SAME host
      --concurrency <n>     Parallel requests (default 4)
      --sitemap <url>       Seed the URL list from a sitemap.xml (scrape or crawl)
      --no-robots           Do NOT respect robots.txt (respected by default)

${c("bold", "Crawl (subcommand)")}
      --depth <n>           Link depth from the seed (default 2)
  -n, --limit <n>           Max pages to fetch (default 50)
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
  npx lacspace-scraper https://shop.site --item ".product" --field "name=h3" --field "price=.price | number" -f xlsx
  npx lacspace-scraper https://blog.site --item "article" --field "link=a@href" --paginate "a.next" --max-pages 5
  npx lacspace-scraper https://jobs.site --item ".job" --field "link=a@href" --follow link --detail-field "salary=.salary" -f csv
  npx lacspace-scraper crawl https://docs.site --depth 2 --limit 40 --auto metadata,text -f ndjson
  npx lacspace-scraper https://app.site --browser --scroll 8 --screenshot shot.png --auto
  npx lacspace-scraper feed https://blog.site/feed.xml -f csv
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
  for (const [name, spec] of a.fields) schema[name] = parseFieldSpec(spec);
  return Object.keys(schema).length ? schema : undefined;
}

function buildDetailSchema(a: Args): Schema | undefined {
  if (!a.detailFields.length) return undefined;
  const schema: Schema = {};
  for (const [name, spec] of a.detailFields) schema[name] = parseFieldSpec(spec);
  return schema;
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
  // --wait accepts a selector OR a number of milliseconds.
  if (a.wait) { if (/^\d+$/.test(a.wait)) o.waitMs = parseInt(a.wait, 10); else o.waitFor = a.wait; }
  if (a.scroll !== undefined && !Number.isNaN(a.scroll)) o.scroll = a.scroll;
  if (a.screenshot) o.screenshot = a.screenshot;
  if (a.pdf) o.pdf = a.pdf;
  if (a.paginate) o.paginate = a.paginate;
  if (a.maxPages !== undefined && !Number.isNaN(a.maxPages)) o.maxPages = a.maxPages;
  if (a.follow) o.follow = a.follow;
  const detailSchema = buildDetailSchema(a);
  if (detailSchema) o.detailSchema = detailSchema;
  if (a.sitemap) o.sitemap = a.sitemap;
  if (a.userAgent) o.userAgent = a.userAgent;
  if (a.timeout !== undefined) o.timeoutMs = a.timeout;
  if (a.retries !== undefined) o.retries = a.retries;
  if (a.delay !== undefined) o.delayMs = a.delay;
  if (a.rate !== undefined && !Number.isNaN(a.rate)) o.rateMs = a.rate;
  if (a.proxies.length === 1) o.proxy = a.proxies[0];
  else if (a.proxies.length > 1) o.proxies = a.proxies;
  if (a.concurrency !== undefined) o.concurrency = a.concurrency;
  const headers: Record<string, string> = {};
  if (a.headers) { try { Object.assign(headers, JSON.parse(a.headers)); } catch { log(c("yellow", "  ! --headers ignored (not valid JSON)")); } }
  for (const [k, v] of a.headerList) headers[k] = v;
  if (Object.keys(headers).length) o.headers = headers;
  if (a.cookies.length) o.cookies = Object.fromEntries(a.cookies);
  o.onProgress = (m) => log(`  ${c("cyan", "◷")} ${c("dim", m)}`);
  return o;
}

/** Apply --unique / --dedupe / --limit output post-processing (scrape mode). */
function postProcess(records: Record<string, unknown>[], a: Args, withLimit: boolean): Record<string, unknown>[] {
  const opts: { unique?: string; dedupe?: boolean; limit?: number } = {};
  if (a.unique) opts.unique = a.unique;
  if (a.dedupe) opts.dedupe = true;
  if (withLimit && a.limit !== undefined && !Number.isNaN(a.limit)) opts.limit = a.limit;
  if (opts.unique === undefined && !opts.dedupe && opts.limit === undefined) return records;
  return dedupeRecords(records, opts);
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

async function runFeed(rest: string[]): Promise<void> {
  const a = parseArgs(rest);
  const url = a.urls[0];
  if (!url) { log(c("red", "\n✗ feed needs a URL: lacspace-scraper feed <url> [-f fmt] [-o out]\n")); exit(1); return; }
  log(`\n${c("bold", c("magenta", "◆ lacspace-scraper feed"))}\n`);
  try {
    const res = await fetchPage(url, { ...(a.userAgent ? { userAgent: a.userAgent } : {}), timeoutMs: a.timeout ?? 15000 });
    let items = parseFeed(res.html);
    // If the URL was an HTML page, auto-discover its declared feed and parse that.
    if (!items.length && /<html[\s>]/i.test(res.html)) {
      const feeds = extractFeeds(parseHTML(res.html), res.url);
      if (feeds[0]) {
        log(`  ${c("cyan", "◷")} ${c("dim", `discovered feed ${feeds[0]}`)}`);
        const fr = await fetchPage(feeds[0], { ...(a.userAgent ? { userAgent: a.userAgent } : {}) });
        items = parseFeed(fr.html);
      }
    }
    if (!items.length) { log(c("yellow", "\n  No feed entries found (not an RSS/Atom/JSON feed?).\n")); return; }
    const rows = postProcess(items, a, true);
    writeOut(rows, a);
  } catch (err) { log(c("red", `\n✗ ${(err as Error).message}\n`)); exit(1); }
}

async function main(): Promise<void> {
  const raw = argv.slice(2);
  if (raw[0] === "convert") { await runConvert(raw.slice(1)); return; }
  if (raw[0] === "feed") { await runFeed(raw.slice(1)); return; }

  const isCrawl = raw[0] === "crawl";
  const a = parseArgs(isCrawl ? raw.slice(1) : raw);
  if (a.help || (a.urls.length === 0 && !a.urlsFile && !a.sitemap)) { stdout.write((a.help ? HELP : HELP) + "\n"); return; }

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
      const rows = postProcess(r.records, a, false); // --limit is the page cap for crawl
      if (rows.length === 0) { log(c("yellow", "\n  No records. Try --depth/--limit higher, or --auto.\n")); return; }
      writeOut(rows, a);
    } else {
      const r = await scrape(a.urls, opts);
      log(`  ${c("dim", `${r.pages} page(s) in ${(r.elapsedMs / 1000).toFixed(1)}s · ${r.errors.length} error(s)`)}`);
      const rows = postProcess(r.records, a, true);
      if (rows.length === 0) { log(c("yellow", "\n  No records collected.\n")); return; }
      writeOut(rows, a);
    }
  } catch (err) {
    log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`));
    exit(1);
  }
}

main().catch((err: unknown) => { log(c("red", `\n✗ ${err instanceof Error ? err.message : String(err)}\n`)); exit(1); });
