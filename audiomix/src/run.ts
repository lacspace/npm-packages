import { buildMix, MixResult, MixSpec } from "./mix.js";

export interface RunOptions {
  ffmpegPath?: string;
  niceLevel?: number;
  onLog?: (line: string) => void;
}

export interface RunResult extends MixResult {
  code: number;
}

/** Build the mix and run ffmpeg under nice + ulimit -c 0 (Node only). */
export async function runMix(spec: MixSpec, options: RunOptions = {}): Promise<RunResult> {
  const built = buildMix(spec);
  const ffmpeg = options.ffmpegPath ?? "ffmpeg";
  const nice = Math.min(19, Math.max(0, options.niceLevel ?? 15));
  const { spawn } = await import("node:child_process");
  return await new Promise<RunResult>((resolve, reject) => {
    const child = spawn(
      "sh",
      ["-c", `ulimit -c 0 2>/dev/null; exec nice -n ${nice} "$0" "$@"`, ffmpeg, ...built.args],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let err = "";
    child.stderr?.on("data", (d: Buffer) => {
      const s = d.toString();
      err += s;
      if (options.onLog) for (const line of s.split(/\r?\n/)) if (line.trim()) options.onLog(line);
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve({ ...built, code: 0 }) : reject(new Error(`ffmpeg exited ${code}\n${err.slice(-2000)}`))));
  });
}

/**
 * Decode an audio file to mono float PCM at a target sample rate via ffmpeg, for
 * `detectTempo` (Node only). Returns the samples and the sample rate used.
 */
export async function extractPcm(
  file: string,
  options: { ffmpegPath?: string; sampleRate?: number } = {},
): Promise<{ samples: Float32Array; sampleRate: number }> {
  const sampleRate = options.sampleRate ?? 22050;
  const ffmpeg = options.ffmpegPath ?? "ffmpeg";
  const { spawn } = await import("node:child_process");
  return await new Promise((resolve, reject) => {
    const child = spawn(ffmpeg, [
      "-i", file, "-vn", "-ac", "1", "-ar", String(sampleRate), "-f", "f32le", "-acodec", "pcm_f32le", "pipe:1",
    ], { stdio: ["ignore", "pipe", "ignore"] });
    const chunks: Buffer[] = [];
    child.stdout?.on("data", (d: Buffer) => chunks.push(d));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg pcm exit ${code}`));
      const buf = Buffer.concat(chunks);
      const samples = new Float32Array(buf.buffer, buf.byteOffset, Math.floor(buf.byteLength / 4));
      resolve({ samples, sampleRate });
    });
  });
}
