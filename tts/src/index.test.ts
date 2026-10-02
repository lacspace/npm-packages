import { describe, expect, it } from "vitest";
import { createTts, custom, describe as describeApi, edgeCli, estimatedBoundaries, mp3Info, parseSrt, piper, wavInfo, VOICES } from "./index.js";
import type { Exec, Fs } from "./index.js";

/** In-memory fs + exec that fakes the CLIs. */
function fakeFs(): Fs & { files: Map<string, Uint8Array> } {
  const files = new Map<string, Uint8Array>();
  return {
    files,
    readFile: async (p) => { const f = files.get(p); if (!f) throw new Error("ENOENT " + p); return f; },
    writeFile: async (p, d) => { files.set(p, typeof d === "string" ? new TextEncoder().encode(d) : d); },
    exists: async (p) => files.has(p),
    mkdir: async () => {},
  };
}
/** A WAV of `ms` milliseconds (16 kHz mono 16-bit, silence). */
function wav(ms: number): Uint8Array {
  const sr = 16000, n = Math.round((sr * ms) / 1000), dataLen = n * 2;
  const b = new Uint8Array(44 + dataLen); const dv = new DataView(b.buffer);
  const w = (o: number, s: string) => [...s].forEach((c, i) => (b[o + i] = c.charCodeAt(0)));
  w(0, "RIFF"); dv.setUint32(4, 36 + dataLen, true); w(8, "WAVE"); w(12, "fmt "); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true); dv.setUint32(24, sr, true); dv.setUint32(28, sr * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, "data"); dv.setUint32(40, dataLen, true);
  return b;
}
/** MPEG1 Layer III 128 kbps 44.1 kHz CBR frames: 417 bytes, 1152 samples (26.12 ms) each. */
function mp3(frames: number): Uint8Array {
  const len = 417, b = new Uint8Array(10 + frames * len);
  b.set([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0]); // empty ID3v2
  for (let i = 0; i < frames; i++) { const o = 10 + i * len; b[o] = 0xff; b[o + 1] = 0xfb; b[o + 2] = 0x90; b[o + 3] = 0xc0; }
  return b;
}

describe("audio readers", () => {
  it("reads WAV and MP3 durations without deps; parses word SRT", () => {
    expect(wavInfo(wav(1500))!.durationMs).toBe(1500);
    expect(mp3Info(mp3(100))!.durationMs).toBe(2612);
    expect(mp3Info(mp3(100))!.sampleRate).toBe(44100);
    const cues = parseSrt("1\n00:00:00,160 --> 00:00:00,440\nकेन्द्र\n\n2\n00:00:00,550 --> 00:00:00,925\nप्रमुख\n");
    expect(cues).toEqual([{ startMs: 160, endMs: 440, text: "केन्द्र" }, { startMs: 550, endMs: 925, text: "प्रमुख" }]);
  });
});

describe("edge-tts CLI adapter", () => {
  it("passes normalised text + rate flags, reads media and word cues, aligns to original text", async () => {
    const fs = fakeFs();
    const calls: string[][] = [];
    const exec: Exec = async (cmd, args) => {
      calls.push([cmd, ...args]);
      const media = args[args.indexOf("--write-media") + 1]!, subs = args[args.indexOf("--write-subtitles") + 1]!;
      const text = args[args.indexOf("--text") + 1]!;
      const words = text.replace(/[।.,]/g, "").split(/\s+/);
      fs.files.set(media, mp3(words.length * 12)); // ~313 ms per word
      fs.files.set(subs, new TextEncoder().encode(words.map((w, i) => `${i + 1}\n00:00:0${Math.floor(i * 0.3)},${String(Math.round((i * 300) % 1000)).padStart(3, "0")} --> 00:00:0${Math.floor((i * 300 + 280) / 1000)},${String((i * 300 + 280) % 1000).padStart(3, "0")}\n${w}\n`).join("\n")));
      return { code: 0, stdout: "", stderr: "" };
    };
    const tts = createTts({ engine: edgeCli({ tmpDir: "/tmp/x", exec, fs }), voices: { ne: "ne-NP-HemkalaNeural" }, rate: 0.95, cacheDir: "/cache", fs });
    const r = await tts.speak("रु. १ लाख खर्च भयो।");
    expect(calls[0]![0]).toBe("edge-tts");
    expect(calls[0]).toContain("ne-NP-HemkalaNeural");
    expect(calls[0]![calls[0]!.indexOf("--rate") + 1]).toBe("-5%");
    expect(calls[0]![calls[0]!.indexOf("--text") + 1]).toBe("एक लाख रुपैयाँ खर्च भयो।");
    expect(r.format).toBe("mp3");
    expect(r.timing).toBe("engine");
    expect(r.boundaries!.length).toBe(5);
    expect(r.words[0]!.orig).toBe("रु. १ लाख"); // original span spans 3 spoken words
    expect(r.words[0]!.startMs).toBe(0);
    expect(r.words[0]!.endMs).toBe(880);
    expect(r.segments[0]!.text).toBe("रु. १ लाख खर्च भयो।");
    expect(r.durationMs).toBe(mp3Info(mp3(60))!.durationMs);
    // cache hit on the second call, no exec
    const r2 = await tts.speak("रु. १ लाख खर्च भयो।");
    expect(r2.cacheHit).toBe(true);
    expect(calls.length).toBe(1);
  });
});

