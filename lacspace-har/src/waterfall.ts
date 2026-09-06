/**
 * Render a HAR as an ASCII network waterfall: each request is a time-positioned
 * bar, split into its timing phases (blocked / dns / connect / ssl / send / wait
 * / receive) with per-phase colors. Pure string building.
 */
import type { Har, Timeline, TimelineRow, TimingPhases, WaterfallOptions } from "./types.js";
import { buildTimeline } from "./timeline.js";
import { fmtBytes } from "./analyze.js";

const C = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  green: "\x1b[32m", cyan: "\x1b[36m", yellow: "\x1b[33m",
  red: "\x1b[31m", magenta: "\x1b[35m", blue: "\x1b[34m",
};

/** Per-phase glyph + color. Glyphs differ enough to read without color too. */
const PHASE_STYLE: Record<keyof TimingPhases, { ch: string; color: keyof typeof C; label: string }> = {
  blocked: { ch: "░", color: "dim", label: "blocked" },
  dns: { ch: "▒", color: "magenta", label: "dns" },
  connect: { ch: "▒", color: "yellow", label: "connect" },
  ssl: { ch: "▓", color: "blue", label: "ssl" },
  send: { ch: "▓", color: "cyan", label: "send" },
  wait: { ch: "█", color: "green", label: "wait (TTFB)" },
  receive: { ch: "█", color: "cyan", label: "receive" },
};
const PHASE_SEQUENCE: (keyof TimingPhases)[] = ["blocked", "dns", "connect", "ssl", "send", "wait", "receive"];

function fmtMs(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(2)}s`;
  return `${Math.round(n)}ms`;
}

function shortUrl(url: string, max: number): string {
  let s = url;
  try {
    const u = new URL(url);
    s = u.hostname + u.pathname;
  } catch { /* keep raw */ }
  if (s.length > max) s = "…" + s.slice(s.length - max + 1);
  return s.padEnd(max);
}

/**
 * Build one bar cell array for a row, spanning the full track. Returns an array
 * of `{ ch, color }` cells of length `width`.
 */
function barCells(row: TimelineRow, spanMs: number, width: number): { ch: string; color: keyof typeof C }[] {
  const cells: { ch: string; color: keyof typeof C }[] = Array.from(
    { length: width },
    () => ({ ch: "·", color: "dim" as keyof typeof C }),
  );
  if (spanMs <= 0) return cells;

  const msPerCell = spanMs / width;
  const startCell = Math.floor(row.startMs / msPerCell);
  // Cached / zero-time rows still get a single tick so they're visible.
  const total = row.ms > 0 ? row.ms : 0;

  if (total <= 0) {
    const at = Math.min(width - 1, Math.max(0, startCell));
    cells[at] = { ch: "▪", color: row.cacheHit ? "green" : "dim" };
    return cells;
  }

  // If we have phase data, colour each cell by which phase it falls in;
  // otherwise fill the whole duration with a neutral "wait"-style block.
  const phases = row.phases.length > 0
    ? row.phases
    : [{ name: "wait" as keyof TimingPhases, ms: total }];
  const phaseSum = phases.reduce((s, p) => s + p.ms, 0) || total;

  let cell = startCell;
  for (const p of phases) {
    const span = (p.ms / phaseSum) * total;
    const count = Math.max(1, Math.round(span / msPerCell));
    const style = PHASE_STYLE[p.name];
    for (let k = 0; k < count && cell < width; k++, cell++) {
      if (cell >= 0) cells[cell] = { ch: style.ch, color: style.color };
    }
  }
  // Guarantee at least one visible cell.
  if (cell === startCell) {
    const at = Math.min(width - 1, Math.max(0, startCell));
    cells[at] = { ch: "█", color: "green" };
  }
  return cells;
}

function statusColor(status: number): keyof typeof C {
  if (status >= 400) return "red";
  if (status >= 300) return "yellow";
  if (status >= 200) return "green";
  return "cyan";
}

/**
 * Render an ASCII waterfall for a HAR. Accepts a {@link Har} or a prebuilt
 * {@link Timeline}. Returns a multi-line string (with ANSI colors by default).
 */
export function toWaterfall(input: Har | Timeline, opts: WaterfallOptions = {}): string {
  const timeline: Timeline = "rows" in input ? input : buildTimeline(input, opts.primaryUrl);
  const width = Math.max(10, opts.width ?? 40);
  const useColor = opts.color !== false;
  const paint = (k: keyof typeof C, s: string): string => (useColor ? `${C[k]}${s}${C.reset}` : s);

  let rows = [...timeline.rows];
  if (opts.sort === "time") rows.sort((a, b) => b.ms - a.ms);
  else if (opts.sort === "bytes") rows.sort((a, b) => b.bytes - a.bytes);
  else rows.sort((a, b) => a.startMs - b.startMs);
  if (opts.top && opts.top > 0) rows = rows.slice(0, opts.top);

  const span = timeline.spanMs;
  const out: string[] = [];
  out.push("");
  out.push(paint("bold", "Waterfall") + paint("dim", `  (${rows.length} requests · span ${fmtMs(span)})`));

  // time axis
  const axisLeft = "0";
  const axisRight = fmtMs(span);
  const axisPad = Math.max(1, width - axisLeft.length - axisRight.length);
  out.push(`  ${"".padEnd(31)}${paint("dim", axisLeft + " ".repeat(axisPad) + axisRight)}`);

  for (const row of rows) {
    const cells = barCells(row, span, width);
    const bar = cells.map((c) => paint(c.color, c.ch)).join("");
    const st = paint(statusColor(row.status), String(row.status || "—").padStart(3));
    const url = shortUrl(row.url, 26);
    const time = paint("dim", fmtMs(row.ms).padStart(7));
    out.push(`  ${st} ${url} ${bar} ${time}`);
  }

  // legend
  out.push("");
  const legend = PHASE_SEQUENCE.map((p) => {
    const s = PHASE_STYLE[p];
    return `${paint(s.color, s.ch)} ${paint("dim", s.label)}`;
  }).join("  ");
  out.push(`  ${legend}`);
  out.push("");
  return out.join("\n");
}
