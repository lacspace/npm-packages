import { Track } from "./library.js";

export interface Sting {
  /** SFX audio file (whoosh, sting…). Must carry its own licence in your library. */
  src: string;
  /** When to place it, seconds. */
  at: number;
  /** Gain in dB (default -6). */
  gainDb?: number;
  /** Optional credit line for this SFX. */
  attribution?: string;
}

export interface MixSpec {
  /** Voiceover / narration track (the anchor). */
  voice: string;
  /** Music bed (from your licensed library). Optional. */
  music?: Track | string;
  /** SFX stings / whooshes placed at times. */
  stings?: Sting[];
  output: string;
  /** Target integrated loudness (LUFS). Default -14 (streaming standard). */
  targetLUFS?: number;
  /** True peak ceiling, dBTP. Default -1.5. */
  truePeak?: number;
  /** Base music gain before ducking, dB. Default -9. */
  musicGainDb?: number;
  /** How hard to duck music under the voice, dB (approx). Default -12. */
  duckDb?: number;
}

export interface MixResult {
  args: string[];
  filter: string;
  /** Credit lines for every licensed asset used, de-duplicated. */
  attribution: string[];
}

function musicPath(m: Track | string): string {
  return typeof m === "string" ? m : m.path;
}

/**
 * Build the ffmpeg command for a voice + music mix: music ducked under the voice via
 * sidechain compression, SFX stings placed by time, and the whole thing normalized to
 * the target LUFS. Pure — runs nothing. Only uses files you pass (keep your library
 * licence-clean). Returns the attribution lines to print with the video.
 */
export function buildMix(spec: MixSpec): MixResult {
  const targetLUFS = spec.targetLUFS ?? -14;
  const truePeak = spec.truePeak ?? -1.5;
  const musicGain = spec.musicGainDb ?? -9;
  // Deeper ducking → lower sidechain ratio threshold; map dB to a ratio heuristically.
  const ratio = Math.min(20, Math.max(2, Math.round(Math.abs(spec.duckDb ?? -12) / 1.5)));

  const args: string[] = ["-y", "-i", spec.voice];
  let idx = 1;
  let musicIdx = -1;
  if (spec.music) {
    musicIdx = idx++;
    args.push("-i", musicPath(spec.music));
  }
  const stingIdx: number[] = [];
  for (const s of spec.stings ?? []) {
    stingIdx.push(idx++);
    args.push("-i", s.src);
  }

  const chains: string[] = [];
  const mixLabels: string[] = ["[voice]"];
  chains.push(`[0:a]aformat=sample_rates=48000:channel_layouts=stereo,dynaudnorm=f=250:g=5[voice]`);

  if (musicIdx >= 0) {
    // Gain the bed, then duck it with the voice as the sidechain key, then it joins the mix.
    chains.push(`[${musicIdx}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${musicGain}dB[mraw]`);
    chains.push(`[mraw][voice]sidechaincompress=threshold=0.03:ratio=${ratio}:attack=20:release=300:makeup=1[music]`);
    mixLabels.push("[music]");
  }

  (spec.stings ?? []).forEach((s, i) => {
    const inLabel = stingIdx[i]!;
    const delayMs = Math.max(0, Math.round(s.at * 1000));
    chains.push(
      `[${inLabel}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${s.gainDb ?? -6}dB,adelay=${delayMs}|${delayMs}[sting${i}]`,
    );
    mixLabels.push(`[sting${i}]`);
  });

  const n = mixLabels.length;
  chains.push(
    `${mixLabels.join("")}amix=inputs=${n}:duration=first:dropout_transition=0:normalize=0[mixed]`,
  );
  chains.push(`[mixed]loudnorm=I=${targetLUFS}:TP=${truePeak}:LRA=11[out]`);

  const filter = chains.join(";");
  args.push("-filter_complex", filter, "-map", "[out]", "-c:a", "aac", "-b:a", "192k", spec.output);

  // Attribution: music + any sting lines, de-duplicated, in order.
  const attribution: string[] = [];
  if (spec.music && typeof spec.music !== "string") attribution.push(spec.music.licence.attribution);
  for (const s of spec.stings ?? []) if (s.attribution) attribution.push(s.attribution);
  return { args, filter, attribution: [...new Set(attribution)] };
}
