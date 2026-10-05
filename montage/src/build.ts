import { PresetInfo, resolvePreset } from "./presets.js";
import {
  assFilter, clipChain, drawtext, lowerThird, progressBar, recanvas, stillChain, xfadeName, yExpr,
} from "./filter.js";
import { BuildOptions, BuildResult, Cut, Segment, TimelineSpec, Transition } from "./types.js";

function transitionsFor(spec: TimelineSpec): Transition[] {
  const gaps = Math.max(0, spec.segments.length - 1);
  if (!spec.transitions) return [];
  if (Array.isArray(spec.transitions)) return spec.transitions.slice(0, gaps);
  return Array.from({ length: gaps }, () => spec.transitions as Transition);
}

interface BaseGraph {
  args: string[];
  chains: string[];
  last: string;
  duration: number;
  fps: number;
  p: PresetInfo;
  fast: boolean;
  /** Next free input index (segments consumed 0..n-1). */
  nextInput: number;
}

/** Inputs + per-segment normalisation + transitions, shared by single and multi-cut builds. */
function baseGraph(spec: TimelineSpec, options: BuildOptions): BaseGraph {
  const p = resolvePreset(spec.preset);
  const fast = options.quality === "fast";
  const fps = spec.fps ?? (fast ? 24 : 30);
  if (!spec.segments.length) throw new Error("montage: at least one segment is required");
  const transitions = transitionsFor(spec);
  const src = (s: Segment) => options.renditions?.[s.src] ?? s.src;

  const args: string[] = ["-y"];
  spec.segments.forEach((s) => {
    if (s.kind === "still") {
      args.push("-loop", "1", "-t", String(s.duration), "-i", src(s));
    } else {
      if (s.start) args.push("-ss", String(s.start));
      args.push("-t", String(s.duration), "-i", src(s));
    }
  });

  const chains: string[] = [];
  spec.segments.forEach((s: Segment, i) => {
    if (s.kind === "still") {
      chains.push(stillChain(`${i}:v`, `v${i}`, p, fps, s.duration, s.kenBurns ?? "in", fast ? 1.5 : 2));
    } else {
      chains.push(clipChain(`${i}:v`, `v${i}`, p, fps));
    }
  });

  let last = "v0";
  let duration = spec.segments[0]!.duration;
  for (let i = 1; i < spec.segments.length; i++) {
    const t = transitions[i - 1];
    const segDur = spec.segments[i]!.duration;
    if (t) {
      const td = t.duration ?? 0.5;
      const offset = Math.max(0, duration - td);
      const out = `x${i}`;
      chains.push(`[${last}][v${i}]xfade=transition=${xfadeName(t.type)}:duration=${td}:offset=${offset}[${out}]`);
      last = out;
      duration = duration + segDur - td; // the overlap shortens the total
    } else {
      const out = `c${i}`;
      chains.push(`[${last}][v${i}]concat=n=2:v=1:a=0[${out}]`);
      last = out;
      duration += segDur;
    }
  }
  return { args, chains, last, duration, fps, p, fast, nextInput: spec.segments.length };
}

type Overlayable = Pick<Cut, "captions" | "lowerThirds" | "ass" | "logo" | "progressBar">;

/** Logo + lower-thirds + captions (+ASS) + progress bar on top of `inLabel`, ending at `outLabel`. */
function overlaysFor(
  o: Overlayable, p: PresetInfo, duration: number, fontFile: string, inLabel: string, outLabel: string, logoInput: number | undefined, tag: string,
): string[] {
  const out: string[] = [];
  let last = inLabel;
  if (o.logo && logoInput !== undefined) {
    const w = o.logo.width ?? 140;
    const m = o.logo.margin ?? 24;
    const corner = o.logo.corner ?? "top-right";
    const x = corner.includes("left") ? `${p.safe.left + m}` : `W-w-${p.safe.right + m}`;
    const y = corner.includes("top") ? `${p.safe.top + m}` : `H-h-${p.safe.bottom + m}`;
    out.push(`[${logoInput}:v]scale=${w}:-1[logo${tag}]`);
    out.push(`[${last}][logo${tag}]overlay=x=${x}:y=${y}[ov${tag}]`);
    last = `ov${tag}`;
  }
  const draws: string[] = [];
  for (const lt of o.lowerThirds ?? []) draws.push(...lowerThird({ ...lt, fontFile, preset: p }));
  for (const c of o.captions ?? []) {
    draws.push(drawtext({
      text: c.text, fontFile, fontSize: c.fontSize ?? 56, fontColor: c.fontColor ?? "white", start: c.start, end: c.end,
      pos: c.position ?? "bottom", preset: p, box: c.box ?? true, boxColor: c.boxColor, kinetic: c.kinetic ?? true,
    }));
  }
  if (o.ass) draws.push(assFilter(o.ass.file, o.ass.fontsDir));
  const pb = o.progressBar;
  if (pb) {
    const h = (typeof pb === "object" && pb.height) || 8;
    const col = (typeof pb === "object" && pb.color) || "white";
    draws.push(progressBar(p, round(duration), h, col));
  }
  out.push(draws.length ? `[${last}]${draws.join(",")}[${outLabel}]` : `[${last}]null[${outLabel}]`);
  return out;
}

