/** fetch_page, scrape, crawl_site — the lacspace-scraper engine. */
import {
  crawl, extractHeadings, extractImages, extractJsonLd, extractLinks, extractMeta, extractOpenGraph,
  extractTables, extractText, fetchPage, parseFieldSpec, parseHTML, scrape,
} from "lacspace-scraper";
import type { ToolDefinition } from "../server";
import { checkUrl } from "../guard";
import { clip, lines, tidy } from "../format";

const MAX_CHARS = { type: "integer", minimum: 500, maximum: 200_000, default: 20_000, description: "Cap on the text returned to the model." } as const;

export const fetchPageTool: ToolDefinition<{
  url: string; include?: string[]; maxChars: number; headers?: Record<string, string>; timeoutMs?: number;
}> = {
  name: "fetch_page",
  title: "Fetch a web page",
  description:
    "Fetch a URL and return its readable content: title, description, canonical URL, language, headings and the page text, plus (on request) links, images, tables, Open Graph tags and JSON-LD. Static HTML only, no JavaScript execution. Use this to read a page before answering questions about it.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Absolute http(s) URL." },
      include: {
        type: "array", items: { type: "string", enum: ["links", "images", "tables", "openGraph", "jsonLd", "headings"] },
        description: "Extra sections to include. Text, title, description, canonical and language are always included.",
        default: ["headings"],
      },
      maxChars: MAX_CHARS,
      headers: { type: "object", additionalProperties: { type: "string" }, description: "Extra request headers (e.g. a cookie or Accept-Language)." },
      timeoutMs: { type: "integer", minimum: 1000, maximum: 120_000, description: "Request timeout." },
    },
    required: ["url"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async run(args, ctx) {
    const u = await checkUrl(args.url, ctx.policy);
    const page = await fetchPage(u.toString(), { timeoutMs: args.timeoutMs ?? ctx.policy.timeoutMs, headers: args.headers, signal: ctx.signal });
    if (!page.ok) return { text: `HTTP ${page.status} for ${page.url}`, data: { url: page.url, status: page.status }, isError: true };
    if (!/html|xml/i.test(page.contentType) && !page.html.trimStart().startsWith("<")) {
      const body = clip(page.html, args.maxChars);
      return { text: `Non-HTML response (${page.contentType}):\n\n${body.text}`, data: { url: page.url, status: page.status, contentType: page.contentType, body: page.html.slice(0, args.maxChars) } };
    }
    const root = parseHTML(page.html);
    const meta = extractMeta(root, page.url);
    const want = new Set(args.include ?? ["headings"]);
    const data: Record<string, unknown> = { url: page.url, status: page.status, ...meta };
    if (want.has("headings")) data.headings = extractHeadings(root);
    if (want.has("links")) data.links = extractLinks(root, page.url);
    if (want.has("images")) data.images = extractImages(root, page.url);
    if (want.has("tables")) data.tables = extractTables(root);
    if (want.has("openGraph")) data.openGraph = extractOpenGraph(root);
    if (want.has("jsonLd")) data.jsonLd = extractJsonLd(root);
    const text = tidy(extractText(root));
    const body = clip(text, args.maxChars);
    data.text = body.text;
    data.truncated = body.truncated;

    const parts: string[] = [lines([["URL", page.url], ["Title", meta.title], ["Description", meta.description], ["Canonical", meta.canonical], ["Language", meta.lang]])];
    if (want.has("headings") && (data.headings as unknown[]).length) {
      parts.push("Headings:\n" + (data.headings as { level: number; text: string }[]).map((h) => `${"#".repeat(h.level)} ${h.text}`).join("\n"));
    }
    parts.push("Text:\n" + body.text);
    if (want.has("links")) parts.push(`Links (${(data.links as unknown[]).length}):\n` + (data.links as { href: string; text: string }[]).slice(0, 200).map((l) => `- ${l.text || "(no text)"} → ${l.href}`).join("\n"));
    if (want.has("images")) parts.push(`Images (${(data.images as unknown[]).length}):\n` + (data.images as string[]).slice(0, 100).join("\n"));
    if (want.has("tables")) parts.push(`Tables: ${(data.tables as unknown[]).length}\n` + JSON.stringify(data.tables, null, 1).slice(0, 8000));
    if (want.has("openGraph")) parts.push("Open Graph:\n" + lines(Object.entries(data.openGraph as Record<string, string>)));
    if (want.has("jsonLd")) parts.push("JSON-LD:\n" + JSON.stringify(data.jsonLd, null, 1).slice(0, 8000));
    return { text: parts.join("\n\n"), data };
  },
};

