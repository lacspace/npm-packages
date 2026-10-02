import { buildMontage } from "./build.js";
import { BuildOptions, BuildResult, TimelineSpec } from "./types.js";

export interface RunOptions extends BuildOptions {
  /** ffmpeg binary. Default "ffmpeg" (on PATH). */
  ffmpegPath?: string;
  /** Unix `nice` level (0–19) to keep the server responsive. Default 15. */
  niceLevel?: number;
  /** Receive ffmpeg's stderr (progress) lines. */
  onLog?: (line: string) => void;
}

export interface RunResult extends BuildResult {
  code: number;
}

/**
 * Build the timeline and run ffmpeg (Node only). Spawns under `nice` with a core-dump
 * limit of 0 and an encoder thread cap so a render can't peg the box. Resolves when
 * ffmpeg exits; rejects only if the process can't be spawned.
 */
export async function runMontage(spec: TimelineSpec, options: RunOptions = {}): Promise<RunResult> {
  const built = buildMontage(spec, options);
  const ffmpeg = options.ffmpegPath ?? "ffmpeg";
  const nice = Math.min(19, Math.max(0, options.niceLevel ?? 15));
  const { spawn } = await import("node:child_process");
  return await new Promise<RunResult>((resolve, reject) => {
    // sh wrapper applies `ulimit -c 0` then exec's `nice ffmpeg <args>` with argv passed
    // positionally (no manual quoting). $0 = ffmpeg path, $@ = the ffmpeg args.
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
    child.on("close", (code) => {
      if (code === 0) resolve({ ...built, code: 0 });
      else reject(new Error(`ffmpeg exited ${code}\n${err.slice(-2000)}`));
    });
  });
}
