/**
 * Diff two HARs — a "before" and an "after" capture — into per-metric deltas
 * plus what was added, removed, got slower or got faster. Perfect for proving
 * an optimization landed. Pure; a formatter renders it for the terminal.
 */
import type {
  DiffOptions,
  DomainDelta,
  Har,
  HarDiff,
  MetricDelta,
  RequestChange,
  RequestSummary,
  ResourceCategory,
  TypeDelta,
} from "./types.js";
import { analyzeHar, fmtBytes } from "./analyze.js";

function delta(before: number, after: number): MetricDelta {
  const d = after - before;
  const pct = before === 0 ? (after === 0 ? 0 : 100) : (d / before) * 100;
  return { before, after, delta: d, pct: Math.round(pct * 10) / 10 };
}

/** Index a report's per-request summaries by URL (first wins on dupes). */
function indexByUrl(rows: RequestSummary[]): Map<string, RequestSummary> {
  const m = new Map<string, RequestSummary>();
  for (const r of rows) if (!m.has(r.url)) m.set(r.url, r);
  return m;
}

/**
 * Diff two parsed HARs. `top` caps the added/removed/slower/faster lists,
 * `slowThresholdMs` ignores tiny time wobbles.
 */
export function diffHars(before: Har, after: Har, opts: DiffOptions = {}): HarDiff {
  const top = Math.max(1, opts.top ?? 10);
  const threshold = opts.slowThresholdMs ?? 20;

  // Analyze with a huge `top` so we get every request summarized.
  const aOpts = opts.primaryUrl ? { top: 1e9, primaryUrl: opts.primaryUrl } : { top: 1e9 };
  const rb = analyzeHar(before, aOpts);
  const ra = analyzeHar(after, aOpts);

  const requests = delta(rb.totals.requests, ra.totals.requests);
  const transferBytes = delta(rb.totals.transferBytes, ra.totals.transferBytes);
  const contentBytes = delta(rb.totals.contentBytes, ra.totals.contentBytes);
  const wallTimeMs = delta(rb.totals.wallTimeMs, ra.totals.wallTimeMs);

  // by type
  const typeCats = new Set<ResourceCategory>([
    ...rb.byType.map((t) => t.category),
    ...ra.byType.map((t) => t.category),
  ]);
  const byType: TypeDelta[] = [...typeCats]
    .map((category) => {
      const b = rb.byType.find((t) => t.category === category)?.bytes ?? 0;
      const a = ra.byType.find((t) => t.category === category)?.bytes ?? 0;
      return { category, before: b, after: a, delta: a - b };
    })
    .filter((d) => d.delta !== 0 || d.before !== 0 || d.after !== 0)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  // by domain
  const domains = new Set<string>([
    ...rb.byDomain.map((d) => d.domain),
    ...ra.byDomain.map((d) => d.domain),
  ]);
  const byDomain: DomainDelta[] = [...domains]
    .map((domain) => {
      const b = rb.byDomain.find((d) => d.domain === domain)?.bytes ?? 0;
      const a = ra.byDomain.find((d) => d.domain === domain)?.bytes ?? 0;
      return { domain, before: b, after: a, delta: a - b };
    })
    .filter((d) => d.delta !== 0)
    .sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));

  // added / removed / changed by URL
  const bIdx = indexByUrl(rb.slowest); // slowest == all rows here (top huge)
  const aIdx = indexByUrl(ra.slowest);

  const added: RequestSummary[] = [];
  const removed: RequestSummary[] = [];
  const slower: RequestChange[] = [];
  const faster: RequestChange[] = [];

  for (const [url, aRow] of aIdx) {
    const bRow = bIdx.get(url);
    if (!bRow) { added.push(aRow); continue; }
    const d = aRow.ms - bRow.ms;
    if (Math.abs(d) >= threshold) {
      const change: RequestChange = { url, before: bRow.ms, after: aRow.ms, delta: d };
      if (d > 0) slower.push(change); else faster.push(change);
    }
  }
  for (const [url, bRow] of bIdx) {
    if (!aIdx.has(url)) removed.push(bRow);
  }

  added.sort((x, y) => y.bytes - x.bytes);
  removed.sort((x, y) => y.bytes - x.bytes);
  slower.sort((x, y) => y.delta - x.delta);
  faster.sort((x, y) => x.delta - y.delta);

  return {
    requests, transferBytes, contentBytes, wallTimeMs,
    byType, byDomain,
    added: added.slice(0, top),
    removed: removed.slice(0, top),
    slower: slower.slice(0, top),
    faster: faster.slice(0, top),
  };
}

