export { buildMontage } from "./build.js";
export { runMontage } from "./run.js";
export type { RunOptions, RunResult } from "./run.js";
export { PRESETS, resolvePreset } from "./presets.js";
export type { PresetName, PresetInfo, SafeArea } from "./presets.js";
export { escapeDrawtext, escapePath } from "./escape.js";
export type {
  TimelineSpec, Segment, ClipSegment, StillSegment, Transition, TransitionType,
  Caption, CaptionPosition, LowerThird, Logo, ProgressBar, BuildOptions, BuildResult,
} from "./types.js";
