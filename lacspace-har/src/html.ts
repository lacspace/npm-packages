/**
 * Render an analyzed HAR as a standalone, self-contained HTML report — a real
 * visual waterfall plus the breakdowns, totals, vitals and issues. No external
 * assets, no scripts required to view; safe to open or share. Pure.
 */
import type { Har, HarReport, HtmlOptions, TimelineRow, TimingPhases } from "./types.js";
import { buildTimeline } from "./timeline.js";
import { fmtBytes } from "./analyze.js";

/** Phase → CSS color, matching the ASCII waterfall's intent. */
const PHASE_COLOR: Record<keyof TimingPhases, string> = {
  blocked: "#c9ced6",
  dns: "#b48ce8",
  connect: "#e6b34a",
  ssl: "#5b8def",
  send: "#3fb0c9",
  wait: "#2fb872",
  receive: "#7cc4e8",
};
const PHASE_SEQUENCE: (keyof TimingPhases)[] = ["blocked", "dns", "connect", "ssl", "send", "wait", "receive"];

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (m) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m] as string
  ));
}

function fmtMs(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(2)} s` : `${Math.round(n)} ms`;
}

function shortUrl(url: string, max = 70): string {
  let s = url;
  try { const u = new URL(url); s = u.hostname + u.pathname; } catch { /* raw */ }
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function statusClass(status: number): string {
  if (status >= 400) return "s4";
  if (status >= 300) return "s3";
  if (status >= 200) return "s2";
  return "s1";
}

/** One waterfall row as positioned, phase-colored segments over a track. */
function waterfallRow(row: TimelineRow, span: number): string {
  const leftPct = span > 0 ? (row.startMs / span) * 100 : 0;
  const phases = row.phases.length ? row.phases : [{ name: "wait" as keyof TimingPhases, ms: Math.max(row.ms, 1) }];
  const phaseSum = phases.reduce((s, p) => s + p.ms, 0) || 1;
  const rowWidthPct = span > 0 ? (row.ms / span) * 100 : 0;
  const segs = phases.map((p) => {
    const w = (p.ms / phaseSum) * rowWidthPct;
    return `<span class="seg" style="width:${w.toFixed(3)}%;background:${PHASE_COLOR[p.name]}" title="${p.name} ${Math.round(p.ms)}ms"></span>`;
  }).join("");
  return `<tr>
    <td class="st ${statusClass(row.status)}">${row.status || "—"}</td>
    <td class="url" title="${esc(row.url)}">${esc(shortUrl(row.url))}</td>
    <td class="ty">${row.category}</td>
    <td class="track"><span class="bar" style="left:${leftPct.toFixed(3)}%;min-width:2px">${segs}</span></td>
    <td class="num">${fmtBytes(row.bytes)}</td>
    <td class="num">${fmtMs(row.ms)}</td>
  </tr>`;
}

function barList(items: { label: string; bytes: number; extra?: string; tp?: boolean }[]): string {
  const max = Math.max(1, ...items.map((i) => i.bytes));
  return items.map((i) => `
    <div class="brow">
      <div class="blabel">${esc(i.label)}${i.tp ? ' <span class="tp">↗</span>' : ""}</div>
      <div class="btrack"><div class="bfill" style="width:${((i.bytes / max) * 100).toFixed(1)}%"></div></div>
      <div class="bval">${fmtBytes(i.bytes)}${i.extra ? ` <span class="dim">${esc(i.extra)}</span>` : ""}</div>
    </div>`).join("");
}

/**
 * Build a full standalone HTML report from an analyzed report and its source
 * HAR (the HAR is needed for the visual waterfall's per-phase timings).
 */
export function toHtml(report: HarReport, har: Har, opts: HtmlOptions = {}): string {
  const { rows, spanMs } = buildTimeline(har, report.totals.primaryUrl);
  const ordered = [...rows].sort((a, b) => a.startMs - b.startMs);
  const title = opts.title ?? (report.totals.primaryUrl ? shortUrl(report.totals.primaryUrl, 60) : "HAR report");

  const legend = PHASE_SEQUENCE.map((p) =>
    `<span class="lg"><i style="background:${PHASE_COLOR[p]}"></i>${p}</span>`
  ).join("");

  const typeBars = barList(report.byType.map((t) => ({ label: t.category, bytes: t.bytes, extra: `${t.count}×` })));
  const domainBars = barList(report.byDomain.slice(0, 15).map((d) => ({ label: d.domain, bytes: d.bytes, extra: `${d.count}×`, tp: d.thirdParty })));

  const v = report.vitals;
  const vitalsHtml = v ? `
    <section>
      <h2>Estimates <span class="dim">· HAR-derived, not field metrics</span></h2>
      <div class="cards">
        <div class="card"><div class="ck">TTFB</div><div class="cv">${v.ttfbMs !== undefined ? fmtMs(v.ttfbMs) : "—"}</div></div>
        <div class="card"><div class="ck">Download time</div><div class="cv">${fmtMs(v.totalDownloadMs)}</div></div>
        <div class="card"><div class="ck">LCP candidate</div><div class="cv">${v.lcpCandidateMs !== undefined ? fmtMs(v.lcpCandidateMs) : "—"}</div></div>
        <div class="card"><div class="ck">Render-blocking</div><div class="cv">${v.renderBlocking}</div></div>
      </div>
      <p class="note">${esc(v.note)}</p>
    </section>` : "";

  const issuesHtml = report.issues.length ? report.issues.map((i) =>
    `<li class="${i.severity}"><b>${i.severity === "warn" ? "▲" : "ℹ"}</b> ${esc(i.message)}${i.url ? ` <span class="dim">${esc(shortUrl(i.url, 48))}</span>` : ""}</li>`
  ).join("") : `<li class="ok">✔ nothing flagged</li>`;

  const t = report.totals;
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — lacspace-har</title>
<style>
:root{--bg:#0f1116;--panel:#171a21;--line:#242833;--fg:#e6e9ef;--dim:#8b93a3;--accent:#a986ff;}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:24px;}
.wrap{max-width:1040px;margin:0 auto;}
h1{font-size:20px;margin:0 0 2px;}
h1 .mark{color:var(--accent);}
h2{font-size:15px;margin:26px 0 12px;border-bottom:1px solid var(--line);padding-bottom:6px;}
.sub{color:var(--dim);margin:0 0 18px;}
.dim{color:var(--dim);}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:12px 14px;}
.ck{color:var(--dim);font-size:12px;}
.cv{font-size:20px;font-weight:600;margin-top:2px;}
.note{color:var(--dim);font-size:12px;margin-top:8px;}
table{width:100%;border-collapse:collapse;font-size:12.5px;}
th,td{text-align:left;padding:4px 8px;border-bottom:1px solid var(--line);vertical-align:middle;}
th{color:var(--dim);font-weight:500;}
td.num{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--dim);}
td.ty{color:var(--dim);}
td.url{max-width:340px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
td.st{font-weight:600;font-variant-numeric:tabular-nums;}
.s1{color:#7cc4e8}.s2{color:#2fb872}.s3{color:#e6b34a}.s4{color:#ef5b5b}
td.track{width:42%;}
.track{position:relative;}
.bar{position:absolute;top:50%;transform:translateY(-50%);height:12px;display:flex;border-radius:3px;overflow:hidden;}
.seg{height:100%;display:inline-block;}
.legend{margin:10px 0 2px;color:var(--dim);font-size:12px;display:flex;gap:14px;flex-wrap:wrap;}
.lg{display:inline-flex;align-items:center;gap:5px;}
.lg i{width:11px;height:11px;border-radius:2px;display:inline-block;}
.brow{display:grid;grid-template-columns:180px 1fr 150px;gap:10px;align-items:center;margin:5px 0;}
.blabel{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.tp{color:#e6b34a;}
.btrack{background:var(--line);border-radius:4px;height:12px;overflow:hidden;}
.bfill{background:linear-gradient(90deg,var(--accent),#6ea8ff);height:100%;}
.bval{text-align:right;font-variant-numeric:tabular-nums;color:var(--dim);white-space:nowrap;}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:28px;}
@media(max-width:760px){.cols{grid-template-columns:1fr;}.brow{grid-template-columns:120px 1fr 90px;}}
ul.issues{list-style:none;padding:0;margin:0;}
ul.issues li{padding:5px 0;border-bottom:1px solid var(--line);}
ul.issues li.warn b{color:#e6b34a;}ul.issues li.info b{color:#5b8def;}ul.issues li.ok{color:#2fb872;}
footer{margin-top:30px;color:var(--dim);font-size:12px;border-top:1px solid var(--line);padding-top:12px;}
</style></head>
<body><div class="wrap">
<h1><span class="mark">◆</span> lacspace-har report</h1>
<p class="sub">${esc(title)}</p>

<div class="cards">
  <div class="card"><div class="ck">Requests</div><div class="cv">${t.requests}</div></div>
  <div class="card"><div class="ck">Transferred</div><div class="cv">${fmtBytes(t.transferBytes)}</div></div>
  <div class="card"><div class="ck">Uncompressed</div><div class="cv">${fmtBytes(t.contentBytes)}</div></div>
  <div class="card"><div class="ck">Request time</div><div class="cv">${fmtMs(t.wallTimeMs)}</div></div>
</div>

<section>
  <h2>Waterfall <span class="dim">· ${ordered.length} requests · span ${fmtMs(spanMs)}</span></h2>
  <div class="legend">${legend}</div>
  <table><thead><tr><th>St</th><th>URL</th><th>Type</th><th>Timeline</th><th>Size</th><th>Time</th></tr></thead>
  <tbody>${ordered.map((r) => waterfallRow(r, spanMs)).join("")}</tbody></table>
</section>

${vitalsHtml}

<section>
  <h2>Breakdowns</h2>
  <div class="cols">
    <div><h3 class="dim" style="margin:0 0 8px;font-size:13px;">By type</h3>${typeBars}</div>
    <div><h3 class="dim" style="margin:0 0 8px;font-size:13px;">By domain <span class="tp">↗</span>=third-party</h3>${domainBars}</div>
  </div>
</section>

<section>
  <h2>Issues <span class="dim">· ${report.issues.length}</span></h2>
  <ul class="issues">${issuesHtml}</ul>
</section>

<footer>Generated offline by <b>lacspace-har</b>. Bytes and timings come straight from the recorded HAR; nothing was fetched. Estimates are heuristic.</footer>
</div></body></html>`;
}