// ── terminal formatter ───────────────────────────────────────────────────────

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", red: "\x1b[31m", yellow: "\x1b[33m", magenta: "\x1b[35m", cyan: "\x1b[36m",
};
const c = (k: keyof typeof C, s: string): string => `${C[k]}${s}${C.reset}`;

function fmtMs(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`;
}

function shortUrl(url: string, max = 52): string {
  let s = url;
  try { const u = new URL(url); s = u.hostname + u.pathname; } catch { /* raw */ }
  return s.length > max ? "…" + s.slice(s.length - max + 1) : s;
}

/** A signed, colored delta string. `good` says whether "down" is the win. */
function signed(d: number, fmt: (n: number) => string, goodWhenNegative = true): string {
  if (d === 0) return c("dim", "±0");
  const up = d > 0;
  const good = goodWhenNegative ? !up : up;
  const arrow = up ? "▲" : "▼";
  return c(good ? "green" : "red", `${arrow} ${up ? "+" : "−"}${fmt(Math.abs(d))}`);
}

/** Render a {@link HarDiff} as a sectioned terminal report. */
export function formatDiff(diff: HarDiff, opts: { color?: boolean } = {}): string {
  const useColor = opts.color !== false;
  const p = (k: keyof typeof C, s: string): string => (useColor ? c(k, s) : s);
  const paintSigned = (d: number, fmt: (n: number) => string, gwn = true): string =>
    useColor ? signed(d, fmt, gwn) : `${d > 0 ? "+" : d < 0 ? "−" : "±"}${fmt(Math.abs(d))}`;
  const out: string[] = [];
  const bytes = fmtBytes;

  out.push("");
  out.push(`${p("bold", p("magenta", "◆ lacspace-har diff"))} ${p("dim", "— before → after")}`);
  out.push("");
  out.push(p("bold", "Totals"));
  const line = (label: string, m: MetricDelta, fmt: (n: number) => string): void => {
    const pct = m.before === 0 ? "" : p("dim", `  (${m.pct > 0 ? "+" : ""}${m.pct}%)`);
    out.push(`  ${label.padEnd(16)} ${p("dim", fmt(m.before))} → ${p("bold", fmt(m.after))}   ${paintSigned(m.delta, fmt)}${pct}`);
  };
  line("requests", diff.requests, (n) => String(n));
  line("transfer", diff.transferBytes, bytes);
  line("content", diff.contentBytes, bytes);
  line("request time", diff.wallTimeMs, fmtMs);
  out.push("");

  if (diff.byType.length) {
    out.push(p("bold", "By type") + p("dim", "  (transfer bytes)"));
    for (const t of diff.byType.slice(0, 8)) {
      out.push(`  ${t.category.padEnd(12)} ${p("dim", bytes(t.before))} → ${p("bold", bytes(t.after))}   ${paintSigned(t.delta, bytes)}`);
    }
    out.push("");
  }

  const listSection = (title: string, rows: { url: string; note: string }[]): void => {
    if (!rows.length) return;
    out.push(p("bold", title) + p("dim", `  (${rows.length})`));
    for (const r of rows) out.push(`  ${r.note}  ${p("dim", shortUrl(r.url))}`);
    out.push("");
  };

  listSection("Slower", diff.slower.map((r) => ({ url: r.url, note: paintSigned(r.delta, fmtMs) })));
  listSection("Faster", diff.faster.map((r) => ({ url: r.url, note: paintSigned(r.delta, fmtMs) })));
  listSection("Added", diff.added.map((r) => ({ url: r.url, note: p("green", "+ " + bytes(r.bytes).padStart(8)) })));
  listSection("Removed", diff.removed.map((r) => ({ url: r.url, note: p("red", "− " + bytes(r.bytes).padStart(8)) })));

  out.push(p("dim", "─".repeat(52)));
  out.push(p("dim", "  Matched by URL; time deltas below the threshold are ignored."));
  out.push("");
  return out.join("\n");
}
