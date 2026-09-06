/**
 * The audit engine. `analyzeHtml` is a **pure** function: it parses an HTML
 * string, runs every HTML-derivable category of checks, and returns a graded
 * {@link Report}. No network, no disk — this is what the tests exercise.
 *
 * Network-only categories (crawlability, live broken-link status) are filled in
 * by {@link ./inspect.ts}, which re-scores the report afterwards.
 */
import {
  parseHTML,
  queryAll,
  textContent,
  innerText,
  extractHeadings,
  extractLinks,
  extractOpenGraph,
  extractJsonLd,
} from "lacspace-scraper";
import type { ElNode } from "lacspace-scraper";
import type { AnalyzeContext, Category, Finding, Report } from "./types.js";
import { gradeOf, makeCategory, overallScore } from "./grade.js";

// ---------- small DOM helpers ----------

function first(root: ElNode, selector: string): ElNode | undefined {
  return queryAll(root, selector)[0];
}
function metaContent(root: ElNode, selector: string): string | undefined {
  const v = first(root, selector)?.attrs.content;
  return v ? v.trim() : undefined;
}
function safeOrigin(url: string): string | undefined {
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

// ---------- SEO / meta ----------

export function seoChecks(root: ElNode): Finding[] {
  const f: Finding[] = [];

  const titleEl = first(root, "title");
  const title = titleEl ? innerText(titleEl) : "";
  if (!title) {
    f.push({ id: "seo.title", status: "fail", message: "Missing <title> tag", weight: 2 });
  } else if (title.length < 10) {
    f.push({ id: "seo.title", status: "warn", message: `Title is very short (${title.length} chars)`, detail: title, weight: 2 });
  } else if (title.length > 60) {
    f.push({ id: "seo.title", status: "warn", message: `Title is long (${title.length} chars) — may be truncated in search`, detail: title, weight: 2 });
  } else {
    f.push({ id: "seo.title", status: "ok", message: `Title present (${title.length} chars)`, detail: title, weight: 2 });
  }

  const desc = metaContent(root, 'meta[name="description"]');
  if (!desc) {
    f.push({ id: "seo.description", status: "fail", message: "Missing meta description", weight: 2 });
  } else if (desc.length < 50) {
    f.push({ id: "seo.description", status: "warn", message: `Meta description is short (${desc.length} chars)`, weight: 2 });
  } else if (desc.length > 160) {
    f.push({ id: "seo.description", status: "warn", message: `Meta description is long (${desc.length} chars)`, weight: 2 });
  } else {
    f.push({ id: "seo.description", status: "ok", message: `Meta description present (${desc.length} chars)`, weight: 2 });
  }

  const canonical = first(root, 'link[rel="canonical"]')?.attrs.href;
  f.push(canonical
    ? { id: "seo.canonical", status: "ok", message: "Canonical link present", detail: canonical }
    : { id: "seo.canonical", status: "warn", message: "No canonical link" });

  const robots = metaContent(root, 'meta[name="robots"]');
  if (robots && /\bnoindex\b/i.test(robots)) {
    f.push({ id: "seo.robots", status: "fail", message: "Page is set to noindex — search engines won't index it", detail: robots });
  } else {
    f.push({ id: "seo.robots", status: "ok", message: robots ? `Indexable (robots: ${robots})` : "Indexable (no robots noindex)" });
  }

  const lang = first(root, "html")?.attrs.lang;
  f.push(lang
    ? { id: "seo.lang", status: "ok", message: `<html lang="${lang}"> set` }
    : { id: "seo.lang", status: "warn", message: "No <html lang> attribute" });

  const viewport = metaContent(root, 'meta[name="viewport"]');
  f.push(viewport
    ? { id: "seo.viewport", status: "ok", message: "Mobile viewport meta present" }
    : { id: "seo.viewport", status: "fail", message: "No viewport meta — not mobile-friendly" });

  const hasCharset = queryAll(root, "meta").some(
    (m) => m.attrs.charset !== undefined || /content-type/i.test(m.attrs["http-equiv"] ?? ""),
  );
  f.push(hasCharset
    ? { id: "seo.charset", status: "ok", message: "Charset declared" }
    : { id: "seo.charset", status: "warn", message: "No charset meta" });

  const hasFavicon = queryAll(root, "link").some((l) => /\bicon\b/i.test(l.attrs.rel ?? ""));
  f.push(hasFavicon
    ? { id: "seo.favicon", status: "ok", message: "Favicon link present" }
    : { id: "seo.favicon", status: "warn", message: "No favicon link" });

  return f;
}

// ---------- Social ----------

export function socialChecks(root: ElNode): Finding[] {
  const f: Finding[] = [];
  const og = extractOpenGraph(root);
  const required = ["title", "description", "image", "url", "type"];
  const missing = required.filter((k) => !og[k]);
  if (missing.length === required.length) {
    f.push({ id: "social.og", status: "fail", message: "No Open Graph tags — links won't preview nicely", weight: 2 });
  } else if (missing.length > 0) {
    f.push({ id: "social.og", status: "warn", message: `Open Graph incomplete — missing ${missing.map((k) => "og:" + k).join(", ")}`, weight: 2 });
  } else {
    f.push({ id: "social.og", status: "ok", message: "Open Graph complete (title, description, image, url, type)", weight: 2 });
  }

  const tw = metaContent(root, 'meta[name="twitter:card"]');
  f.push(tw
    ? { id: "social.twitter", status: "ok", message: `Twitter Card set (${tw})` }
    : { id: "social.twitter", status: "warn", message: "No twitter:card meta" });

  return f;
}

// ---------- Structured data ----------

function collectTypes(node: unknown, out: Set<string>): void {
  if (!node || typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const graph = obj["@graph"];
  if (Array.isArray(graph)) for (const g of graph) collectTypes(g, out);
  const t = obj["@type"];
  if (typeof t === "string") out.add(t);
  else if (Array.isArray(t)) for (const x of t) if (typeof x === "string") out.add(x);
}

export function structuredChecks(root: ElNode): Finding[] {
  const f: Finding[] = [];
  const rawBlocks = queryAll(root, 'script[type="application/ld+json"]');
  const parsed = extractJsonLd(root); // malformed blocks are dropped

  if (rawBlocks.length === 0) {
    f.push({ id: "structured.present", status: "warn", message: "No JSON-LD structured data" });
    return f;
  }

  f.push({ id: "structured.present", status: "ok", message: `${rawBlocks.length} JSON-LD block(s) found` });

  const malformed = rawBlocks.length - parsed.length;
  if (malformed > 0) {
    f.push({ id: "structured.valid", status: "fail", message: `${malformed} JSON-LD block(s) are invalid JSON` });
  } else {
    f.push({ id: "structured.valid", status: "ok", message: "All JSON-LD parses as valid JSON" });
  }

  const types = new Set<string>();
  for (const p of parsed) collectTypes(p, types);
  if (parsed.length > 0) {
    f.push(types.size > 0
      ? { id: "structured.type", status: "ok", message: `Structured data @type: ${[...types].join(", ")}` }
      : { id: "structured.type", status: "warn", message: "JSON-LD present but no @type declared" });
  }
  return f;
}

// ---------- Content ----------

export function contentChecks(root: ElNode): Finding[] {
  const f: Finding[] = [];

  const h1s = queryAll(root, "h1");
  if (h1s.length === 0) {
    f.push({ id: "content.h1", status: "fail", message: "No <h1> heading on the page", weight: 2 });
  } else if (h1s.length > 1) {
    f.push({ id: "content.h1", status: "fail", message: `Multiple <h1> elements (${h1s.length}) — should be exactly one`, weight: 2 });
  } else {
    f.push({ id: "content.h1", status: "ok", message: "Exactly one <h1>", detail: innerText(h1s[0]!), weight: 2 });
  }

  const headings = extractHeadings(root);
  let skip: string | undefined;
  let prev = 0;
  for (const h of headings) {
    if (prev !== 0 && h.level - prev > 1) { skip = `h${prev} → h${h.level}`; break; }
    prev = h.level;
  }
  if (headings.length === 0) {
    f.push({ id: "content.hierarchy", status: "warn", message: "No headings found" });
  } else if (skip) {
    f.push({ id: "content.hierarchy", status: "warn", message: `Heading levels skip (${skip})` });
  } else {
    f.push({ id: "content.hierarchy", status: "ok", message: "Heading hierarchy is well-nested" });
  }

  const imgs = queryAll(root, "img");
  const missing = imgs.filter((i) => i.attrs.alt === undefined).length;
  if (imgs.length === 0) {
    f.push({ id: "content.alt", status: "info", message: "No <img> elements on the page" });
  } else if (missing === 0) {
    f.push({ id: "content.alt", status: "ok", message: `All ${imgs.length} images have alt text`, weight: 2 });
  } else {
    const pct = Math.round((missing / imgs.length) * 100);
    f.push({
      id: "content.alt",
      status: pct > 50 ? "fail" : "warn",
      message: `${missing}/${imgs.length} images missing alt text (${pct}%)`,
      weight: 2,
    });
  }
  return f;
}

// ---------- Links (pure: counts only) ----------

export function linkChecks(root: ElNode, ctx: AnalyzeContext): Finding[] {
  const origin = safeOrigin(ctx.url);
  const links = extractLinks(root, ctx.url);
  let internal = 0;
  let external = 0;
  for (const l of links) {
    const o = safeOrigin(l.href);
    if (origin && o === origin) internal++;
    else external++;
  }
  return [{
    id: "links.count",
    status: "info",
    message: `${links.length} links — ${internal} internal, ${external} external`,
    detail: "Run with --links to check each link's HTTP status.",
  }];
}

// ---------- Performance (static heuristics) ----------

export function performanceChecks(root: ElNode, html: string): Finding[] {
  const f: Finding[] = [];

  const bytes = Buffer.byteLength(html, "utf8");
  const kb = Math.round(bytes / 1024);
  f.push({
    id: "perf.size",
    status: bytes < 150_000 ? "ok" : bytes < 500_000 ? "warn" : "fail",
    message: `HTML document is ${kb} KB`,
  });

  const scripts = queryAll(root, "script");
  const extScripts = scripts.filter((s) => s.attrs.src);
  f.push({
    id: "perf.scripts",
    status: extScripts.length <= 10 ? "ok" : extScripts.length <= 25 ? "warn" : "fail",
    message: `${extScripts.length} external <script> tags`,
  });

  const styles = queryAll(root, 'link[rel="stylesheet"]');
  f.push({
    id: "perf.styles",
    status: styles.length <= 4 ? "ok" : styles.length <= 8 ? "warn" : "fail",
    message: `${styles.length} external stylesheets`,
  });

  const head = first(root, "head");
  let blocking = 0;
  if (head) {
    for (const s of queryAll(head, "script")) {
      if (s.attrs.src && s.attrs.async === undefined && s.attrs.defer === undefined) blocking++;
    }
    blocking += queryAll(head, 'link[rel="stylesheet"]').length;
  }
  f.push({
    id: "perf.blocking",
    status: blocking === 0 ? "ok" : blocking <= 3 ? "warn" : "fail",
    message: `${blocking} render-blocking resource(s) in <head>`,
  });

  const inlineScripts = scripts.filter((s) => !s.attrs.src && textContent(s).trim()).length;
  const inlineStyles = queryAll(root, "style").length;
  f.push({
    id: "perf.inline",
    status: "info",
    message: `${inlineScripts} inline scripts, ${inlineStyles} inline styles`,
  });

  return f;
}

// ---------- Security ----------

const SEC_HEADERS: { id: string; label: string; keys: string[] }[] = [
  { id: "sec.csp", label: "Content-Security-Policy", keys: ["content-security-policy"] },
  { id: "sec.xcto", label: "X-Content-Type-Options", keys: ["x-content-type-options"] },
  { id: "sec.frame", label: "X-Frame-Options / frame-ancestors", keys: ["x-frame-options"] },
  { id: "sec.hsts", label: "Strict-Transport-Security", keys: ["strict-transport-security"] },
  { id: "sec.referrer", label: "Referrer-Policy", keys: ["referrer-policy"] },
];

function subresourceUrls(root: ElNode): string[] {
  const out: string[] = [];
  for (const el of queryAll(root, "script,img,iframe,audio,video,source,track,input,embed")) {
    if (el.attrs.src) out.push(el.attrs.src);
  }
  for (const el of queryAll(root, "link")) {
    if (el.attrs.href && /stylesheet|preload|preconnect|prefetch/i.test(el.attrs.rel ?? "")) out.push(el.attrs.href);
  }
  return out;
}

export function securityChecks(root: ElNode, ctx: AnalyzeContext): Finding[] {
  const f: Finding[] = [];
  const https = /^https:/i.test(ctx.url);

  f.push(https
    ? { id: "sec.https", status: "ok", message: "Served over HTTPS", weight: 2 }
    : { id: "sec.https", status: "fail", message: "Not served over HTTPS", weight: 2 });

  if (https) {
    const mixed = subresourceUrls(root).filter((u) => /^http:\/\//i.test(u));
    f.push(mixed.length === 0
      ? { id: "sec.mixed", status: "ok", message: "No mixed content (all subresources are HTTPS)", weight: 2 }
      : { id: "sec.mixed", status: "fail", message: `${mixed.length} mixed-content (http://) subresource(s)`, detail: mixed.slice(0, 5).join("  "), weight: 2 });
  } else {
    f.push({ id: "sec.mixed", status: "info", message: "Mixed-content check skipped (page not HTTPS)" });
  }

  const headers = ctx.headers;
  if (!headers) {
    f.push({ id: "sec.headers", status: "info", message: "Response headers unavailable — security-header checks skipped" });
    return f;
  }
  const csp = headers["content-security-policy"] ?? "";
  for (const h of SEC_HEADERS) {
    let present = h.keys.some((k) => headers[k]);
    if (h.id === "sec.frame" && !present && /frame-ancestors/i.test(csp)) present = true;
    f.push(present
      ? { id: h.id, status: "ok", message: `${h.label} set` }
      : { id: h.id, status: "warn", message: `Missing ${h.label} header` });
  }
  return f;
}

// ---------- Tech detection (informational) ----------

const TECH_RULES: { name: string; test: (html: string, gen: string, root: ElNode) => boolean }[] = [
  { name: "WordPress", test: (h, g) => /wp-content|wp-includes/.test(h) || /wordpress/i.test(g) },
  { name: "Next.js", test: (h, g) => /\/_next\/|__NEXT_DATA__/.test(h) || /next\.js/i.test(g) },
  { name: "Nuxt", test: (h) => /__NUXT__|\/_nuxt\//.test(h) },
  { name: "Gatsby", test: (h, g) => /___gatsby/.test(h) || /gatsby/i.test(g) },
  { name: "Astro", test: (h, g) => /astro-island|astro-/.test(h) || /astro/i.test(g) },
  { name: "SvelteKit", test: (h) => /__sveltekit|svelte-announcer/.test(h) },
  { name: "Shopify", test: (h) => /cdn\.shopify\.com|Shopify\.theme|myshopify/.test(h) },
  { name: "Wix", test: (h) => /wixstatic\.com|_wixCssStates|X-Wix/.test(h) },
  { name: "Squarespace", test: (h, g) => /squarespace/i.test(h) || /squarespace/i.test(g) },
  { name: "Webflow", test: (h, g) => /\bwf-|webflow/i.test(h) || /webflow/i.test(g) },
  { name: "Drupal", test: (h, g) => /sites\/(default|all)\/|drupal/i.test(h) || /drupal/i.test(g) },
  { name: "Joomla", test: (_h, g) => /joomla/i.test(g) },
  { name: "Hugo", test: (_h, g) => /hugo/i.test(g) },
  { name: "Jekyll", test: (_h, g) => /jekyll/i.test(g) },
  { name: "React", test: (h) => /data-reactroot|react-dom|__REACT_DEVTOOLS/.test(h) },
  { name: "Vue.js", test: (h) => /__VUE__|data-v-app|\bvue(\.min)?\.js/.test(h) },
  { name: "Angular", test: (h) => /ng-version|angular(\.min)?\.js/.test(h) },
  { name: "jQuery", test: (h) => /jquery(-\d|\.min)?\.js/.test(h) },
  { name: "Bootstrap", test: (h) => /bootstrap(\.min)?\.(css|js)/.test(h) },
  { name: "Tailwind CSS", test: (h) => /tailwind/.test(h) },
  { name: "Cloudflare", test: (h) => /cdn-cgi\/|cloudflare/.test(h) },
  { name: "Google Tag Manager", test: (h) => /googletagmanager\.com/.test(h) },
  { name: "Google Analytics", test: (h) => /google-analytics\.com|gtag\(/.test(h) },
];

export function detectTech(root: ElNode, html: string): string[] {
  const gen = queryAll(root, 'meta[name="generator"]').map((m) => m.attrs.content ?? "").join(" ");
  const found: string[] = [];
  for (const rule of TECH_RULES) {
    try {
      if (rule.test(html, gen, root)) found.push(rule.name);
    } catch {
      /* a rule regex should never throw, but stay safe */
    }
  }
  return found;
}

// ---------- Assemble ----------

/**
 * Analyze an HTML string into a graded {@link Report}. **Pure** — no network.
 * Provide `ctx.headers` (lower-cased keys) to grade response security headers;
 * without them, those checks are reported as informational/skipped.
 */
export function analyzeHtml(html: string, ctx: AnalyzeContext): Report {
  const root = parseHTML(html);

  const categories: Category[] = [
    makeCategory("seo", "SEO & Meta", 3, seoChecks(root)),
    makeCategory("social", "Social / Open Graph", 1.5, socialChecks(root)),
    makeCategory("structured", "Structured Data", 1, structuredChecks(root)),
    makeCategory("content", "Content & Accessibility", 2, contentChecks(root)),
    makeCategory("links", "Links", 1.5, linkChecks(root, ctx)),
    makeCategory("performance", "Performance (static)", 1.5, performanceChecks(root, html)),
    makeCategory("security", "Security", 2, securityChecks(root, ctx)),
  ];

  const tech = detectTech(root, html);
  categories.push(makeCategory(
    "tech",
    "Tech Stack",
    0,
    tech.length
      ? tech.map((t) => ({ id: "tech." + t.toLowerCase().replace(/\W+/g, "-"), status: "info" as const, message: t }))
      : [{ id: "tech.none", status: "info" as const, message: "No known technologies detected" }],
  ));

  const score = overallScore(categories);

  const titleEl = first(root, "title");
  const links = extractLinks(root, ctx.url);
  const origin = safeOrigin(ctx.url);
  let internalLinks = 0;
  for (const l of links) if (origin && safeOrigin(l.href) === origin) internalLinks++;

  const report: Report = {
    url: ctx.url,
    fetchedAt: new Date().toISOString(),
    https: /^https:/i.test(ctx.url),
    score,
    grade: gradeOf(score),
    categories,
    tech,
    stats: {
      htmlBytes: Buffer.byteLength(html, "utf8"),
      scripts: queryAll(root, "script").filter((s) => s.attrs.src).length,
      stylesheets: queryAll(root, 'link[rel="stylesheet"]').length,
      images: queryAll(root, "img").length,
      internalLinks,
      externalLinks: links.length - internalLinks,
    },
  };
  if (titleEl) report.stats.title = innerText(titleEl);
  if (ctx.status !== undefined) report.httpStatus = ctx.status;
  return report;
}
