/**
 * Output rendering: a machine JSON report and a Markdown report. The coloured
 * human table lives in the CLI; everything here is pure and side-effect-free.
 */
import { formatSize, formatDelta } from "./humansize.js";
import { pick } from "./analyze.js";
import type { AnalyzeResult, Metric } from "./analyze.js";
import type { BudgetResult } from "./budget.js";
import type { DiffResult } from "./baseline.js";
import type { CompositionResult } from "./composition.js";

export interface ReportContext {
  metric: Metric;
  budgets?: BudgetResult[];
  diff?: DiffResult;
  /** Limit files shown; undefined means all. */
  top?: number;
  binary?: boolean;
  /** Optional single-file composition breakdown to fold into JSON output. */
  composition?: CompositionResult;
}

/** Build a plain JSON-serializable report object. */
export function buildJsonReport(result: AnalyzeResult, ctx: ReportContext): Record<string, unknown> {
  const files = topN(result.files, ctx.top).map((f) => ({
    path: f.path,
    raw: f.raw,
    ...(result.withGzip ? { gzip: f.gzip } : {}),
    ...(result.withBrotli ? { brotli: f.brotli } : {}),
    percent: pct(pick(f, ctx.metric), pick(result.total, ctx.metric)),
  }));
  const out: Record<string, unknown> = {
    metric: ctx.metric,
    total: {
      files: result.total.files,
      raw: result.total.raw,
      ...(result.withGzip ? { gzip: result.total.gzip } : {}),
      ...(result.withBrotli ? { brotli: result.total.brotli } : {}),
    },
    files,
    byExtension: result.byExtension.map((e) => ({
      ext: e.ext,
      count: e.count,
      raw: e.raw,
      ...(result.withGzip ? { gzip: e.gzip } : {}),
      ...(result.withBrotli ? { brotli: e.brotli } : {}),
    })),
  };
  if (ctx.budgets && ctx.budgets.length) {
    out.budgets = ctx.budgets.map((b) => ({
      pattern: b.pattern,
      max: b.max,
      actual: b.actual,
      matched: b.matched,
      metric: b.metric,
      ok: b.ok,
      over: b.over,
    }));
    out.budgetsPass = ctx.budgets.every((b) => b.ok);
  }
  if (ctx.diff) {
    out.diff = {
      metric: ctx.diff.metric,
      before: ctx.diff.before,
      after: ctx.diff.after,
      delta: ctx.diff.delta,
      percent: Number(ctx.diff.percent.toFixed(2)),
      added: ctx.diff.added.map(fileDeltaJson),
      removed: ctx.diff.removed.map(fileDeltaJson),
      grew: ctx.diff.grew.map(fileDeltaJson),
      shrank: ctx.diff.shrank.map(fileDeltaJson),
      changed: [...ctx.diff.grew, ...ctx.diff.shrank].map(fileDeltaJson),
    };
  }
  if (ctx.composition) {
    const comp = ctx.composition;
    out.composition = {
      totalBytes: comp.totalBytes,
      lines: comp.lines,
      segments: comp.segments,
      topStrings: comp.topStrings,
      topLines: comp.topLines,
      modules: comp.modules,
      treemap: comp.treemap,
    };
  }
  out.summary = formatSummaryLine(result, ctx);
  return out;
}

/**
 * A single compact status line, e.g.
 * `12 files · raw 1.2 MB · gzip 380 kB · brotli 320 kB · budgets 2/3 · Δ +4.1 kB (+1.1%)`.
 * Pure and colour-free; the CLI may wrap it in colour.
 */
