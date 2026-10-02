import { CANVASES, layoutCaptions } from "./layout.js";
import { assFilter, toAss, toMontageCaptions, toSrt, toVtt } from "./formats.js";
import { Canvas, Layout, LayoutOptions, StyleOptions, TimedSegment } from "./types.js";

export * from "./types.js";
export { layoutCaptions, estimateWidth, CANVASES } from "./layout.js";
export { toAss, toSrt, toVtt, toMontageCaptions, assFilter, assTime, srtTime, vttTime, assColor, escapeFilterPath } from "./formats.js";

const VERSION = "1.0.0";

export interface CaptionsOptions extends Omit<LayoutOptions, "canvas">, StyleOptions {
  /** Preset name (reels/tiktok/shorts/fb-feed/square/youtube/landscape) or a custom canvas. */
  canvas: keyof typeof CANVASES | Canvas;
  /** Fonts directory for the ffmpeg filter (should contain Mukta / Noto Sans Devanagari). */
  fontsDir?: string;
  /** Where the ASS file will live (for the ffmpeg filter string). Default "captions.ass". */
  assPath?: string;
}

export interface CaptionsResult {
  layout: Layout;
  ass: string;
  srt: string;
  vtt: string;
  /** ffmpeg `-vf` / filtergraph snippet to burn the ASS in with libass. */
  filter: string;
  /** Drawtext fallback for @lacspace/montage when libass isn't available. */
  montageCaptions: ReturnType<typeof toMontageCaptions>;
  stats: { cues: number; fontSize: number; maxLines: number; longestLinePx: number; durationMs: number };
}

/**
 * One call: timed segments (sentence- or word-level, e.g. from @lacspace/speakable's
 * originalWordTimings) → platform-safe caption cues in ASS (karaoke-capable, libass shapes
 * Devanagari), SRT, VTT and a montage drawtext fallback.
 */
export function captions(segments: TimedSegment[], o: CaptionsOptions): CaptionsResult {
  const canvas = typeof o.canvas === "string" ? CANVASES[o.canvas] : o.canvas;
  if (!canvas) throw new Error(`captionsync: unknown canvas "${String(o.canvas)}"`);
  const layout = layoutCaptions(segments, { ...o, canvas });
  const ass = toAss(layout, o);
  const last = layout.cues[layout.cues.length - 1];
  return {
    layout,
    ass,
    srt: toSrt(layout),
    vtt: toVtt(layout),
    filter: assFilter(o.assPath ?? "captions.ass", { fontsDir: o.fontsDir }),
    montageCaptions: toMontageCaptions(layout),
    stats: { cues: layout.cues.length, fontSize: layout.fontSize, maxLines: Math.max(0, ...layout.cues.map((c) => c.lines.length)), longestLinePx: Math.round(layout.widestPx), durationMs: last ? last.endMs : 0 },
  };
}

/** Convert @lacspace/speakable `originalWordTimings()` output (one entry per original token) into segments by sentence. */
export function fromSpeakable(words: Array<{ orig: string; startMs: number; endMs: number; segment: number }>): TimedSegment[] {
  const by = new Map<number, Array<{ orig: string; startMs: number; endMs: number }>>();
  for (const w of words) (by.get(w.segment) ?? by.set(w.segment, []).get(w.segment)!).push(w);
  return [...by.entries()].sort(([a], [b]) => a - b).map(([, ws]) => ({
    text: ws.map((w) => w.orig).join(" "),
    startMs: ws[0]!.startMs,
    endMs: ws[ws.length - 1]!.endMs,
    words: ws.map((w) => ({ text: w.orig, startMs: w.startMs, endMs: w.endMs })),
  }));
}

/** Machine-readable descriptor for an AI "conductor". */
export function describe() {
  return {
    name: "@lacspace/captionsync",
    version: VERSION,
    summary: "Platform-safe burn-in captions from word/sentence timings: Devanagari-safe line breaking (never inside a word), ≤2 lines, per-platform safe areas, auto font-size fit, punctuation-aware breaks, cue duration bounds, karaoke highlight — as ASS (libass shapes Devanagari), SRT, VTT and a montage drawtext fallback.",
    canvases: Object.keys(CANVASES),
    commands: [
      { name: "captions", input: { type: "object", properties: { segments: { type: "array", description: "[{text,startMs,endMs,words?:[{text,startMs,endMs}]}]" }, canvas: { type: "string" }, fontSize: { type: "number" }, maxLines: { type: "integer" }, position: { enum: ["top", "center", "bottom"] }, karaoke: { enum: ["none", "fill", "word"] }, style: { enum: ["box", "outline"] }, fontName: { type: "string" }, fontsDir: { type: "string" }, assPath: { type: "string" } }, required: ["segments", "canvas"] }, output: "{ layout, ass, srt, vtt, filter, montageCaptions, stats }" },
      { name: "fromSpeakable", input: { type: "object", properties: { words: { type: "array" } }, required: ["words"] }, output: "TimedSegment[]" },
    ],
  };
}
