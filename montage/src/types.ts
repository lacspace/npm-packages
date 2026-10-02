import { PresetInfo, PresetName } from "./presets.js";

export type TransitionType = "crossfade" | "slide" | "zoom-punch" | "whip";
export type CaptionPosition = "top" | "center" | "bottom";

export interface ClipSegment {
  kind: "clip";
  src: string;
  /** Trim: start offset into the source, seconds. */
  start?: number;
  /** On-screen duration, seconds. */
  duration: number;
}

export interface StillSegment {
  kind: "still";
  src: string;
  duration: number;
  /** Ken Burns move. Default "in". */
  kenBurns?: "in" | "out" | "none";
}

export type Segment = ClipSegment | StillSegment;

export interface Transition {
  type: TransitionType;
  /** Overlap duration, seconds. Default 0.5. */
  duration?: number;
}

export interface Caption {
  text: string;
  start: number;
  end: number;
  position?: CaptionPosition;
  fontSize?: number;
  fontColor?: string;
  box?: boolean;
  boxColor?: string;
  /** Fade + slide-up on entry. Default true. */
  kinetic?: boolean;
}

export interface LowerThird {
  title: string;
  subtitle?: string;
  start: number;
  end: number;
  accent?: string;
}

export interface Logo {
  src: string;
  /** Corner to pin to. Default "top-right". */
  corner?: "top-left" | "top-right" | "bottom-left" | "bottom-right";
  /** Logo width in px. Default 140. */
  width?: number;
  /** Margin from the safe area, px. Default 24. */
  margin?: number;
}

export interface ProgressBar {
  height?: number;
  color?: string;
}

export interface TimelineSpec {
  preset: PresetName | PresetInfo;
  fps?: number;
  segments: Segment[];
  /** One transition applied between every pair, or one per gap (segments.length-1). */
  transitions?: Transition | Transition[];
  captions?: Caption[];
  lowerThirds?: LowerThird[];
  logo?: Logo;
  progressBar?: ProgressBar | boolean;
  /** A Devanagari-capable font file (Mukta / Noto Sans Devanagari) for correct shaping. */
  fontFile: string;
  /** Pre-mixed audio track (e.g. from @lacspace/audiomix). Optional. */
  audio?: string;
  /** ASS captions burned with libass (needs ffmpeg built with libass). Used alongside/instead of drawtext captions. */
  ass?: AssCaptions;
  output: string;
}

export interface BuildOptions {
  ffmpegPath?: string;
  /** libx264 preset (default "veryfast"; "fast" quality → "ultrafast"). */
  encodePreset?: string;
  /** Cap encoder threads to keep the box responsive. Default 2. */
  threads?: number;
  crf?: number;
  /**
   * "fast": ultrafast encode, crf 23, 24 fps default, 1.5× zoompan oversample, fewer filters —
   * for the ≤120 s single-thread render budget. "standard" (default) keeps full quality.
   */
  quality?: "fast" | "standard";
  /** Replace segment sources with pre-encoded renditions (see prepareRenditions). */
  renditions?: Record<string, string>;
}

/** Burn an ASS subtitle file (from @lacspace/captionsync) with libass — correct Devanagari shaping. */
export interface AssCaptions {
  file: string;
  /** Directory holding Mukta / Noto Sans Devanagari for libass. */
  fontsDir?: string;
}

/** One output of a multi-cut render: a different canvas and/or captions, same timeline. */
export interface Cut {
  preset: PresetName | PresetInfo;
  output: string;
  captions?: Caption[];
  lowerThirds?: LowerThird[];
  ass?: AssCaptions;
  logo?: Logo;
  progressBar?: ProgressBar | boolean;
  /** Pre-mixed audio for this cut (e.g. the Nepali voice track). Defaults to the base spec's audio. */
  audio?: string;
}

export interface Plan {
  /** Total output frames. */
  frames: number;
  /** Count of filters in the graph (zoompan, xfade, drawtext …). */
  filters: number;
  /** Abstract cost units (1 ≈ one 1080p frame through one average filter). */
  units: number;
  /** Estimated wall-clock seconds on one thread at `machineFactor` (default 1 = a 2020-class server core). */
  estimatedSeconds: number;
  /** Where the time goes. */
  breakdown: { decode: number; kenBurns: number; transitions: number; text: number; encode: number };
  /** Cheaper alternatives, best first. */
  suggestions: Array<{ change: string; estimatedSeconds: number }>;
}

export interface BuildResult {
  /** Full ffmpeg argument vector (excluding the binary). */
  args: string[];
  /** The -filter_complex graph, for inspection/testing. */
  filter: string;
  width: number;
  height: number;
  fps: number;
  /** Total output duration after transition overlaps, seconds. */
  duration: number;
}
