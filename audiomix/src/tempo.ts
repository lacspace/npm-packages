export interface TempoResult {
  bpm: number;
  /** Beat positions in seconds. */
  beats: number[];
  /** 0–1 confidence from the autocorrelation peak strength. */
  confidence: number;
}

export interface TempoOptions {
  /** Hop size in samples for the onset envelope. Default 512. */
  hop?: number;
  /** BPM search range. Default 60–180. */
  minBpm?: number;
  maxBpm?: number;
}

/**
 * Estimate tempo and beat positions from mono PCM, deterministically — an energy
 * onset envelope plus autocorrelation over the BPM range. Intended for picking cut
 * points, not musicological precision. Pass PCM you extracted (e.g. via ffmpeg).
 */
export function detectTempo(samples: Float32Array, sampleRate: number, options: TempoOptions = {}): TempoResult {
  const hop = options.hop ?? 256;
  const minBpm = options.minBpm ?? 60;
  const maxBpm = options.maxBpm ?? 180;
  if (samples.length < hop * 4 || sampleRate <= 0) return { bpm: 0, beats: [], confidence: 0 };

  // 1) RMS energy per hop frame.
  const frames = Math.floor(samples.length / hop);
  const energy = new Float64Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    const base = f * hop;
    for (let i = 0; i < hop; i++) {
      const s = samples[base + i]!;
      sum += s * s;
    }
    energy[f] = Math.sqrt(sum / hop);
  }
  // 2) Onset envelope = positive energy increase.
  const onset = new Float64Array(frames);
  let mean = 0;
  for (let f = 1; f < frames; f++) {
    const d = energy[f]! - energy[f - 1]!;
    onset[f] = d > 0 ? d : 0;
    mean += onset[f]!;
  }
  mean /= Math.max(1, frames - 1);
  for (let f = 0; f < frames; f++) onset[f] = Math.max(0, onset[f]! - mean); // de-bias

  // 3) Autocorrelate the onset envelope over the lag range matching the BPM window.
  const framesPerSec = sampleRate / hop;
  const lagMin = Math.max(1, Math.floor((60 / maxBpm) * framesPerSec));
  const lagMax = Math.min(frames - 1, Math.ceil((60 / minBpm) * framesPerSec));
  let bestLag = lagMin;
  let bestScore = -Infinity;
  let total = 0;
  for (let lag = lagMin; lag <= lagMax; lag++) {
    let s = 0;
    for (let f = lag; f < frames; f++) s += onset[f]! * onset[f - lag]!;
    // Normalize by the number of overlapping terms — otherwise short lags (high BPM)
    // win simply because the sum has more terms, biasing every estimate upward.
    s /= frames - lag;
    // Perceptual tempo preference (log-normal around ~120 BPM) to resolve octave
    // errors: a pure pulse train correlates equally at P and 2P, so bias toward the
    // human-salient range instead of picking a sub-/super-harmonic.
    const bpmLag = (60 * framesPerSec) / lag;
    const w = Math.exp(-0.5 * Math.pow(Math.log2(bpmLag / 120) / 0.9, 2));
    s *= w;
    total += s;
    if (s > bestScore) {
      bestScore = s;
      bestLag = lag;
    }
  }
  const bpm = Math.round((60 * framesPerSec) / bestLag);
  const confidence = total > 0 ? Math.min(1, (bestScore / (total / (lagMax - lagMin + 1))) / 4) : 0;

  // 4) Place beats from the strongest onset, stepping by the detected period.
  const periodSec = bestLag / framesPerSec;
  let startFrame = 0;
  let peak = -Infinity;
  for (let f = 0; f < Math.min(frames, Math.ceil(framesPerSec * periodSec)); f++) {
    if (onset[f]! > peak) {
      peak = onset[f]!;
      startFrame = f;
    }
  }
  const startSec = startFrame / framesPerSec;
  const durationSec = samples.length / sampleRate;
  const beats: number[] = [];
  for (let t = startSec; t < durationSec; t += periodSec) beats.push(Math.round(t * 1000) / 1000);

  return { bpm, beats, confidence: Math.round(confidence * 100) / 100 };
}

/** Snap arbitrary cut times to the nearest beat (for beat-synced montage cuts). */
export function snapToBeats(cutTimes: number[], beats: number[]): number[] {
  if (!beats.length) return cutTimes;
  return cutTimes.map((t) => {
    let best = beats[0]!;
    let bestD = Math.abs(t - best);
    for (const b of beats) {
      const d = Math.abs(t - b);
      if (d < bestD) {
        bestD = d;
        best = b;
      }
    }
    return best;
  });
}