export function formatSummaryLine(result: AnalyzeResult, ctx: ReportContext): string {
  const fmt = (n: number): string => formatSize(n, { binary: ctx.binary });
  const parts: string[] = [];
  parts.push(`${result.total.files} file${result.total.files === 1 ? "" : "s"}`);
  parts.push(`raw ${fmt(result.total.raw)}`);
  if (result.withGzip) parts.push(`gzip ${fmt(result.total.gzip)}`);
  if (result.withBrotli) parts.push(`brotli ${fmt(result.total.brotli)}`);
  if (ctx.budgets && ctx.budgets.length) {
    const passed = ctx.budgets.filter((b) => b.ok).length;
    parts.push(`budgets ${passed}/${ctx.budgets.length}`);
  }
  if (ctx.diff) {
    const d = ctx.diff;
    parts.push(`Δ ${formatDelta(d.delta, { binary: ctx.binary })} (${d.percent >= 0 ? "+" : ""}${d.percent.toFixed(2)}%)`);
  }
  return parts.join(" · ");
}

/**
 * A tight, GitHub-PR-comment-ready Markdown table: one row per file with raw /
 * gzip / brotli and, when a baseline diff is supplied, a signed `Δ` column
 * (with +/-) plus a total row. Distinct from {@link toMarkdown}, which renders
 * the fuller multi-section report.
 */
export function toMarkdownComment(result: AnalyzeResult, ctx: ReportContext): string {
  const fmt = (n: number): string => formatSize(n, { binary: ctx.binary });
  const metric = ctx.metric;
  const diffByPath = new Map<string, number>();
  if (ctx.diff) for (const f of ctx.diff.files) diffByPath.set(f.path, f.delta);

  const lines: string[] = [];
  lines.push(`### 📦 Size report`);
  lines.push("");
  const summary = formatSummaryLine(result, ctx);
  lines.push(summary.replace(/·/g, "·"));
  lines.push("");

  const cols = ["File", "Raw"];
  if (result.withGzip) cols.push("Gzip");
  if (result.withBrotli) cols.push("Brotli");
  if (ctx.diff) cols.push(`Δ ${metric}`);
  lines.push(`| ${cols.join(" | ")} |`);
  lines.push(`| ${cols.map((_, i) => (i === 0 ? "---" : "---:")).join(" | ")} |`);

  for (const f of topN(result.files, ctx.top)) {
    const row = ["`" + f.path + "`", fmt(f.raw)];
    if (result.withGzip) row.push(fmt(f.gzip));
    if (result.withBrotli) row.push(fmt(f.brotli));
    if (ctx.diff) {
      const delta = diffByPath.get(f.path) ?? 0;
      row.push(delta === 0 ? "—" : formatDelta(delta, { binary: ctx.binary }));
    }
    lines.push(`| ${row.join(" | ")} |`);
  }

  // Total row.
  const totalRow = ["**Total**", `**${fmt(result.total.raw)}**`];
  if (result.withGzip) totalRow.push(`**${fmt(result.total.gzip)}**`);
  if (result.withBrotli) totalRow.push(`**${fmt(result.total.brotli)}**`);
  if (ctx.diff) totalRow.push(`**${formatDelta(ctx.diff.delta, { binary: ctx.binary })}** (${ctx.diff.percent >= 0 ? "+" : ""}${ctx.diff.percent.toFixed(2)}%)`);
  lines.push(`| ${totalRow.join(" | ")} |`);
  lines.push("");

  if (ctx.budgets && ctx.budgets.length) {
    const failed = ctx.budgets.filter((b) => !b.ok);
    lines.push(failed.length ? `❌ ${failed.length} budget${failed.length === 1 ? "" : "s"} over` : `✅ all budgets pass`);
    lines.push("");
  }
  return lines.join("\n");
}

function fileDeltaJson(d: { path: string; before: number; after: number; delta: number }): Record<string, number | string> {
  return { path: d.path, before: d.before, after: d.after, delta: d.delta };
}

