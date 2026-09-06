/**
 * HAR-derived, "web-vitals-ish" estimates. These are DERIVED from the recorded
 * HAR, never real field measurements — labelled as such. Pure.
 */
import type { Har, VitalsEstimate } from "./types.js";
import { buildTimeline } from "./timeline.js";
import { categoryOf } from "./analyze.js";

/**
 * Estimate TTFB, total download time, an LCP-candidate load time and the number
 * of render-blocking requests from a HAR. Best-effort; see `note` on the result.
 */
export function estimateVitals(har: Har, primaryUrl?: string): VitalsEstimate {
  const { rows } = buildTimeline(har, primaryUrl);
  const entries = har.log.entries ?? [];

  // TTFB: the wait (server think-time) of the first successful document.
  let ttfbMs: number | undefined;
  const docIdx = entries.findIndex((e) => categoryOf(e) === "document" && e.response.status < 400);
  const doc = docIdx >= 0 ? entries[docIdx] : undefined;
  if (doc?.timings) {
    const setup =
      Math.max(0, doc.timings.blocked ?? 0) +
      Math.max(0, doc.timings.dns ?? 0) +
      Math.max(0, doc.timings.connect ?? 0) +
      Math.max(0, doc.timings.ssl ?? 0) +
      Math.max(0, doc.timings.send ?? 0);
    const wait = Math.max(0, doc.timings.wait ?? 0);
    ttfbMs = Math.round(setup + wait);
  }

  // Total download time: sum of receive phases (falls back to wall time).
  let totalDownloadMs = 0;
  let sawReceive = false;
  for (const e of entries) {
    const r = e.timings?.receive;
    if (typeof r === "number" && r > 0) {
      totalDownloadMs += r;
      sawReceive = true;
    }
  }
  if (!sawReceive) totalDownloadMs = rows.reduce((s, r) => s + r.ms, 0);
  totalDownloadMs = Math.round(totalDownloadMs);

  // LCP candidate: the largest image/document/text resource, by when it
  // finished loading (endMs). Only successful, non-cached, sizeable resources.
  let lcpCandidateMs: number | undefined;
  let lcpCandidateUrl: string | undefined;
  let lcpBytes = -1;
  for (const r of rows) {
    const eligible = r.category === "image" || r.category === "document" || r.category === "css";
    if (!eligible || r.status >= 400) continue;
    if (r.bytes > lcpBytes) {
      lcpBytes = r.bytes;
      lcpCandidateMs = r.endMs;
      lcpCandidateUrl = r.url;
    }
  }

  // Render-blocking: first-party CSS and (non-async, best-effort) scripts that
  // completed before onContentLoad — a proxy the HAR can actually support.
  const ocl = (har.log.pages ?? []).reduce<number>((m, p) => {
    const v = p.pageTimings?.onContentLoad;
    return typeof v === "number" && v > 0 ? Math.max(m, v) : m;
  }, 0);
  let renderBlocking = 0;
  for (const r of rows) {
    if (r.thirdParty) continue;
    if (r.category !== "css" && r.category !== "script") continue;
    if (r.status >= 400) continue;
    if (ocl > 0 ? r.startMs <= ocl : true) renderBlocking += 1;
  }

  const result: VitalsEstimate = {
    totalDownloadMs,
    renderBlocking,
    note: "HAR-derived estimates, not field metrics — treat as directional hints.",
  };
  if (ttfbMs !== undefined) result.ttfbMs = ttfbMs;
  if (lcpCandidateMs !== undefined) result.lcpCandidateMs = lcpCandidateMs;
  if (lcpCandidateUrl !== undefined) result.lcpCandidateUrl = lcpCandidateUrl;
  return result;
}
