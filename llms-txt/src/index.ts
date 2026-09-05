/**
 * @lacspace/llms-txt
 * Generate and parse llms.txt and llms-full.txt (the llmstxt.org standard).
 *
 * llms.txt is a Markdown file at your site root that gives LLMs a curated map of
 * your most useful content; llms-full.txt inlines the full text so a model can
 * read everything in one request.
 *
 * Zero dependencies · isomorphic · fully typed.
 */

export interface LlmsLink {
  title: string;
  url: string;
  /** Short note shown after the link. */
  notes?: string;
}

export interface LlmsSection {
  title: string;
  links: LlmsLink[];
}

export interface LlmsDoc {
  /** The site / project name (rendered as the H1). */
  title: string;
  /** One-line summary (rendered as a blockquote). */
  summary?: string;
  /** Free-form Markdown shown before the sections. */
  details?: string;
  sections: LlmsSection[];
}

/**
 * How to order the links inside each section.
 * - `"title"` / `"url"` — ascending by that field
 * - `"title-desc"` / `"url-desc"` — descending
 * - a comparator — full control
 * Sections keep their array order; only the links within a section are sorted.
 */
export type LinkSort =
  | "title"
  | "url"
  | "title-desc"
  | "url-desc"
  | ((a: LlmsLink, b: LlmsLink) => number);

/** Options accepted by the rendering helpers. */
export interface LlmsTxtOptions {
  /** Order links within each section. Omit to keep the given order. */
  sort?: LinkSort;
}

function sortLinks(links: LlmsLink[], sort?: LinkSort): LlmsLink[] {
  if (!sort) return links;
  const copy = links.slice();
  if (typeof sort === "function") return copy.sort(sort);
  const [field, dir] = sort.split("-") as ["title" | "url", "desc" | undefined];
  const factor = dir === "desc" ? -1 : 1;
  return copy.sort((a, b) => factor * a[field].localeCompare(b[field]));
}

/**
 * Render an `llms.txt` document.
 * @param opts optional rendering options (e.g. `{ sort: "title" }`).
 * @example
 * llmsTxt({
 *   title: "Lacspace",
 *   summary: "Open-source TypeScript packages and products.",
 *   sections: [{ title: "Docs", links: [{ title: "Packages", url: "https://lacspace.com/packages" }] }],
 * });
 */
export function llmsTxt(doc: LlmsDoc, opts: LlmsTxtOptions = {}): string {
  const out: string[] = [`# ${doc.title}`];
  if (doc.summary) out.push("", `> ${doc.summary}`);
  if (doc.details) out.push("", doc.details.trim());
  for (const section of doc.sections) {
    out.push("", `## ${section.title}`, "");
    for (const l of sortLinks(section.links, opts.sort)) {
      out.push(`- [${l.title}](${l.url})${l.notes ? `: ${l.notes}` : ""}`);
    }
  }
  return out.join("\n") + "\n";
}

export interface LlmsFullSection {
  title: string;
  /** Full Markdown content for this section. */
  content: string;
  /** Optional source URL, added as a heading link. */
  url?: string;
}

export interface LlmsFullDoc {
  title: string;
  summary?: string;
  sections: LlmsFullSection[];
}

/** Render an `llms-full.txt` document with the full content inlined. */
export function llmsFullTxt(doc: LlmsFullDoc): string {
  const out: string[] = [`# ${doc.title}`];
  if (doc.summary) out.push("", `> ${doc.summary}`);
  for (const section of doc.sections) {
    out.push("", "---", "", `## ${section.title}`);
    if (section.url) out.push("", `Source: ${section.url}`);
    out.push("", section.content.trim());
  }
  return out.join("\n") + "\n";
}

/** Parse an `llms.txt` string back into a structured document. */
export function parseLlmsTxt(txt: string): LlmsDoc {
  const lines = txt.split(/\r?\n/);
  const doc: LlmsDoc = { title: "", sections: [] };
  let current: LlmsSection | null = null;
  const detailBuf: string[] = [];
  const linkRe = /^-\s*\[([^\]]+)\]\(([^)]+)\)\s*(?::\s*(.*))?$/;

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (line.startsWith("# ")) {
      doc.title = line.slice(2).trim();
    } else if (line.startsWith("> ")) {
      doc.summary = (doc.summary ? doc.summary + " " : "") + line.slice(2).trim();
    } else if (line.startsWith("## ")) {
      current = { title: line.slice(3).trim(), links: [] };
      doc.sections.push(current);
    } else if (current && linkRe.test(line)) {
      const m = line.match(linkRe)!;
      current.links.push({ title: m[1]!, url: m[2]!, notes: m[3]?.trim() || undefined });
    } else if (!current && line && !line.startsWith("#")) {
      detailBuf.push(line);
    }
  }
  const details = detailBuf.join("\n").trim();
  if (details) doc.details = details;
  return doc;
}

/* ------------------------------ from sitemap ------------------------------ */

/** A sitemap-ish entry — accepts `url` or `loc`, plus optional title/section. */
export interface SitemapEntryLike {
  url?: string;
  loc?: string;
  title?: string;
  section?: string;
}