/** Build a Markdown report (for `-f md`, PR comments, etc.). */
export function toMarkdown(result: AnalyzeResult, ctx: ReportContext): string {
  const fmt = (n: number): string => formatSize(n, { binary: ctx.binary });
  const lines: string[] = [];
  const metric = ctx.metric;
  lines.push(`## Size report`);
  lines.push("");
  const totalMetric = pick(result.total, metric);
  lines.push(
    `**${result.total.files}** files · raw **${fmt(result.total.raw)}**` +
      (result.withGzip ? ` · gzip **${fmt(result.total.gzip)}**` : "") +
      (result.withBrotli ? ` · brotli **${fmt(result.total.brotli)}**` : ""),
  );
  lines.push("");

  // File table.
  const cols = ["File", "Raw"];
  if (result.withGzip) cols.push("Gzip");
  if (result.withBrotli) cols.push("Brotli");
  cols.push("%");
  lines.push(`| ${cols.join(" | ")} |`);
  lines.push(`| ${cols.map((_, i) => (i === 0 ? "---" : "---:")).join(" | ")} |`);
  for (const f of topN(result.files, ctx.top)) {
    const row = ["`" + f.path + "`", fmt(f.raw)];
    if (result.withGzip) row.push(fmt(f.gzip));
    if (result.withBrotli) row.push(fmt(f.brotli));
    row.push(pct(pick(f, metric), totalMetric).toFixed(1) + "%");
    lines.push(`| ${row.join(" | ")} |`);
  }
  lines.push("");

  // By extension.
  lines.push(`### By extension`);
  lines.push("");
  lines.push(`| Ext | Files | Raw${result.withGzip ? " | Gzip" : ""}${result.withBrotli ? " | Brotli" : ""} |`);
  lines.push(`| --- | ---: | ---:${result.withGzip ? " | ---:" : ""}${result.withBrotli ? " | ---:" : ""} |`);
  for (const e of result.byExtension) {
    let row = `| ${e.ext} | ${e.count} | ${fmt(e.raw)}`;
    if (result.withGzip) row += ` | ${fmt(e.gzip)}`;
    if (result.withBrotli) row += ` | ${fmt(e.brotli)}`;
    row += " |";
    lines.push(row);
  }
  lines.push("");

  // Budgets.
  if (ctx.budgets && ctx.budgets.length) {
    lines.push(`### Budgets (${metric})`);
    lines.push("");
    lines.push(`| Pattern | Actual | Budget | Status |`);
    lines.push(`| --- | ---: | ---: | --- |`);
    for (const b of ctx.budgets) {
      const status = b.ok ? "✅ pass" : `❌ over by ${fmt(b.over)}`;
      lines.push(`| \`${b.pattern}\` | ${fmt(b.actual)} | ${fmt(b.max)} | ${status} |`);
    }
    lines.push("");
  }

  // Diff.
  if (ctx.diff) {
    const d = ctx.diff;
    const sign = d.delta > 0 ? "🔺" : d.delta < 0 ? "🔻" : "▪️";
    lines.push(`### Change vs baseline (${d.metric})`);
    lines.push("");
    lines.push(`${sign} total **${formatDelta(d.delta, { binary: ctx.binary })}** (${d.percent >= 0 ? "+" : ""}${d.percent.toFixed(2)}%) — ${fmt(d.before)} → ${fmt(d.after)}`);
    lines.push("");
    const rows = d.files.filter((f) => f.status !== "same");
    if (rows.length) {
      lines.push(`| File | Change | Before → After |`);
      lines.push(`| --- | ---: | --- |`);
      for (const f of rows) {
        const tag = f.status === "added" ? "🆕 " : f.status === "removed" ? "🗑️ " : "";
        lines.push(`| ${tag}\`${f.path}\` | ${formatDelta(f.delta, { binary: ctx.binary })} | ${fmt(f.before)} → ${fmt(f.after)} |`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}

/** Percentage of a part relative to a whole (0 when whole is 0). */
export function pct(part: number, whole: number): number {
  if (whole === 0) return 0;
  return (part / whole) * 100;
}

function topN<T>(arr: T[], n?: number): T[] {
  if (n === undefined || n <= 0 || n >= arr.length) return arr;
  return arr.slice(0, n);
}
