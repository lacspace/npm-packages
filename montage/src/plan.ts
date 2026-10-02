import { resolvePreset } from "./presets.js";
import { BuildOptions, Cut, Plan, TimelineSpec } from "./types.js";

export interface PlanOptions extends BuildOptions {
  /**
   * Speed of the target box relative to the baseline (1 = one 2020-class server core doing
   * ~110 1080p-frame-units/s). Calibrate once with `calibrate()` from a real render.
   */
  machineFactor?: number;
  /** Extra cuts rendered in the same process (buildMultiCut). */
  cuts?: Cut[];
}

/** Per-frame cost units at 1080p (empirical ratios; absolute scale set by UNITS_PER_SECOND). */
const COST = {
  decodeClip: 0.35, // decode + scale/crop
  stillBase: 0.15, // loop a still
  kenBurns2x: 1.0, // zoompan on a 2× oversampled still
  kenBurns15x: 0.6, // zoompan at 1.5×
  xfade: 0.5, // per overlapping frame
  drawtext: 0.08, // per visible frame per drawtext
  drawbox: 0.03,
  ass: 0.12, // libass per frame while cues are visible
  encode: { ultrafast: 0.25, superfast: 0.35, veryfast: 0.5, faster: 0.65, fast: 0.8, medium: 1.0, slow: 1.6 } as Record<string, number>,
  recanvas: 0.2,
};
/** Baseline throughput: units per second on one core at machineFactor 1. */
export const UNITS_PER_SECOND = 110;

/** Estimate render cost/time before running ffmpeg, with cheaper alternatives. */
export function plan(spec: TimelineSpec, o: PlanOptions = {}): Plan {
  const p = resolvePreset(spec.preset);
  const fast = o.quality === "fast";
  const fps = spec.fps ?? (fast ? 24 : 30);
  const pixel = (p.width * p.height) / (1920 * 1080);
  const gaps = Math.max(0, spec.segments.length - 1);
  const transitions = !spec.transitions ? [] : Array.isArray(spec.transitions) ? spec.transitions.slice(0, gaps) : Array.from({ length: gaps }, () => spec.transitions as { duration?: number });
  const total = spec.segments.reduce((a, s) => a + s.duration, 0) - transitions.reduce((a, t) => a + (t.duration ?? 0.5), 0);
  const frames = Math.round(total * fps);

  let decode = 0, kenBurns = 0;
  for (const s of spec.segments) {
    const f = s.duration * fps;
    if (s.kind === "clip") decode += f * COST.decodeClip * pixel;
    else {
      decode += f * COST.stillBase * pixel;
      if ((s.kenBurns ?? "in") !== "none") kenBurns += f * (fast ? COST.kenBurns15x : COST.kenBurns2x) * pixel;
    }
  }
  const tr = transitions.reduce((a, t) => a + (t.duration ?? 0.5) * fps * COST.xfade * pixel, 0);
  const textUnits = (c: Pick<Cut, "captions" | "lowerThirds" | "ass" | "progressBar">, px: number) => {
    let u = 0;
    for (const cap of c.captions ?? []) u += (cap.end - cap.start) * fps * COST.drawtext * px;
    for (const lt of c.lowerThirds ?? []) u += (lt.end - lt.start) * fps * (COST.drawtext * 2 + COST.drawbox) * px;
    if (c.ass) u += frames * COST.ass * px;
    if (c.progressBar) u += frames * COST.drawbox * px;
    return u;
  };
  const preset = o.encodePreset ?? (fast ? "ultrafast" : "veryfast");
  const encUnit = COST.encode[preset] ?? COST.encode.veryfast!;
  let text = textUnits(spec, pixel);
  let encode = frames * encUnit * pixel;
  let filters = spec.segments.length + transitions.length + (spec.captions?.length ?? 0) + (spec.lowerThirds?.length ?? 0) * 2 + (spec.ass ? 1 : 0) + (spec.logo ? 1 : 0);
  for (const c of o.cuts ?? []) {
    const cp = resolvePreset(c.preset);
    const cpx = (cp.width * cp.height) / (1920 * 1080);
    text += textUnits(c, cpx) + (cp.width !== p.width ? frames * COST.recanvas * cpx : 0);
    encode += frames * encUnit * cpx;
    filters += 1 + (c.captions?.length ?? 0) + (c.lowerThirds?.length ?? 0) * 2 + (c.ass ? 1 : 0);
  }
  const units = decode + kenBurns + tr + text + encode;
  const mf = o.machineFactor ?? 1;
  const secs = (u: number) => Math.round((u / (UNITS_PER_SECOND * mf)) * 10) / 10;

  const suggestions: Plan["suggestions"] = [];
  if (!fast) {
    const alt = plan(spec, { ...o, quality: "fast" });
    suggestions.push({ change: 'quality: "fast" (ultrafast, 24 fps, 1.5× Ken Burns)', estimatedSeconds: alt.estimatedSeconds });
  }
  if (spec.segments.some((s) => s.kind === "still" && (s.kenBurns ?? "in") !== "none")) {
    const alt = plan({ ...spec, segments: spec.segments.map((s) => (s.kind === "still" ? { ...s, kenBurns: "none" as const } : s)) }, { ...o, quality: o.quality });
    suggestions.push({ change: "kenBurns: none on stills", estimatedSeconds: alt.estimatedSeconds });
  }
  if (!o.cuts?.length && (spec.captions?.length ?? 0) > 6) {
    suggestions.push({ change: "use one ASS file (captionsync) instead of many drawtext captions", estimatedSeconds: secs(units - text + frames * COST.ass * pixel) });
  }
  suggestions.sort((a, b) => a.estimatedSeconds - b.estimatedSeconds);
  return {
    frames, filters, units: Math.round(units), estimatedSeconds: secs(units),
    breakdown: { decode: secs(decode), kenBurns: secs(kenBurns), transitions: secs(tr), text: secs(text), encode: secs(encode) },
    suggestions,
  };
}

