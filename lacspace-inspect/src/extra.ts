/**
 * v0.2 additional checks. These are **pure** functions returning extra
 * {@link Finding}s that {@link ./checks.ts#analyzeHtml} appends onto the
 * existing categories. Kept separate so each is unit-testable in isolation and
 * so the original check functions keep their exact old behavior.
 *
 * Network-derived signals (response time, compression, http→https redirect)
 * come in via {@link AnalyzeContext}; when a field is `undefined` the check is
 * reported as `info` (skipped) rather than graded — so a pure `analyzeHtml`
 * call with no headers never penalizes a page for something we couldn't measure.
 */
import { queryAll, innerText, extractText } from "lacspace-scraper";
import type { ElNode } from "lacspace-scraper";
import type { AnalyzeContext, Finding } from "./types.js";

function first(root: ElNode, selector: string): ElNode | undefined {
  return queryAll(root, selector)[0];
}
function hostOf(url: string): { host: string; www: boolean; bare: string } | undefined {
  try {
    const h = new URL(url).host.toLowerCase();
    const www = h.startsWith("www.");
    return { host: h, www, bare: www ? h.slice(4) : h };
  } catch {
    return undefined;
  }
}

// ---------- SEO extras ----------

/** Charset-in-first-1024-bytes, www/non-www canonical consistency, hreflang, apple-touch-icon. */
export function seoExtraChecks(root: ElNode, html: string, ctx: AnalyzeContext): Finding[] {
  const f: Finding[] = [];

  // Charset must appear early so the parser doesn't restart.
  const head1k = html.slice(0, 1024);
  const hasCharsetAnywhere = queryAll(root, "meta").some(
    (m) => m.attrs.charset !== undefined || /content-type/i.test(m.attrs["http-equiv"] ?? ""),
  );
  if (hasCharsetAnywhere) {
    const early = /charset/i.test(head1k);
    f.push(early
      ? { id: "seo.charsetPos", status: "ok", message: "Charset declared within the first 1024 bytes" }
      : { id: "seo.charsetPos", status: "warn", message: "Charset is declared but not within the first 1024 bytes" });
  }

  // Canonical host should match the served host (www vs non-www).
  const canonical = first(root, 'link[rel="canonical"]')?.attrs.href;
  if (canonical) {
    const ch = hostOf(canonical.startsWith("http") ? canonical : new URL(canonical, ctx.url).href);
    const ph = hostOf(ctx.url);
    if (ch && ph) {
      f.push(ch.bare === ph.bare && ch.www === ph.www
        ? { id: "seo.canonicalHost", status: "ok", message: "Canonical host matches the served host (www/non-www consistent)" }
        : {
            id: "seo.canonicalHost",
            status: "warn",
            message: `Canonical host (${ch.host}) differs from the served host (${ph.host})`,
            detail: "Pick one host, canonicalize to it, and 301-redirect the other.",
          });
    }
  }

  // hreflang alternates (only relevant to multilingual sites → info when absent).
  const hreflang = queryAll(root, "link").filter((l) => /alternate/i.test(l.attrs.rel ?? "") && l.attrs.hreflang);
  f.push(hreflang.length > 0
    ? { id: "seo.hreflang", status: "ok", message: `${hreflang.length} hreflang alternate(s) declared` }
    : { id: "seo.hreflang", status: "info", message: "No hreflang alternates (fine for a single-language site)" });

  // apple-touch-icon for iOS home-screen bookmarks.
  const appleIcon = queryAll(root, "link").some((l) => /apple-touch-icon/i.test(l.attrs.rel ?? ""));
  f.push(appleIcon
    ? { id: "seo.appleTouchIcon", status: "ok", message: "apple-touch-icon present" }
    : { id: "seo.appleTouchIcon", status: "warn", message: "No apple-touch-icon (iOS home-screen icon)", weight: 0.5 });

  return f;
}

// ---------- Content extras ----------

