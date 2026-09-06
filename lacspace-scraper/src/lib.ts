/**
 * lacspace-scraper — a free, open-source website scraper (CLI + library).
 *
 * Pull structured data from any site or a list of sources: extract by CSS
 * selectors or auto-detect metadata, headings, links, images, emails, phones,
 * tables, JSON-LD and OpenGraph; crawl a whole site (sitemap or link-following,
 * robots-aware); render JS-heavy pages in a real browser; export to JSON,
 * NDJSON, CSV or Excel. No API keys.
 *
 * ```ts
 * import { scrape, serializeRows } from "lacspace-scraper";
 *
 * const { records } = await scrape("https://example.com", {
 *   schema: { title: "h1", links: { selector: "a", attr: "@href", all: true } },
 * });
 * const { data } = serializeRows(records, "csv");
 * ```
 *
 * Please scrape responsibly: respect robots.txt (on by default), each site's
 * Terms, and local data-protection law; keep volumes modest and identify your
 * bot honestly.
 */
export { scrape, recordsFromHtml, ScraperError } from "./scrape.js";
export { crawl } from "./crawl.js";
export { parseHTML, textContent, innerText, descendants, childElements, decodeEntities, type ElNode, type TextNode, type Node } from "./html.js";
export { queryAll, queryOne } from "./select.js";
export {
  applySchema,
  applySchemaItems,
  resolveField,
  readValue,
  autoExtract,
  extractMeta,
  extractHeadings,
  extractLinks,
  extractImages,
  extractEmails,
  extractPhones,
  extractOpenGraph,
  extractJsonLd,
  extractFeeds,
  extractText,
  extractTables,
} from "./extract.js";
export { fetchPage, type FetchResult, type FetchOptions } from "./fetch.js";
export { parseRobots, fetchRobots, type Robots } from "./robots.js";
export { fetchSitemap } from "./sitemap.js";
export { launchSession, type BrowserSession } from "./browser.js";
export {
  serializeRows,
  readRows,
  convertFile,
  detectFormat,
  columnsOf,
  type DataRow,
} from "./convert.js";
export type {
  Schema,
  FieldSpec,
  ScrapeOptions,
  CrawlOptions,
  ScrapeRecord,
  ScrapeResult,
  AutoData,
  AutoOptions,
  LinkInfo,
  Engine,
  OutputFormat,
} from "./types.js";