describe("piper + custom + estimates", () => {
  it("piper gets stdin text and a WAV back; timings are speakable estimates scaled to the real duration", async () => {
    const fs = fakeFs();
    const exec: Exec = async (_cmd, args, input) => { fs.files.set(args[args.indexOf("--output_file") + 1]!, wav(3000)); expect(input).toContain("पन्ध्र"); return { code: 0, stdout: "", stderr: "" }; };
    const tts = createTts({ engine: piper({ model: "ne_NP-google-medium.onnx", tmpDir: "/tmp/p", exec, fs }) });
    const r = await tts.speak("१५ सदस्यीय टोली सार्वजनिक गरेको छ।", { lang: "ne" });
    expect(r.timing).toBe("estimated");
    expect(r.durationMs).toBe(3000);
    const last = r.words[r.words.length - 1]!;
    expect(last.endMs).toBeGreaterThan(2500);
    expect(last.endMs).toBeLessThanOrEqual(3000);
    expect(r.voice).toBe("ne_NP-google-medium");
  });
  it("custom engine + estimatedBoundaries + describe/voices", async () => {
    const tts = createTts({ engine: custom("mock", async () => ({ audio: wav(1000), format: "wav" })), voice: "x" });
    const r = await tts.speak("Hello world.", { lang: "en" });
    expect(r.durationMs).toBe(1000);
    expect(estimatedBoundaries(r.spoken, 1000).map((b) => b.text)).toEqual(["Hello", "world."]);
    expect(describeApi().voices).toContain("ne-NP-HemkalaNeural");
    expect(VOICES.find((v) => v.engine === "piper" && v.lang === "ne")).toBeDefined();
    expect(tts.voices().every((v) => v.engine === "edge")).toBe(true);
  });
});

describe("edge python stream (WeNepal's preferred path) + retry/fallback", () => {
  it("runs the inline Communicate script with text on stdin and uses exact WordBoundary offsets", async () => {
    const { edge, EDGE_PY_SCRIPT } = await import("./index.js");
    const fs = fakeFs();
    const calls: Array<{ cmd: string; args: string[]; input?: string }> = [];
    const exec: Exec = async (cmd, args, input) => {
      calls.push({ cmd, args, input });
      const out = args[args.length - 1]!;
      fs.files.set(out, mp3(40));
      return { code: 0, stdout: JSON.stringify({ boundaries: [{ text: "एक", offsetMs: 162.5, durationMs: 200 }, { text: "लाख", offsetMs: 400, durationMs: 300 }, { text: "रुपैयाँ", offsetMs: 750, durationMs: 400 }] }), stderr: "" };
    };
    const tts = createTts({ engine: edge({ pythonBin: "/venv/bin/python", cliBin: "/venv/bin/edge-tts", tmpDir: "/t", exec, fs }), voice: "ne-NP-HemkalaNeural", pitchHz: 5 });
    const r = await tts.speakToCaptions("रु. १ लाख");
    expect(calls[0]!.cmd).toBe("/venv/bin/python");
    expect(calls[0]!.args[0]).toBe("-c");
    expect(calls[0]!.args[1]).toBe(EDGE_PY_SCRIPT);
    expect(calls[0]!.args.slice(2, 5)).toEqual(["ne-NP-HemkalaNeural", "+0%", "+5Hz"]);
    expect(calls[0]!.input).toBe("एक लाख रुपैयाँ");
    expect(r.timing).toBe("engine");
    expect(r.words[0]).toMatchObject({ orig: "रु. १ लाख", startMs: 162.5, endMs: 1150 });
    expect(r.durationMs).toBe(mp3Info(mp3(40))!.durationMs);
  });
  it("retries transient 403/NoAudioReceived with backoff, then falls back to the next voice", async () => {
    const { edge } = await import("./index.js");
    const fs = fakeFs();
    const seen: string[] = [];
    const exec: Exec = async (_cmd, args) => {
      const voice = args[2]!; seen.push(voice);
      if (voice === "ne-NP-HemkalaNeural") return { code: 1, stdout: "", stderr: "edge_tts.exceptions.NoAudioReceived: No audio was received" };
      fs.files.set(args[args.length - 1]!, mp3(10));
      return { code: 0, stdout: JSON.stringify({ boundaries: [] }), stderr: "" };
    };
    const sleeps: number[] = [];
    const tts = createTts({ engine: edge({ pythonBin: "py", tmpDir: "/t", exec, fs }), voice: "ne-NP-HemkalaNeural", retry: { attempts: 3, backoffMs: 100, sleep: async (ms) => { sleeps.push(ms); } } });
    const r = await tts.speak("नमस्ते", { lang: "ne" });
    expect(seen).toEqual(["ne-NP-HemkalaNeural", "ne-NP-HemkalaNeural", "ne-NP-HemkalaNeural", "ne-NP-SagarNeural"]);
    expect(sleeps).toEqual([100, 200]);
    expect(r.voice).toBe("ne-NP-SagarNeural");
    expect(r.timing).toBe("estimated"); // engine gave no boundaries
  });
  it("non-transient python failure falls back to the CLI path", async () => {
    const { edge } = await import("./index.js");
    const fs = fakeFs();
    const cmds: string[] = [];
    const exec: Exec = async (cmd, args) => {
      cmds.push(cmd);
      if (cmd === "py") return { code: 1, stdout: "", stderr: "ModuleNotFoundError: No module named 'edge_tts'" };
      fs.files.set(args[args.indexOf("--write-media") + 1]!, mp3(10));
      return { code: 0, stdout: "", stderr: "" };
    };
    const tts = createTts({ engine: edge({ pythonBin: "py", cliBin: "edge-tts", tmpDir: "/t", exec, fs }), voice: "en-US-JennyNeural" });
    const r = await tts.speak("Hello", { lang: "en" });
    expect(cmds).toEqual(["py", "edge-tts"]);
    expect(r.format).toBe("mp3");
  });
});
