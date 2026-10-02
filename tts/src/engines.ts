import { parseSrt } from "./audio.js";
import type { WordBoundary } from "@lacspace/speakable";

export interface SynthRequest {
  /** Plain spoken text (already normalised by speakable). */
  text: string;
  /** SSML (speakable's) for engines that accept it. */
  ssml: string;
  voice: string;
  /** Relative rate, 1 = normal. */
  rate?: number;
  /** Pitch in Hz offset. */
  pitchHz?: number;
  lang: "ne" | "en";
}

export interface SynthResult {
  audio: Uint8Array;
  format: "mp3" | "wav" | "ogg" | "unknown";
  /** Engine-native word timings, when the engine gives them. */
  boundaries?: WordBoundary[];
}

export interface Engine {
  name: string;
  synthesize(req: SynthRequest): Promise<SynthResult>;
}

/** Minimal process runner (injectable for tests). */
export type Exec = (cmd: string, args: string[], input?: string) => Promise<{ code: number; stdout: string; stderr: string }>;
export interface Fs {
  readFile(path: string): Promise<Uint8Array>;
  writeFile(path: string, data: Uint8Array | string): Promise<void>;
  exists(path: string): Promise<boolean>;
  mkdir(path: string): Promise<void>;
}

export async function nodeExec(): Promise<Exec> {
  const { spawn } = await import("node:child_process");
  return (cmd, args, input) => new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: [input !== undefined ? "pipe" : "ignore", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    child.stdout!.on("data", (d: Buffer) => (stdout += d.toString()));
    child.stderr!.on("data", (d: Buffer) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
    if (input !== undefined) { child.stdin!.write(input); child.stdin!.end(); }
  });
}

export async function nodeFs(): Promise<Fs> {
  const fs = await import("node:fs/promises");
  return {
    readFile: (p) => fs.readFile(p).then((b) => new Uint8Array(b)),
    writeFile: (p, d) => fs.writeFile(p, d),
    exists: (p) => fs.access(p).then(() => true, () => false),
    mkdir: (p) => fs.mkdir(p, { recursive: true }).then(() => undefined),
  };
}

export interface EdgeCliOptions {
  /** Binary name/path (default "edge-tts"). */
  bin?: string;
  /** Scratch directory for the CLI's output files. */
  tmpDir: string;
  exec: Exec;
  fs: Fs;
}

/**
 * Microsoft Edge neural voices via the `edge-tts` CLI (pip install edge-tts), which WeNepal already
 * runs. We pass PLAIN normalised text (the CLI has no SSML input), rate/pitch as flags, and read the
 * word-level subtitles it writes (`--write-subtitles … --words-in-cue 1`) as WordBoundary events.
 */
export function edgeCli(o: EdgeCliOptions): Engine {
  return {
    name: "edge-tts",
    async synthesize(req) {
      const id = Math.random().toString(36).slice(2);
      const media = `${o.tmpDir}/${id}.mp3`, subs = `${o.tmpDir}/${id}.srt`;
      await o.fs.mkdir(o.tmpDir);
      const { rate, pitch } = edgeFlags(req);
      const args = ["--voice", req.voice, "--rate", rate, "--pitch", pitch, "--text", req.text, "--write-media", media, "--write-subtitles", subs, "--words-in-cue", "1"];
      const r = await o.exec(o.bin ?? "edge-tts", args);
      if (r.code !== 0) throw new Error(`edge-tts exited ${r.code}: ${r.stderr.slice(-500)}`);
      const audio = await o.fs.readFile(media);
      let boundaries: WordBoundary[] | undefined;
      if (await o.fs.exists(subs)) {
        const srt = new TextDecoder().decode(await o.fs.readFile(subs));
        boundaries = parseSrt(srt).map((c) => ({ text: c.text, offsetMs: c.startMs, durationMs: Math.max(1, c.endMs - c.startMs) }));
      }
      return { audio, format: "mp3", boundaries };
    },
  };
}

/** Inline Python driver: exact WordBoundary offsets from edge_tts.Communicate(...).stream(). */
export const EDGE_PY_SCRIPT = [
  "import sys, json, asyncio, edge_tts",
  "voice, rate, pitch, out = sys.argv[1:5]",
  "text = sys.stdin.read()",
  "async def run():",
  "    c = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch, boundary='WordBoundary')",
  "    words = []",
  "    with open(out, 'wb') as f:",
  "        async for ch in c.stream():",
  "            if ch['type'] == 'audio': f.write(ch['data'])",
  "            elif ch['type'] == 'WordBoundary': words.append({'text': ch['text'], 'offsetMs': ch['offset'] / 10000, 'durationMs': ch['duration'] / 10000})",
  "    print(json.dumps({'boundaries': words}, ensure_ascii=False))",
  "asyncio.run(run())",
].join("\n");

