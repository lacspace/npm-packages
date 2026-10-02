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
  output: string;
}

export interface BuildOptions {
  ffmpegPath?: string;
  /** libx264 preset (default "veryfast"). */
  encodePreset?: string;
  /** Cap encoder threads to keep the box responsive. Default 2. */
  threads?: number;
  crf?: number;
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