function encodeArgs(fps: number, options: BuildOptions, fast: boolean): string[] {
  return [
    "-r", String(fps),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", options.encodePreset ?? (fast ? "ultrafast" : "veryfast"),
    "-crf", String(options.crf ?? (fast ? 23 : 20)),
    "-threads", String(options.threads ?? 2),
    "-movflags", "+faststart",
  ];
}

/**
 * Compile a timeline spec into an ffmpeg argument vector + filtergraph. Pure and
 * deterministic — it runs nothing. Feed `args` to ffmpeg yourself, or use `runMontage`.
 */
export function buildMontage(spec: TimelineSpec, options: BuildOptions = {}): BuildResult {
  const g = baseGraph(spec, options);
  const { args, chains, p, fps, duration, fast } = g;
  let audioIndex = -1, logoIndex: number | undefined;
  if (spec.audio) { audioIndex = g.nextInput++; args.push("-i", spec.audio); }
  if (spec.logo) { logoIndex = g.nextInput++; args.push("-i", spec.logo.src); }

  const overlays = overlaysFor(spec, p, duration, spec.fontFile, g.last, "vout", logoIndex, "");
  const filter = [...chains, ...overlays].join(";");

  args.push("-filter_complex", filter, "-map", "[vout]");
  // The output is capped at the timeline length with -t, not -shortest: -shortest made ffmpeg
  // buffer far more (measured 1.4 GB vs 0.66 GB RSS for a 1080x1920 montage) for the same result.
  if (audioIndex >= 0) args.push("-map", `${audioIndex}:a`, "-c:a", "aac", "-b:a", "192k", "-t", String(round(duration)));
  else args.push("-an");
  args.push(...encodeArgs(fps, options, fast), spec.output);

  return { args, filter, width: p.width, height: p.height, fps, duration: round(duration) };
}

export interface MultiCutResult extends Omit<BuildResult, "width" | "height"> {
  outputs: Array<{ output: string; width: number; height: number }>;
}

/**
 * One ffmpeg process, several outputs: decode + Ken Burns + transitions ONCE, then split the
 * base video into N cuts that differ by canvas (reels/square/landscape), captions (en/ne),
 * lower-thirds, ASS file, logo and audio track. This is how the en + ne + square cuts fit a
 * single-thread render budget — the expensive part of the graph runs one time.
 */
export function buildMultiCut(spec: TimelineSpec, cuts: Cut[], options: BuildOptions = {}): MultiCutResult {
  if (!cuts.length) throw new Error("montage: at least one cut is required");
  const g = baseGraph(spec, options);
  const { args, chains, p, fps, duration, fast } = g;
  // Audio inputs: base audio (if any) + per-cut overrides, de-duplicated.
  const audioInputs = new Map<string, number>();
  const audioFor = (path: string | undefined) => {
    if (!path) return -1;
    if (!audioInputs.has(path)) { audioInputs.set(path, g.nextInput++); args.push("-i", path); }
    return audioInputs.get(path)!;
  };
  const baseAudio = audioFor(spec.audio);
  const logoInputs = new Map<string, number>();
  const logoFor = (path: string | undefined) => {
    if (!path) return undefined;
    if (!logoInputs.has(path)) { logoInputs.set(path, g.nextInput++); args.push("-i", path); }
    return logoInputs.get(path)!;
  };
  const baseLogo = logoFor(spec.logo?.src);
  const cutAudio = cuts.map((c) => (c.audio ? audioFor(c.audio) : baseAudio));
  const cutLogo = cuts.map((c) => (c.logo ? logoFor(c.logo.src) : baseLogo));

  const split = `[${g.last}]split=${cuts.length}${cuts.map((_, i) => `[b${i}]`).join("")}`;
  const perCut: string[] = [];
  const outputs: MultiCutResult["outputs"] = [];
  cuts.forEach((c, i) => {
    const cp = resolvePreset(c.preset);
    let inLabel = `b${i}`;
    if (cp.width !== p.width || cp.height !== p.height) {
      perCut.push(recanvas(inLabel, `r${i}`, cp));
      inLabel = `r${i}`;
    }
    perCut.push(...overlaysFor({ ...c, logo: c.logo ?? spec.logo }, cp, duration, spec.fontFile, inLabel, `out${i}`, cutLogo[i], String(i)));
    outputs.push({ output: c.output, width: cp.width, height: cp.height });
  });
  const filter = [...chains, split, ...perCut].join(";");
  args.push("-filter_complex", filter);
  cuts.forEach((c, i) => {
    args.push("-map", `[out${i}]`);
    const a = cutAudio[i]!;
    if (a >= 0) args.push("-map", `${a}:a`, "-c:a", "aac", "-b:a", "192k", "-t", String(round(duration)));
    else args.push("-an");
    args.push(...encodeArgs(fps, options, fast), c.output);
  });
  return { args, filter, fps, duration: round(duration), outputs };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export { yExpr };
