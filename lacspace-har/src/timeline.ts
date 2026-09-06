/**
 * Turn a parsed HAR into a positioned timeline — each request laid out with a
 * start offset, an end offset and its per-phase durations. Shared by the ASCII
 * waterfall, the HTML report and the vitals estimator. Pure.
 */
import type { Har, HarEntry, Timeline, TimelineRow, TimingPhases } from "./types.js";
import {
  categoryOf,
  hostOf,
  isCacheHit,
  registrableDomain,
  transferBytes,
} from "./analyze.js";

const PHASE_ORDER: (keyof TimingPhases)[] = [
  "blocked", "dns", "connect", "ssl", "send", "wait", "receive",
];

/** Parse a HAR ISO date to epoch ms, or NaN when absent/unparseable. */
function epochOf(e: HarEntry): number {
  if (!e.startedDateTime) return NaN;
  const t = Date.parse(e.startedDateTime);
  return Number.isFinite(t) ? t : NaN;
}

/** Pick the first-party registrable domain (mirrors analyze's detection). */
function detectPrimaryDomain(har: Har, override?: string): string {
  if (override) return registrableDomain(hostOf(override));
  const doc = har.log.entries.find((e) => categoryOf(e) === "document" && e.response.status < 400);
  const url = doc?.request.url ?? har.log.entries.find((e) => (e.request.url ?? "").startsWith("http"))?.request.url;
  return url ? registrableDomain(hostOf(url)) : "";
}

/**
 * Build a {@link Timeline} from a HAR. Requests are positioned by
 * `startedDateTime`; when a HAR omits those, requests are laid out sequentially
 * in file order so the waterfall still renders.
 */
export function buildTimeline(har: Har, primaryUrl?: string): Timeline {
  const entries = har.log.entries ?? [];
  const primaryDomain = detectPrimaryDomain(har, primaryUrl);

  const epochs = entries.map(epochOf);
  const known = epochs.filter((n) => Number.isFinite(n));
  const base = known.length ? Math.min(...known) : NaN;
  const haveDates = known.length > 0;

  const rows: TimelineRow[] = [];
  let cursor = 0; // fallback sequential position when dates are missing
  let span = 0;

  entries.forEach((e, i) => {
    const ms = typeof e.time === "number" && e.time > 0 ? e.time : 0;
    const ep = epochs[i]!;
    let startMs: number;
    if (haveDates && Number.isFinite(ep)) {
      startMs = Math.max(0, ep - base);
    } else {
      startMs = cursor;
      cursor += ms;
    }
    const endMs = startMs + ms;
    span = Math.max(span, endMs);

    const phases: TimelineRow["phases"] = [];
    const t = e.timings;
    if (t) {
      for (const name of PHASE_ORDER) {
        const v = t[name];
        if (typeof v === "number" && v > 0) phases.push({ name, ms: v });
      }
    }

    const host = hostOf(e.request.url);
    const domain = registrableDomain(host) || host || "(unknown)";
    rows.push({
      url: e.request.url,
      method: e.request.method ?? "GET",
      status: e.response.status ?? 0,
      ms,
      bytes: transferBytes(e),
      category: categoryOf(e),
      domain,
      thirdParty: primaryDomain !== "" && domain !== "" && domain !== primaryDomain,
      startMs: Math.round(startMs),
      endMs: Math.round(endMs),
      phases,
      cacheHit: isCacheHit(e),
    });
  });

  return { rows, spanMs: Math.round(span) };
}