/** Derive `machineFactor` from one measured render: pass the plan you made and the seconds it really took. */
export function calibrate(planned: Plan, measuredSeconds: number): number {
  if (measuredSeconds <= 0) return 1;
  return Math.round((planned.estimatedSeconds / measuredSeconds) * 100) / 100;
}

export interface RenditionOptions {
  /** Output directory for the mezzanines. */
  outDir: string;
  /** Target height (default 720). Width follows aspect, even. */
  height?: number;
  /** Only clips longer than this are worth pre-encoding (default 0 = all). */
  minDuration?: number;
}

/**
 * Pre-encode each distinct clip source once to a light 720p mezzanine (ultrafast, short GOP) so
 * every later cut (en/ne/square/reels) decodes cheaply. Returns the ffmpeg arg vectors to run
 * (once, cacheable by source) and the `renditions` map for buildMontage/buildMultiCut.
 */
export function prepareRenditions(spec: TimelineSpec, o: RenditionOptions): { jobs: Array<{ src: string; out: string; args: string[] }>; renditions: Record<string, string> } {
  const h = o.height ?? 720;
  const jobs: Array<{ src: string; out: string; args: string[] }> = [];
  const renditions: Record<string, string> = {};
  const seen = new Set<string>();
  for (const s of spec.segments) {
    if (s.kind !== "clip" || seen.has(s.src) || s.duration < (o.minDuration ?? 0)) continue;
    seen.add(s.src);
    const name = s.src.replace(/^.*[\\/]/, "").replace(/\.[^.]+$/, "");
    const out = `${o.outDir.replace(/[\\/]$/, "")}/${name}.${h}p.mp4`;
    jobs.push({ src: s.src, out, args: ["-y", "-i", s.src, "-vf", `scale=-2:${h}`, "-c:v", "libx264", "-preset", "ultrafast", "-crf", "22", "-g", "24", "-pix_fmt", "yuv420p", "-an", "-movflags", "+faststart", out] });
    renditions[s.src] = out;
  }
  return { jobs, renditions };
}
