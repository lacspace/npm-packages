import { resolvePreset } from "./presets.js";
import { escapePath } from "./escape.js";
import {
  clipChain, drawtext, lowerThird, progressBar, stillChain, xfadeName, yExpr,
} from "./filter.js";
import { BuildOptions, BuildResult, Segment, TimelineSpec, Transition } from "./types.js";

function transitionsFor(spec: TimelineSpec): Transition[] {
  const gaps = Math.max(0, spec.segments.length - 1);
  if (!spec.transitions) return [];
  if (Array.isArray(spec.transitions)) return spec.transitions.slice(0, gaps);
  return Array.from({ length: gaps }, () => spec.transitions as Transition);
}

/**
 * Compile a timeline spec into an ffmpeg argument vector + filtergraph. Pure and
 * deterministic — it runs nothing. Feed `args` to ffmpeg yourself, or use `runMontage`.
 */
export function buildMontage(spec: TimelineSpec, options: BuildOptions = {}): BuildResult {
  const p = resolvePreset(spec.preset);
  const fps = spec.fps ?? 30;
  if (!spec.segments.length) throw new Error("montage: at least one segment is required");
  const transitions = transitionsFor(spec);

  const args: string[] = ["-y"];
  // --- inputs: segments, then optional audio, then optional logo ---
  spec.segments.forEach((s) => {
    if (s.kind === "still") {
      args.push("-loop", "1", "-t", String(s.duration), "-i", s.src);
    } else {
      if (s.start) args.push("-ss", String(s.start));
      args.push("-t", String(s.duration), "-i", s.src);
    }
  });
  let audioIndex = -1;
  let logoIndex = -1;
  if (spec.audio) {
    audioIndex = spec.segments.length;
    args.push("-i", spec.audio);
  }
  if (spec.logo) {
    logoIndex = spec.segments.length + (spec.audio ? 1 : 0);
    args.push("-i", spec.logo.src);
  }

  // --- per-segment normalization ---
  const chains: string[] = [];
  spec.segments.forEach((s: Segment, i) => {
    if (s.kind === "still") {
      chains.push(stillChain(`${i}:v`, `v${i}`, p, fps, s.duration, s.kenBurns ?? "in"));
    } else {
      chains.push(clipChain(`${i}:v`, `v${i}`, p, fps));
    }
  });

  // --- transition chain (xfade) or straight concat ---
  let last = "v0";
  let duration = spec.segments[0]!.duration;
  if (spec.segments.length === 1) {
    // single segment, nothing to join
  } else {
    for (let i = 1; i < spec.segments.length; i++) {
      const t = transitions[i - 1];
      const segDur = spec.segments[i]!.duration;
      if (t) {
        const td = t.duration ?? 0.5;
        const offset = Math.max(0, duration - td);
        const out = `x${i}`;
        chains.push(`[${last}][v${i}]xfade=transition=${xfadeName(t.type)}:duration=${td}:offset=${offset}[${out}]`);
        last = out;
        // The overlap shortens the total by one transition duration.
        duration = duration + segDur - td;
      } else {
        const out = `c${i}`;
        chains.push(`[${last}][v${i}]concat=n=2:v=1:a=0[${out}]`);
        last = out;
        duration += segDur;
      }
    }
  }

  // --- overlays: logo, lower-thirds, captions, progress bar ---
  const overlays: string[] = [];
  if (spec.logo && logoIndex >= 0) {
    const w = spec.logo.width ?? 140;
    const m = spec.logo.margin ?? 24;
    const corner = spec.logo.corner ?? "top-right";
    const x = corner.includes("left") ? `${p.safe.left + m}` : `W-w-${p.safe.right + m}`;
    const y = corner.includes("top") ? `${p.safe.top + m}` : `H-h-${p.safe.bottom + m}`;
    chains.push(`[${logoIndex}:v]scale=${w}:-1[logo]`);
    overlays.push(`[${last}][logo]overlay=x=${x}:y=${y}[ov_logo]`);
    last = "ov_logo";
  }

  // Lower-thirds and captions are drawtext/drawbox filters applied in sequence.
  const draws: string[] = [];
  for (const lt of spec.lowerThirds ?? []) {
    draws.push(...lowerThird({ ...lt, fontFile: spec.fontFile, preset: p }));
  }
  for (const c of spec.captions ?? []) {
    draws.push(
      drawtext({
        text: c.text,
        fontFile: spec.fontFile,
        fontSize: c.fontSize ?? 56,
        fontColor: c.fontColor ?? "white",
        start: c.start,
        end: c.end,
        pos: c.position ?? "bottom",
        preset: p,
        box: c.box ?? true,
        boxColor: c.boxColor,
        kinetic: c.kinetic ?? true,
      }),
    );
  }
  const pb = spec.progressBar;
  if (pb) {
    const h = (typeof pb === "object" && pb.height) || 8;
    const col = (typeof pb === "object" && pb.color) || "white";
    draws.push(progressBar(p, round(duration), h, col));
  }
  if (draws.length) {
    overlays.push(`[${last}]${draws.join(",")}[vout]`);
    last = "vout";
  } else {
    overlays.push(`[${last}]null[vout]`);
    last = "vout";
  }

  const filter = [...chains, ...overlays].join(";");

  // --- filter + mapping + encode ---
  args.push("-filter_complex", filter, "-map", "[vout]");
  if (audioIndex >= 0) {
    args.push("-map", `${audioIndex}:a`, "-c:a", "aac", "-b:a", "192k", "-shortest");
  } else {
    args.push("-an");
  }
  args.push(
    "-r", String(fps),
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-preset", options.encodePreset ?? "veryfast",
    "-crf", String(options.crf ?? 20),
    "-threads", String(options.threads ?? 2),
    "-movflags", "+faststart",
    spec.output,
  );

  return { args, filter, width: p.width, height: p.height, fps, duration: round(duration) };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export { yExpr };