export const scrapeTool: ToolDefinition<{
  url: string; schema: Record<string, string>; item?: string; limit: number; timeoutMs?: number;
}> = {
  name: "scrape",
  title: "Scrape structured data with CSS selectors",
  description:
    'Extract structured records from a page using CSS selectors. `schema` maps field names to selectors, optionally with an attribute (`a@href`, `img@src`) and pipes (`.price | trim | number`). Give `item` to repeat the schema over every matching element (one record each), e.g. item ".product". Use fetch_page first to see the page, then scrape to pull exact fields.',
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Absolute http(s) URL." },
      schema: { type: "object", additionalProperties: { type: "string" }, description: 'Field → selector, e.g. {"name": "h2", "price": ".price | number", "link": "a@href"}.', minProperties: 1 },
      item: { type: "string", description: "Selector for the repeating element. Omit for one record from the whole page." },
      limit: { type: "integer", minimum: 1, maximum: 5000, default: 200, description: "Maximum records to return." },
      timeoutMs: { type: "integer", minimum: 1000, maximum: 120_000 },
    },
    required: ["url", "schema"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async run(args, ctx) {
    const u = await checkUrl(args.url, ctx.policy);
    // Parse "sel@attr | pipe" strings here so the grammar works on every scraper version.
    const schema = Object.fromEntries(Object.entries(args.schema).map(([k, v]) => [k, parseFieldSpec(v)]));
    const result = await scrape(u.toString(), { schema, item: args.item, engine: "http", timeoutMs: args.timeoutMs ?? ctx.policy.timeoutMs, signal: ctx.signal });
    const records = result.records.slice(0, args.limit);
    const data = { url: u.toString(), count: records.length, total: result.records.length, records, errors: result.errors };
    if (result.errors.length && !records.length) return { text: `scrape failed: ${result.errors.map((e) => e.error).join("; ")}`, data, isError: true };
    const text = `${records.length} record(s)${result.records.length > records.length ? ` of ${result.records.length}` : ""} from ${u}\n\n` + JSON.stringify(records, null, 1);
    return { text: clip(text, 100_000).text, data };
  },
};

export const crawlSiteTool: ToolDefinition<{
  url: string; depth: number; limit: number; sameOrigin: boolean; include?: string[]; exclude?: string[]; maxCharsPerPage: number; timeoutMs?: number;
}> = {
  name: "crawl_site",
  title: "Crawl a site",
  description:
    "Follow links from a start URL and return each page's URL, status, title, description and text (capped per page). Bounded by depth and page limit; same-origin by default. Use it to read a small site or a docs section in one call. For a single page use fetch_page.",
  inputSchema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Start URL." },
      depth: { type: "integer", minimum: 0, maximum: 5, default: 1, description: "How many link hops to follow from the start page." },
      limit: { type: "integer", minimum: 1, maximum: 200, default: 20, description: "Maximum pages to fetch." },
      sameOrigin: { type: "boolean", default: true },
      include: { type: "array", items: { type: "string" }, description: "Only follow URLs containing one of these substrings or matching these globs." },
      exclude: { type: "array", items: { type: "string" }, description: "Never follow URLs matching these." },
      maxCharsPerPage: { type: "integer", minimum: 200, maximum: 50_000, default: 4000 },
      timeoutMs: { type: "integer", minimum: 1000, maximum: 120_000 },
    },
    required: ["url"],
    additionalProperties: false,
  },
  annotations: { readOnlyHint: true, openWorldHint: true },
  async run(args, ctx) {
    const u = await checkUrl(args.url, ctx.policy);
    const result = await crawl(u.toString(), {
      depth: args.depth, limit: args.limit, sameOrigin: args.sameOrigin, include: args.include, exclude: args.exclude,
      engine: "http", auto: { metadata: true, text: true }, timeoutMs: args.timeoutMs ?? ctx.policy.timeoutMs, signal: ctx.signal,
    });
    const pages = result.records.map((r) => {
      const rec = r as { url?: string; status?: number; title?: string; description?: string; text?: string };
      const body = clip(tidy(rec.text ?? ""), args.maxCharsPerPage);
      return { url: rec.url, status: rec.status, title: rec.title, description: rec.description, text: body.text, truncated: body.truncated };
    });
    const data = { start: u.toString(), pages: pages.length, elapsedMs: result.elapsedMs, results: pages, errors: result.errors };
    const text = `${pages.length} page(s) crawled from ${u} in ${result.elapsedMs}ms` +
      (result.errors.length ? `, ${result.errors.length} error(s)` : "") + "\n\n" +
      pages.map((p) => `## ${p.title ?? "(untitled)"}\nURL: ${p.url}  (HTTP ${p.status})\n${p.description ? p.description + "\n" : ""}\n${p.text}`).join("\n\n---\n\n");
    return { text, data };
  },
};