/** Thin-content word count + duplicate-id check. */
export function contentExtraChecks(root: ElNode): Finding[] {
  const f: Finding[] = [];

  const text = extractText(root) || innerText(root);
  const words = text.split(/\s+/).filter(Boolean).length;
  if (words === 0) {
    f.push({ id: "content.words", status: "info", message: "No readable text extracted (likely a client-rendered SPA)" });
  } else if (words < 120) {
    f.push({ id: "content.words", status: "warn", message: `Thin content — only ~${words} words of text` });
  } else {
    f.push({ id: "content.words", status: "ok", message: `~${words} words of readable content` });
  }

  const ids = new Map<string, number>();
  for (const el of queryAll(root, "[id]")) {
    const id = el.attrs.id?.trim();
    if (id) ids.set(id, (ids.get(id) ?? 0) + 1);
  }
  const dupes = [...ids.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  if (ids.size === 0) {
    f.push({ id: "content.dupid", status: "info", message: "No id attributes on the page" });
  } else if (dupes.length > 0) {
    f.push({ id: "content.dupid", status: "fail", message: `${dupes.length} duplicate id(s) on the page`, detail: dupes.slice(0, 8).join(", ") });
  } else {
    f.push({ id: "content.dupid", status: "ok", message: "All element ids are unique" });
  }

  return f;
}

// ---------- Performance extras ----------

/** Response time, compression, image width/height + lazy-loading. */
export function performanceExtraChecks(root: ElNode, ctx: AnalyzeContext): Finding[] {
  const f: Finding[] = [];

  const rt = ctx.responseTimeMs;
  if (typeof rt === "number") {
    f.push({
      id: "perf.responseTime",
      status: rt < 600 ? "ok" : rt < 1500 ? "warn" : "fail",
      message: `Server responded in ${rt} ms`,
    });
  } else {
    f.push({ id: "perf.responseTime", status: "info", message: "Response time not measured (pure analysis)" });
  }

  const enc = (ctx.contentEncoding ?? "").toLowerCase();
  if (ctx.headers === undefined && ctx.contentEncoding === undefined) {
    f.push({ id: "perf.compression", status: "info", message: "Compression not checked (no response headers)" });
  } else if (/\b(br|gzip|deflate|zstd)\b/.test(enc)) {
    f.push({ id: "perf.compression", status: "ok", message: `HTML is compressed (${enc})` });
  } else {
    f.push({ id: "perf.compression", status: "warn", message: "HTML is served without gzip/brotli compression" });
  }

  const imgs = queryAll(root, "img");
  if (imgs.length === 0) {
    f.push({ id: "perf.imgDims", status: "info", message: "No <img> elements" });
    f.push({ id: "perf.imgLazy", status: "info", message: "No <img> elements" });
  } else {
    const noDims = imgs.filter((i) => i.attrs.width === undefined || i.attrs.height === undefined).length;
    f.push(noDims === 0
      ? { id: "perf.imgDims", status: "ok", message: `All ${imgs.length} images set width & height (no layout shift)` }
      : { id: "perf.imgDims", status: "warn", message: `${noDims}/${imgs.length} images missing width/height (risk of layout shift)` });

    const lazy = imgs.filter((i) => /lazy/i.test(i.attrs.loading ?? "")).length;
    if (imgs.length <= 3) {
      f.push({ id: "perf.imgLazy", status: "ok", message: "Few images — lazy-loading not needed" });
    } else {
      f.push(lazy > 0
        ? { id: "perf.imgLazy", status: "ok", message: `${lazy}/${imgs.length} images use loading="lazy"` }
        : { id: "perf.imgLazy", status: "warn", message: `${imgs.length} images and none use loading="lazy"` });
    }
  }

  return f;
}

// ---------- Security extras ----------

/** External target=_blank without rel=noopener + http→https redirect. */
export function securityExtraChecks(root: ElNode, ctx: AnalyzeContext): Finding[] {
  const f: Finding[] = [];

  const origin = (() => { try { return new URL(ctx.url).origin; } catch { return undefined; } })();
  const blanks = queryAll(root, 'a[target="_blank"]');
  const external = blanks.filter((a) => {
    const href = a.attrs.href ?? "";
    if (!/^https?:\/\//i.test(href)) return false;
    try { return new URL(href).origin !== origin; } catch { return false; }
  });
  const unsafe = external.filter((a) => !/noopener/i.test(a.attrs.rel ?? ""));
  if (external.length === 0) {
    f.push({ id: "sec.noopener", status: "info", message: "No external target=_blank links" });
  } else if (unsafe.length > 0) {
    f.push({ id: "sec.noopener", status: "warn", message: `${unsafe.length} external _blank link(s) missing rel="noopener"`, weight: 0.5 });
  } else {
    f.push({ id: "sec.noopener", status: "ok", message: `All ${external.length} external _blank links use rel="noopener"` });
  }

  if (typeof ctx.httpsRedirect === "boolean") {
    f.push(ctx.httpsRedirect
      ? { id: "sec.httpsRedirect", status: "ok", message: "http:// redirects to https://" }
      : { id: "sec.httpsRedirect", status: "warn", message: "http:// does not redirect to https://" });
  } else {
    f.push({ id: "sec.httpsRedirect", status: "info", message: "http→https redirect not probed" });
  }

  return f;
}