export interface EdgePythonOptions {
  /** The venv's python that has `edge-tts` installed. */
  pythonBin: string;
  tmpDir: string;
  exec: Exec;
  fs: Fs;
}

function edgeFlags(req: SynthRequest): { rate: string; pitch: string } {
  const rate = req.rate && req.rate !== 1 ? `${req.rate > 1 ? "+" : ""}${Math.round((req.rate - 1) * 100)}%` : "+0%";
  const pitch = req.pitchHz ? `${req.pitchHz > 0 ? "+" : ""}${Math.round(req.pitchHz)}Hz` : "+0Hz";
  return { rate, pitch };
}

/** Edge neural voices via the Python package (exact WordBoundary events on stdout as JSON). */
export function edgePython(o: EdgePythonOptions): Engine {
  return {
    name: "edge-tts",
    async synthesize(req) {
      const media = `${o.tmpDir}/${Math.random().toString(36).slice(2)}.mp3`;
      await o.fs.mkdir(o.tmpDir);
      const { rate, pitch } = edgeFlags(req);
      const r = await o.exec(o.pythonBin, ["-c", EDGE_PY_SCRIPT, req.voice, rate, pitch, media], req.text);
      if (r.code !== 0) throw new Error(`edge-tts (python) exited ${r.code}: ${r.stderr.slice(-500)}`);
      const line = r.stdout.trim().split("\n").pop() ?? "{}";
      const parsed = JSON.parse(line) as { boundaries?: WordBoundary[] };
      const audio = await o.fs.readFile(media);
      if (!audio.length) throw new Error("edge-tts (python): NoAudioReceived");
      return { audio, format: "mp3", boundaries: parsed.boundaries };
    },
  };
}

export interface EdgeOptions {
  /** Preferred: the venv python with edge-tts (exact word offsets). */
  pythonBin?: string;
  /** Fallback: the edge-tts CLI (word cues from --write-subtitles). */
  cliBin?: string;
  tmpDir: string;
  exec: Exec;
  fs: Fs;
}

/** Edge voices: Python stream when `pythonBin` is set, falling back to the CLI on failure or when absent. */
export function edge(o: EdgeOptions): Engine {
  const py = o.pythonBin ? edgePython({ pythonBin: o.pythonBin, tmpDir: o.tmpDir, exec: o.exec, fs: o.fs }) : undefined;
  const cli = edgeCli({ bin: o.cliBin, tmpDir: o.tmpDir, exec: o.exec, fs: o.fs });
  return {
    name: "edge-tts",
    async synthesize(req) {
      if (!py) return cli.synthesize(req);
      try { return await py.synthesize(req); } catch (e) {
        if (isTransient(e)) throw e; // let the retry layer handle 403/NoAudioReceived with backoff + voice fallback
        return cli.synthesize(req);
      }
    },
  };
}

/** edge-tts's known transient failures (service 403, handshake, no audio). */
export function isTransient(e: unknown): boolean {
  return /403|NoAudioReceived|WSServerHandshake|ECONNRESET|ETIMEDOUT|Connection closed/i.test(String((e as Error)?.message ?? e));
}

export interface PiperOptions {
  bin?: string; // "piper"
  /** Path to the .onnx voice model (e.g. ne_NP-google-medium.onnx). */
  model: string;
  tmpDir: string;
  exec: Exec;
  fs: Fs;
  /** Piper length_scale (1 = normal; >1 slower). Derived from rate when omitted. */
  lengthScale?: number;
}

/** Piper (rhasspy) offline voices — WAV out, no word timings (speakable estimates are scaled to the real duration). */
export function piper(o: PiperOptions): Engine {
  return {
    name: "piper",
    async synthesize(req) {
      const out = `${o.tmpDir}/${Math.random().toString(36).slice(2)}.wav`;
      await o.fs.mkdir(o.tmpDir);
      const ls = o.lengthScale ?? (req.rate ? 1 / req.rate : 1);
      const r = await o.exec(o.bin ?? "piper", ["--model", o.model, "--output_file", out, "--length_scale", String(ls)], req.text);
      if (r.code !== 0) throw new Error(`piper exited ${r.code}: ${r.stderr.slice(-500)}`);
      return { audio: await o.fs.readFile(out), format: "wav" };
    },
  };
}

/** Bring your own engine (Azure/Google/OpenAI via your own fetch + keys, or an in-process model). */
export function custom(name: string, synthesize: Engine["synthesize"]): Engine {
  return { name, synthesize };
}
