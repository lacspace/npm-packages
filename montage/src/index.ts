export { buildMontage, buildMultiCut } from "./build.js";
export type { MultiCutResult } from "./build.js";
export { runMontage } from "./run.js";
export type { RunOptions, RunResult } from "./run.js";
export { plan, calibrate, prepareRenditions, UNITS_PER_SECOND } from "./plan.js";
export type { PlanOptions, RenditionOptions } from "./plan.js";
export { PRESETS, resolvePreset } from "./presets.js";
export type { PresetName, PresetInfo, SafeArea } from "./presets.js";
export { escapeDrawtext, escapePath } from "./escape.js";
export { assFilter, recanvas } from "./filter.js";
export type {
  TimelineSpec, Segment, ClipSegment, StillSegment, Transition, TransitionType, Caption, CaptionPosition,
  LowerThird, Logo, ProgressBar, BuildOptions, BuildResult, AssCaptions, Cut, Plan,
} from "./types.js";

/** Machine-readable descriptor for an AI "conductor". */
export function describe() {
  return {
    name: "@lacspace/montage",
    version: "1.1.0",
    summary: "Deterministic ffmpeg timeline compiler for social video: presets with safe areas, Ken Burns stills, xfade transitions, Devanagari captions (drawtext or libass ASS), lower-thirds, logo, progress bar; render-time plan() estimator with cheaper alternatives, fast quality mode, 720p renditions, and one-process multi-cut (en/ne/square/reels from one decode).",
    commands: [
      { name: "buildMontage", input: { type: "object", properties: { spec: { type: "object" }, options: { type: "object", properties: { quality: { enum: ["fast", "standard"] }, renditions: { type: "object" }, threads: { type: "integer" } } } }, required: ["spec"] }, output: "{ args, filter, width, height, fps, duration }" },
      { name: "buildMultiCut", input: { type: "object", properties: { spec: { type: "object" }, cuts: { type: "array", description: "[{preset, output, captions?, lowerThirds?, ass?, logo?, audio?}]" }, options: { type: "object" } }, required: ["spec", "cuts"] }, output: "{ args, filter, fps, duration, outputs }" },
      { name: "plan", input: { type: "object", properties: { spec: { type: "object" }, options: { type: "object", properties: { quality: { type: "string" }, machineFactor: { type: "number" }, cuts: { type: "array" } } } }, required: ["spec"] }, output: "{ frames, filters, units, estimatedSeconds, breakdown, suggestions }" },
      { name: "prepareRenditions", input: { type: "object", properties: { spec: { type: "object" }, outDir: { type: "string" }, height: { type: "integer" } }, required: ["spec", "outDir"] }, output: "{ jobs:[{src,out,args}], renditions }" },
      { name: "runMontage", input: { type: "object", properties: { spec: { type: "object" }, options: { type: "object" } }, required: ["spec"] }, output: "{ code, …BuildResult }" },
    ],
  };
}
