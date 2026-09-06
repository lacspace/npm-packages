/**
 * Fix suggestions. Every `warn`/`fail` {@link Finding} should carry a concrete,
 * copy-pasteable `fix` — what to change, with a tiny tag/code example. The
 * mapping is keyed by finding id (or an id prefix for families like tech.*),
 * and {@link attachFixes} fills in `f.fix` for any warn/fail finding that
 * doesn't already set one. Pure, no network — trivially unit-testable.
 */
import type { Category, Finding } from "./types.js";

/** id → fix suggestion. Looked up exactly first, then by dotted prefix. */
export const FIXES: Record<string, string> = {
  // ---- SEO ----
  "seo.title":
    'Add a unique, descriptive <title> of ~10–60 chars in <head>, e.g. `<title>Acme — Fast Invoicing for Teams</title>`.',
  "seo.description":
    'Add a 50–160 char summary: `<meta name="description" content="One clear sentence about this page.">`.',
  "seo.canonical":
    'Declare the preferred URL: `<link rel="canonical" href="https://example.com/this-page">`.',
  "seo.canonicalHost":
    "Make the canonical URL use the SAME host (www vs non-www, http vs https) as the page is actually served from, and 301-redirect the other host to it.",
  "seo.robots":
    'Remove `noindex` from `<meta name="robots">` (or the X-Robots-Tag header) on pages you want indexed.',
  "seo.lang":
    'Set the document language: `<html lang="en">` (use the right BCP-47 code).',
  "seo.viewport":
    'Add `<meta name="viewport" content="width=device-width, initial-scale=1">` so the page is mobile-friendly.',
  "seo.charset":
    'Declare the charset as the FIRST tag in <head>: `<meta charset="utf-8">`.',
  "seo.charsetPos":
    'Move `<meta charset="utf-8">` to be the very first element in <head> (within the first 1024 bytes) so the parser never has to restart.',
  "seo.favicon":
    'Add a favicon: `<link rel="icon" href="/favicon.ico">` (and ideally an SVG/PNG variant).',
  "seo.appleTouchIcon":
    'Add an iOS home-screen icon: `<link rel="apple-touch-icon" href="/apple-touch-icon.png">` (180×180 PNG).',
  "seo.hreflang":
    'For multi-language pages, add alternates: `<link rel="alternate" hreflang="es" href="https://example.com/es/">` (plus an x-default).',

  // ---- Social ----
  "social.og":
    'Add the core Open Graph tags: `<meta property="og:title">`, `og:description`, `og:image`, `og:url`, `og:type` so shared links preview well.',
  "social.twitter":
    'Add `<meta name="twitter:card" content="summary_large_image">` (plus twitter:title/description/image) for rich X/Twitter previews.',

  // ---- Structured data ----
  "structured.present":
    'Add JSON-LD, e.g. `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Organization","name":"Acme"}</script>`.',
  "structured.valid":
    "Fix the invalid JSON-LD block(s) — a trailing comma or unquoted key breaks parsing. Validate at validator.schema.org.",
  "structured.type":
    'Give each JSON-LD block an `@type` (e.g. `"@type": "WebPage"`) so search engines know what it describes.',

  // ---- Content / accessibility ----
  "content.h1":
    "Use exactly one <h1> as the page's main heading; demote the extras to <h2>/<h3>.",
  "content.hierarchy":
    "Don't skip heading levels (e.g. h2 → h4). Keep them sequential so the outline stays logical.",
  "content.alt":
    'Add descriptive `alt` text to every <img> (`alt=""` for purely decorative images), e.g. `<img src="chart.png" alt="Revenue up 20% in Q3">`.',
  "content.words":
    "Add more substantive, indexable text — thin pages rank poorly. Aim for at least a few solid paragraphs of unique copy.",
  "content.dupid":
    "Make every `id` unique on the page — duplicate ids break `getElementById`, label `for=`, and in-page anchors.",

  // ---- Links ----
  "links.broken":
    "Fix or remove the links returning HTTP ≥ 400 / unreachable (see the list). Update the href or point it at a live URL.",
  "links.redirects":
    "Point links straight at their final destination to avoid an extra redirect hop (faster, and preserves link equity).",

  // ---- Performance ----
  "perf.size":
    "Trim the HTML: remove dead markup, inline only critical CSS, and lazy-load below-the-fold content so the document ships smaller.",
  "perf.scripts":
    "Reduce or bundle external scripts, and add `defer`/`async`; fewer round-trips means a faster first render.",
  "perf.styles":
    "Bundle stylesheets into one (or inline critical CSS) to cut render-blocking requests.",
  "perf.blocking":
    'Add `defer` to head scripts and `media`/preload CSS so nothing blocks the first paint, e.g. `<script src="app.js" defer></script>`.',
  "perf.responseTime":
    "Cut server response time: cache the response, use a CDN, and avoid slow origin work on the hot path (target < 600 ms).",
  "perf.compression":
    "Enable text compression on the server (`Content-Encoding: br` or `gzip`) — it typically shrinks HTML 60–80%.",
  "perf.imgDims":
    'Set explicit `width` and `height` on <img> (or an aspect-ratio) to prevent layout shift, e.g. `<img src="hero.jpg" width="1200" height="630" alt="…">`.',
  "perf.imgLazy":
    'Add `loading="lazy"` to below-the-fold images so they don\'t block the initial load: `<img src="…" loading="lazy" alt="…">`.',

  // ---- Security ----
  "sec.https":
    "Serve the site over HTTPS (get a free certificate via Let's Encrypt) and redirect all http:// traffic to https://.",
  "sec.mixed":
    "Load every subresource over https:// — replace the http:// URLs (see the list) so browsers don't block them as mixed content.",
  "sec.httpsRedirect":
    "Add a 301 redirect from http:// to https:// at the server/CDN edge so plain-HTTP visitors are upgraded automatically.",
  "sec.csp":
    "Add a `Content-Security-Policy` response header (start in report-only mode) to mitigate XSS and injection.",
  "sec.xcto":
    "Add `X-Content-Type-Options: nosniff` to stop browsers MIME-sniffing responses.",
  "sec.frame":
    "Add `X-Frame-Options: SAMEORIGIN` (or CSP `frame-ancestors 'self'`) to prevent clickjacking.",
  "sec.hsts":
    "Add `Strict-Transport-Security: max-age=63072000; includeSubDomains` so browsers always use HTTPS.",
  "sec.referrer":
    "Add `Referrer-Policy: strict-origin-when-cross-origin` to avoid leaking full URLs to other sites.",
  "sec.noopener":
    'Add `rel="noopener"` to external `target="_blank"` links so the opened page can\'t hijack `window.opener`.',

  // ---- Crawlability ----
  "crawl.robots":
    "Add a /robots.txt (even a minimal `User-agent: *` + `Allow: /` + a `Sitemap:` line) so crawlers know your rules.",
  "crawl.allowed":
    "This URL is Disallowed in robots.txt — if it should be indexed, remove or narrow that Disallow rule.",
  "crawl.sitemap":
    "Publish a /sitemap.xml listing your canonical URLs and reference it from robots.txt (`Sitemap: https://example.com/sitemap.xml`).",

  // ---- Budgets ----
  "budget.html": "The HTML exceeds your byte budget — trim markup or raise the budget.",
  "budget.scripts": "Too many external scripts for your budget — bundle/remove some or raise the budget.",
  "budget.stylesheets": "Too many stylesheets for your budget — bundle them or raise the budget.",
  "budget.images": "Too many images for your budget — combine/lazy-load some or raise the budget.",
  "budget.links": "More links than your budget allows — prune or raise the budget.",
  "budget.requests": "Estimated requests exceed your budget — cut subresources or raise the budget.",
  "budget.responsetime": "Response time exceeds your budget — see the perf.responseTime fix.",
};

/** Best fix for a finding id: exact match, then longest dotted-prefix match. */
export function fixFor(id: string): string | undefined {
  if (FIXES[id]) return FIXES[id];
  // fall back to a family prefix, e.g. "budget.foo" → "budget"
  let best: string | undefined;
  for (const key of Object.keys(FIXES)) {
    if (id.startsWith(key + ".") && (best === undefined || key.length > best.length)) best = key;
  }
  return best ? FIXES[best] : undefined;
}

/**
 * Mutate a finding list so every `warn`/`fail` finding without a `fix` gets one
 * from {@link FIXES}. Returns the same array. Pure aside from that mutation.
 */
export function attachFixes(findings: Finding[]): Finding[] {
  for (const f of findings) {
    if ((f.status === "warn" || f.status === "fail") && !f.fix) {
      const fix = fixFor(f.id);
      if (fix) f.fix = fix;
    }
  }
  return findings;
}

/** Attach fixes across every category of a report/category list. Returns it. */
export function attachFixesToCategories<T extends Pick<Category, "findings">>(cats: T[]): T[] {
  for (const c of cats) attachFixes(c.findings);
  return cats;
}
