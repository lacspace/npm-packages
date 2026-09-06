/**
 * Dump the per-request table from a HAR as CSV or JSON — for spreadsheets,
 * pipelines and quick greps. Pure string building.
 */
import type { ExportOptions, Har, RequestSummary } from "./types.js";
import { buildTimeline } from "./timeline.js";

/** A per-request row, with its start offset on the timeline. */
export interface ExportRow extends RequestSummary {
  startMs: number;
  endMs: number;
  cacheHit: boolean;
}

/** Build the full per-request summary table for a HAR (in file order). */
export function summarize(har: Har, opts: ExportOptions = {}): ExportRow[] {
  const { rows } = buildTimeline(har, opts.primaryUrl);
  return rows.map((r) => ({
    url: r.url,
    method: r.method,
    status: r.status,
    ms: r.ms,
    bytes: r.bytes,
    category: r.category,
    domain: r.domain,
    thirdParty: r.thirdParty,
    startMs: r.startMs,
    endMs: r.endMs,
    cacheHit: r.cacheHit,
  }));
}

const COLUMNS: (keyof ExportRow)[] = [
  "method", "status", "category", "domain", "thirdParty", "bytes", "ms", "startMs", "endMs", "cacheHit", "url",
];

/** RFC-4180-ish CSV field escaping. */
function csvCell(v: unknown): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * Export the per-request table. `format` is `"csv"` or `"json"`. JSON emits an
 * array of row objects; CSV emits a header row plus one row per request.
 */
export function exportRequests(har: Har, format: "csv" | "json", opts: ExportOptions = {}): string {
  const rows = summarize(har, opts);
  if (format === "json") return JSON.stringify(rows, null, 2);
  const head = COLUMNS.join(",");
  const body = rows.map((r) => COLUMNS.map((k) => csvCell(r[k])).join(","));
  return [head, ...body].join("\n");
}
