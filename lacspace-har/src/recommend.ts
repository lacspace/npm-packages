/**
 * Concrete, savings-quantified recommendations derived from a HAR: text that
 * should be compressed, images that should be resized, likely render-blocking
 * resources, and cacheable assets missing cache headers. Each carries an
 * estimated KB/ms saving and the list is sorted by impact. Pure.
 */
import type { Har, HarEntry, Recommendation, RecommendOptions, TimingPhases } from "./types.js";
import {
  categoryOf,
  contentBytes,
  fmtBytes,
  hostOf,
  isCacheHit,
  registrableDomain,
  transferBytes,
} from "./analyze.js";
import { buildTimeline } from "./timeline.js";

/** Case-insensitive header lookup. */
function header(headers: { name: string; value: string }[] | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  for (const h of headers) {
    if (h && typeof h.name === "string" && h.name.toLowerCase() === lower) return h.value;
  }
  return undefined;
}

function isTextAsset(cat: string, mime: string): boolean {
  if (cat === "script" || cat === "css" || cat === "document" || cat === "xhr-fetch") return true;
  const m = mime.toLowerCase();
  return m.startsWith("text/") || m.includes("json") || m.includes("xml") || m.includes("svg");
}

/** The time an entry actually spent receiving+waiting on the wire, ms. */
function loadMs(e: HarEntry): number {
  const t: Partial<TimingPhases> | undefined = e.timings;
  if (t) {
    const wait = typeof t.wait === "number" && t.wait > 0 ? t.wait : 0;
    const recv = typeof t.receive === "number" && t.receive > 0 ? t.receive : 0;
    if (wait + recv > 0) return wait + recv;
  }
  return typeof e.time === "number" && e.time > 0 ? e.time : 0;
}

/**
 * Produce impact-sorted recommendations for a HAR.
 * @param opts.textCompressionRatio assumed gzip/brotli reduction (default 0.72)
 * @param opts.imageTargetBytes suggested max image transfer size (default 200 KB)
 */
export function recommend(har: Har, opts: RecommendOptions = {}): Recommendation[] {
  const ratio = opts.textCompressionRatio ?? 0.72;
  const imageTarget = opts.imageTargetBytes ?? 200 * 1024;
  const entries = har.log.entries ?? [];

  const primaryDomain = opts.primaryUrl
    ? registrableDomain(hostOf(opts.primaryUrl))
    : (() => {
        const doc = entries.find((e) => categoryOf(e) === "document" && e.response.status < 400);
        return doc ? registrableDomain(hostOf(doc.request.url)) : "";
      })();

  // Render-blocking cut-off: first-party CSS/JS finishing before onContentLoad.
  const ocl = (har.log.pages ?? []).reduce<number>((m, p) => {
    const v = p.pageTimings?.onContentLoad;
    return typeof v === "number" && v > 0 ? Math.max(m, v) : m;
  }, 0);

  const recs: Recommendation[] = [];

  for (const e of entries) {
    const cat = categoryOf(e);
    const transfer = transferBytes(e);
    const content = contentBytes(e);
    const mime = e.response.content?.mimeType ?? "";
    const status = e.response.status ?? 0;
    const url = e.request.url;

    // 1) Uncompressed text → gzip/brotli estimate.
    if (isTextAsset(cat, mime) && transfer >= 4 * 1024 && content <= transfer * 1.02) {
      const saving = Math.round(transfer * ratio);
      if (saving >= 1024) {
        recs.push({
          kind: "compress-text",
          url,
          message: `Compress ${cat} (${fmtBytes(transfer)} uncompressed) with gzip/brotli`,
          savingBytes: saving,
          target: `~${fmtBytes(transfer - saving)} on the wire`,
        });
      }
    }

    // 2) Oversized image → resize / modern format.
    if (cat === "image" && transfer > imageTarget && status < 400) {
      const saving = Math.round(transfer - imageTarget);
      recs.push({
        kind: "resize-image",
        url,
        message: `Shrink image (${fmtBytes(transfer)}) — resize and/or use WebP/AVIF`,
        savingBytes: saving,
        target: `≤ ${fmtBytes(imageTarget)}, WebP/AVIF`,
      });
    }

    // 4) Missing cache headers → bytes saved on a repeat visit.
    const cacheable = cat === "script" || cat === "css" || cat === "image" || cat === "font";
    if (cacheable && status >= 200 && status < 300 && !isCacheHit(e)) {
      const cc = header(e.response.headers, "cache-control");
      const exp = header(e.response.headers, "expires");
      if (!cc && !exp && transfer > 0) {
        recs.push({
          kind: "cache-headers",
          url,
          message: `Add Cache-Control/Expires to ${cat} — avoids re-downloading on repeat visits`,
          savingBytes: transfer,
          target: `Cache-Control: max-age=31536000, immutable`,
        });
      }
    }
  }

  // 3) Render-blocking first-party CSS/JS (needs the timeline for start offsets).
  const timeline = buildTimeline(har, opts.primaryUrl);
  for (let i = 0; i < timeline.rows.length; i++) {
    const r = timeline.rows[i]!;
    if (r.thirdParty || (r.category !== "css" && r.category !== "script")) continue;
    if (r.status >= 400) continue;
    const early = ocl > 0 ? r.startMs <= ocl : true;
    if (!early) continue;
    const e = entries[i];
    const savingMs = e ? Math.round(loadMs(e)) : Math.round(r.ms);
    if (savingMs <= 0) continue;
    recs.push({
      kind: "render-blocking",
      url: r.url,
      message: `Likely render-blocking ${r.category} — defer/async or inline critical part`,
      savingMs,
      target: r.category === "script" ? "add defer/async" : "preload + async CSS",
    });
  }

  // Sort by impact: bytes first (KB-equivalent), then ms.
  recs.sort((a, b) => {
    const bi = (b.savingBytes ?? 0) + (b.savingMs ?? 0) * 1024;
    const ai = (a.savingBytes ?? 0) + (a.savingMs ?? 0) * 1024;
    return bi - ai;
  });
  return recs;
}