function titleFromUrl(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  const seg = path.split("/").filter(Boolean).pop();
  if (!seg) return "Home";
  let decoded: string;
  try {
    decoded = decodeURIComponent(seg);
  } catch {
    // Malformed percent-encoding — fall back to the raw segment instead of throwing.
    decoded = seg;
  }
  return decoded.replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** First path segment of a URL, title-cased, for auto-sectioning ("/docs/x" → "Docs"). */
function sectionFromUrl(url: string): string {
  let path: string;
  try {
    path = new URL(url).pathname;
  } catch {
    path = url;
  }
  const seg = path.split("/").filter(Boolean)[0];
  if (!seg) return "Home";
  let decoded: string;
  try {
    decoded = decodeURIComponent(seg);
  } catch {
    decoded = seg;
  }
  return decoded.replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Pull `<loc>` values out of a sitemap (or sitemap-index) XML string. */
function parseSitemapXml(xml: string): SitemapEntryLike[] {
  const out: SitemapEntryLike[] = [];
  const re = /<loc>\s*([\s\S]*?)\s*<\/loc>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const loc = m[1]!
      .trim()
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
    if (loc) out.push({ loc });
  }
  return out;
}

/** Meta / options for {@link llmsTxtFromSitemap}. */
export interface SitemapToLlmsMeta extends LlmsTxtOptions {
  title: string;
  summary?: string;
  details?: string;
  /** Fallback section name when an entry has none. Default `"Pages"`. */
  defaultSection?: string;
  /**
   * When an entry has no explicit `section`, derive one from the first path
   * segment ("/docs/x" → "Docs") instead of using {@link defaultSection}.
   */
  sectionFromPath?: boolean;
}

/**
 * Build an `llms.txt` from sitemap entries — accepts either an **array** of
 * `{ loc | url, title?, section? }` entries or a raw **sitemap XML string**.
 * Groups by `section` (or, with `sectionFromPath`, by the first path segment),
 * derives titles from the URL when not given, and de-duplicates repeated URLs.
 * Pairs with `@lacspace/sitemap`. The original array signature is unchanged.
 */
export function llmsTxtFromSitemap(
  entries: SitemapEntryLike[] | string,
  meta: SitemapToLlmsMeta,
): string {
  const list = typeof entries === "string" ? parseSitemapXml(entries) : entries;
  const bySection = new Map<string, LlmsLink[]>();
  const order: string[] = [];
  const seen = new Set<string>();
  for (const e of list) {
    const url = e.url ?? e.loc;
    if (!url || seen.has(url)) continue;
    seen.add(url);
    const section =
      e.section ?? (meta.sectionFromPath ? sectionFromUrl(url) : meta.defaultSection ?? "Pages");
    if (!bySection.has(section)) {
      bySection.set(section, []);
      order.push(section);
    }
    bySection.get(section)!.push({ title: e.title ?? titleFromUrl(url), url });
  }
  const doc: LlmsDoc = {
    title: meta.title,
    summary: meta.summary,
    details: meta.details,
    sections: order.map((title) => ({ title, links: bySection.get(title)! })),
  };
  return llmsTxt(doc, { sort: meta.sort });
}

/* ------------------------------ from routes ------------------------------ */

/** A single route/page entry for {@link llmsTxtFromRoutes}. */
export interface LlmsRoute {
  title: string;
  url: string;
  notes?: string;
  /** Section heading to group under. Defaults to {@link RoutesToLlmsMeta.defaultSection}. */
  section?: string;
}

/** Meta / options for {@link llmsTxtFromRoutes}. */
export interface RoutesToLlmsMeta extends LlmsTxtOptions {
  title: string;
  summary?: string;
  details?: string;
  /** Section name for routes with no `section`. Default `"Docs"`. */
  defaultSection?: string;
}

/**
 * Build an `llms.txt` from a flat list of route entries, grouping by `section`
 * (first-seen order preserved). Titles and notes are used verbatim.
 * @example
 * llmsTxtFromRoutes(
 *   [
 *     { title: "Home", url: "https://acme.com/", section: "Start" },
 *     { title: "API", url: "https://acme.com/api", notes: "reference", section: "Docs" },
 *   ],
 *   { title: "Acme", summary: "Acme docs" },
 * );
 */
export function llmsTxtFromRoutes(routes: LlmsRoute[], meta: RoutesToLlmsMeta): string {
  const bySection = new Map<string, LlmsLink[]>();
  const order: string[] = [];
  for (const r of routes) {
    const section = r.section ?? meta.defaultSection ?? "Docs";
    if (!bySection.has(section)) {
      bySection.set(section, []);
      order.push(section);
    }
    bySection.get(section)!.push({ title: r.title, url: r.url, notes: r.notes });
  }
  const doc: LlmsDoc = {
    title: meta.title,
    summary: meta.summary,
    details: meta.details,
    sections: order.map((title) => ({ title, links: bySection.get(title)! })),
  };
  return llmsTxt(doc, { sort: meta.sort });
}

/* ------------------------------ adapters ------------------------------ */

/** `llms.txt` as a Fetch/edge `Response` (text/plain) for app/llms.txt/route.ts. */
export function llmsTxtResponse(doc: LlmsDoc, init: ResponseInit = {}): Response {
  return new Response(llmsTxt(doc), {
    ...init,
    headers: { "content-type": "text/plain; charset=utf-8", ...(init.headers ?? {}) },
  });
}

/** `llms-full.txt` as a Fetch/edge `Response` (text/plain). */
export function llmsFullTxtResponse(doc: LlmsFullDoc, init: ResponseInit = {}): Response {
  return new Response(llmsFullTxt(doc), {
    ...init,
    headers: { "content-type": "text/plain; charset=utf-8", ...(init.headers ?? {}) },
  });
}
