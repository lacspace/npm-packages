export interface TimedWord {
  text: string;
  startMs: number;
  endMs: number;
}

export interface TimedSegment {
  text: string;
  startMs: number;
  endMs: number;
  /** Optional word timings inside the segment (karaoke). */
  words?: TimedWord[];
}

export interface SafeArea { top: number; bottom: number; left: number; right: number }

export interface Canvas {
  width: number;
  height: number;
  safe: SafeArea;
}

export type CaptionPosition = "top" | "center" | "bottom";

export interface LayoutOptions {
  canvas: Canvas;
  /** Target font size in px at canvas scale (default 6% of width ≈ 64 @1080). Auto-shrinks to fit. */
  fontSize?: number;
  minFontSize?: number;
  /** Max lines per cue (default 2). */
  maxLines?: number;
  /** Cue duration bounds, ms (default 1000–5000). */
  minCueMs?: number;
  maxCueMs?: number;
  /** Max characters per cue hint (default derived from width/fontSize). */
  maxCharsPerLine?: number;
  /** Gap below which consecutive cues are joined so text doesn't flicker (default 120 ms). */
  mergeGapMs?: number;
  position?: CaptionPosition;
  /** Prefer breaking after these characters (default , । . ; : ? ! —). */
  breakAfter?: string;
}

export interface CueLine {
  words: TimedWord[];
  text: string;
}

export interface Cue {
  index: number;
  startMs: number;
  endMs: number;
  lines: CueLine[];
  text: string;
}

export interface Layout {
  cues: Cue[];
  fontSize: number;
  maxCharsPerLine: number;
  position: CaptionPosition;
  canvas: Canvas;
  /** Longest line (in estimated px) — for diagnostics. */
  widestPx: number;
}

export interface StyleOptions {
  fontName?: string; // "Mukta"
  /** Secondary font for Devanagari when the primary can't shape it (libass falls back automatically if in fontsdir). */
  primaryColor?: string; // "#FFFFFF"
  /** Karaoke fill (highlight) colour. */
  highlightColor?: string; // "#FFD400"
  outlineColor?: string; // "#000000"
  backColor?: string; // "#000000@0.55" (box)
  outline?: number; // px
  shadow?: number;
  bold?: boolean;
  /** "box" draws an opaque band; "outline" draws stroked text (default box). */
  style?: "box" | "outline";
  /** Karaoke: "none" | "fill" (\\kf sweep) | "word" (\\k per-word pop) (default none). */
  karaoke?: "none" | "fill" | "word";
  /** Fade in/out ms (default 120). */
  fadeMs?: number;
}
