/**
 * Render a {@link HarReport} as a clean, sectioned terminal report.
 * Pure string building — the CLI writes it out.
 */
import type { HarReport, Recommendation, RequestSummary } from "./types.js";
import { fmtBytes } from "./analyze.js";

/** Extra sections {@link formatReport} can render (all optional, backward-compatible). */
export interface FormatOptions {
  /** Recommendations to render in a dedicated section (from {@link recommend}). */
  recommendations?: Recommendation[];
  /** How many recommendations to list (default 8). */
  maxRecommendations?: number;
}

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m",
  red: "\x1b[31m", magenta: "\x1b[35m", blue: "\x1b[34m",
};
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;

/** milliseconds, nicely. */
function fmtMs(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(2)} s`;
  return `${Math.round(n)} ms`;
}

/** Shorten a URL to host + trimmed path for list rows. */
function shortUrl(url: string, max = 58): string {
  let s = url;
  try {
    const u = new URL(url);
    s = u.hostname + u.pathname;
  } catch {
    /* keep raw */
  }
  if (s.length > max) s = s.slice(0, max - 1) + "…";
  return s;
}

/** A simple horizontal bar for a fraction 0..1. */
function bar(frac: number, width = 18): string {
  const filled = Math.max(0, Math.min(width, Math.round(frac * width)));
  return "█".repeat(filled) + c("dim", "░".repeat(width - filled));
}

function statusColor(status: number): keyof typeof C {
  if (status >= 500) return "red";
  if (status >= 400) return "red";
  if (status >= 300) return "yellow";
  if (status >= 200) return "green";
  return "cyan";
}

function requestRows(rows: RequestSummary[], value: (r: RequestSummary) => string): string {
  if (rows.length === 0) return `  ${c("dim", "(none)")}`;
  return rows
    .map((r) => {
      const st = c(statusColor(r.status), String(r.status || "—").padStart(3));
      const val = value(r).padStart(9);
      const tp = r.thirdParty ? c("dim", " ↗") : "  ";
      return `  ${st}  ${c("cyan", val)}  ${shortUrl(r.url)}${tp}`;
    })
    .join("\n");
}

/** Build the whole terminal report as a string. */
export function formatReport(
  report: HarReport,
  by: "type" | "domain" | "status" = "domain",
  opts: FormatOptions = {},
): string {
  const { totals, wins, timings, issues } = report;
  const out: string[] = [];
  const h = (s: string): string => c("bold", s);
  const rule = c("dim", "─".repeat(52));

  out.push("");
  out.push(`${c("bold", c("magenta", "◆ lacspace-har"))} ${c("dim", "— offline HAR analysis")}`);
  if (totals.primaryUrl) out.push(`  ${c("dim", shortUrl(totals.primaryUrl, 64))}`);
  out.push("");

  // ── Totals ──
  out.push(h("Totals"));
  out.push(`  ${c("bold", String(totals.requests))} requests · ${c("cyan", fmtBytes(totals.transferBytes))} transferred · ${c("dim", fmtBytes(totals.contentBytes) + " uncompressed")}`);
  const timeBits = [`${fmtMs(totals.wallTimeMs)} total request time`];
  if (totals.onContentLoadMs !== undefined) timeBits.push(`DOMContentLoaded ${fmtMs(totals.onContentLoadMs)}`);
  if (totals.onLoadMs !== undefined) timeBits.push(`load ${fmtMs(totals.onLoadMs)}`);
  out.push(`  ${c("dim", timeBits.join(" · "))}`);
  out.push("");

  // ── Slowest ──
  out.push(h(`Slowest requests`) + c("dim", `  (top ${report.slowest.length})`));
  out.push(requestRows(report.slowest, (r) => fmtMs(r.ms)));
  out.push("");

  // ── Largest ──
  out.push(h(`Largest requests`) + c("dim", `  (top ${report.largest.length})`));
  out.push(requestRows(report.largest, (r) => fmtBytes(r.bytes)));
  out.push("");

  // ── chosen breakdown ──
  if (by === "type") {
    out.push(h("By type"));
    const max = Math.max(1, ...report.byType.map((t) => t.bytes));
    for (const t of report.byType) {
      out.push(`  ${t.category.padEnd(10)} ${bar(t.bytes / max)} ${c("cyan", fmtBytes(t.bytes).padStart(9))} ${c("dim", `${t.count}×`)}`);
    }
  } else if (by === "status") {
    out.push(h("By status"));
    const max = Math.max(1, ...report.byStatus.map((s) => s.count));
    for (const s of report.byStatus) {
      out.push(`  ${c(statusColor(parseInt(s.bucket) * 100 || 0), s.bucket.padEnd(6))} ${bar(s.count / max)} ${c("cyan", String(s.count).padStart(4))}  ${c("dim", fmtBytes(s.bytes))}`);
    }
  } else {
    out.push(h("By domain") + c("dim", "   ↗ = third-party"));
    const max = Math.max(1, ...report.byDomain.map((d) => d.bytes));
    for (const d of report.byDomain.slice(0, 12)) {
      const tag = d.thirdParty ? c("yellow", " ↗") : c("green", " •");
      out.push(`  ${d.domain.padEnd(24).slice(0, 24)}${tag} ${bar(d.bytes / max)} ${c("cyan", fmtBytes(d.bytes).padStart(9))} ${c("dim", `${d.count}×`)}`);
    }
    if (report.byDomain.length > 12) out.push(`  ${c("dim", `…and ${report.byDomain.length - 12} more domains`)}`);
  }
  out.push("");

  // ── Timing phases ──
  const tp = timings;
  const phaseTotal = tp.blocked + tp.dns + tp.connect + tp.ssl + tp.send + tp.wait + tp.receive;
  if (phaseTotal > 0) {
    out.push(h("Where the time went") + c("dim", "  (summed across requests)"));
    const phases: [string, number][] = [
      ["blocked", tp.blocked], ["dns", tp.dns], ["connect", tp.connect],
      ["ssl", tp.ssl], ["send", tp.send], ["wait (TTFB)", tp.wait], ["receive", tp.receive],
    ];
    for (const [name, v] of phases) {
      if (v <= 0) continue;
      out.push(`  ${name.padEnd(12)} ${bar(v / phaseTotal)} ${c("dim", fmtMs(v))}`);
    }
    out.push("");
  }

  // ── Wins / waste ──
  out.push(h("Wins & waste"));
  out.push(`  ${c("green", "✔")} ${wins.cacheHits} cache hit${wins.cacheHits === 1 ? "" : "s"} · ${c("green", fmtBytes(wins.compressionSavedBytes))} saved by compression`);
  const redColor = wins.redirects > 0 ? "yellow" : "dim";
  const errColor = wins.errors > 0 ? "red" : "dim";
  out.push(`  ${c(redColor, String(wins.redirects))} redirect${wins.redirects === 1 ? "" : "s"} (3xx) · ${c(errColor, String(wins.errors))} error${wins.errors === 1 ? "" : "s"} (4xx/5xx)`);
  out.push("");

  // ── Estimates (HAR-derived web-vitals-ish) ──
  const v = report.vitals;
  if (v) {
    out.push(h("Estimates") + c("dim", "  (HAR-derived, not field metrics)"));
    const bits: string[] = [];
    if (v.ttfbMs !== undefined) bits.push(`TTFB ${c("cyan", fmtMs(v.ttfbMs))}`);
    bits.push(`download ${c("cyan", fmtMs(v.totalDownloadMs))}`);
    if (v.lcpCandidateMs !== undefined) bits.push(`LCP-candidate ${c("cyan", fmtMs(v.lcpCandidateMs))}`);
    bits.push(`${c(v.renderBlocking > 0 ? "yellow" : "dim", String(v.renderBlocking))} render-blocking`);
    out.push(`  ${bits.join(" · ")}`);
    if (v.lcpCandidateUrl) out.push(`  ${c("dim", "LCP candidate: " + shortUrl(v.lcpCandidateUrl, 54))}`);
    out.push(`  ${c("dim", v.note)}`);
    out.push("");
  }

  // ── Recommendations (with estimated savings) ──
  const recs = opts.recommendations ?? [];
  if (recs.length) {
    const max = opts.maxRecommendations ?? 8;
    out.push(h("Recommendations") + c("dim", `  (${recs.length}, by impact)`));
    for (const r of recs.slice(0, max)) {
      const save: string[] = [];
      if (r.savingBytes) save.push(c("green", "~" + fmtBytes(r.savingBytes)));
      if (r.savingMs) save.push(c("green", "~" + fmtMs(r.savingMs)));
      const saveStr = save.length ? c("dim", " [save ") + save.join(c("dim", " / ")) + c("dim", "]") : "";
      const where = r.url ? c("dim", "  " + shortUrl(r.url, 44)) : "";
      out.push(`  ${c("magenta", "→")} ${r.message}${saveStr}`);
      if (r.url) out.push(`   ${where}`);
    }
    if (recs.length > max) out.push(`  ${c("dim", `…and ${recs.length - max} more`)}`);
    out.push("");
  }

  // ── Issues ──
  out.push(h("Issues") + c("dim", `  (${issues.length})`));
  if (issues.length === 0) {
    out.push(`  ${c("green", "✔")} ${c("dim", "nothing flagged")}`);
  } else {
    for (const iss of issues.slice(0, 20)) {
      const mark = iss.severity === "warn" ? c("yellow", "▲") : c("blue", "ℹ");
      const where = iss.url ? c("dim", "  " + shortUrl(iss.url, 46)) : "";
      out.push(`  ${mark} ${iss.message}${where}`);
    }
    if (issues.length > 20) out.push(`  ${c("dim", `…and ${issues.length - 20} more`)}`);
  }
  out.push("");
  out.push(rule);
  out.push(c("dim", "  Analysis is offline & heuristic — bytes come from what the HAR recorded."));
  out.push("");

  return out.join("\n");
}
