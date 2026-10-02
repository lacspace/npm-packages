import { alignWordBoundaries, originalWordTimings, speakable } from "@lacspace/speakable";
import type { AlignedSegment, SpeakableOptions, SpeakableResult, WordBoundary } from "@lacspace/speakable";
import { audioInfo } from "./audio.js";
import { Engine, Fs, isTransient, nodeFs } from "./engines.js";

export * from "./audio.js";
export * from "./engines.js";

const VERSION = "1.0.0";

export interface VoiceInfo {
  id: string;
  lang: "ne" | "en" | "hi";
  gender: "female" | "male";
  engine: "edge" | "piper";
  note?: string;
}

/** Known voices for Nepali newsrooms (Edge neural + Piper offline), with sensible fallbacks. */
export const VOICES: VoiceInfo[] = [
  { id: "ne-NP-HemkalaNeural", lang: "ne", gender: "female", engine: "edge", note: "default Nepali" },
  { id: "ne-NP-SagarNeural", lang: "ne", gender: "male", engine: "edge" },
  { id: "hi-IN-SwaraNeural", lang: "hi", gender: "female", engine: "edge", note: "Hindi fallback, reads Devanagari" },
  { id: "hi-IN-MadhurNeural", lang: "hi", gender: "male", engine: "edge" },
  { id: "en-IN-NeerjaNeural", lang: "en", gender: "female", engine: "edge", note: "Indian English, good with Nepali names" },
  { id: "en-IN-PrabhatNeural", lang: "en", gender: "male", engine: "edge" },
  { id: "en-US-JennyNeural", lang: "en", gender: "female", engine: "edge" },
  { id: "en-GB-RyanNeural", lang: "en", gender: "male", engine: "edge" },
  { id: "ne_NP-google-medium", lang: "ne", gender: "female", engine: "piper", note: "offline; rhasspy/piper-voices ne_NP" },
  { id: "en_US-lessac-medium", lang: "en", gender: "female", engine: "piper" },
];

export interface TtsOptions {
  engine: Engine;
  /** Default voice id (e.g. "ne-NP-HemkalaNeural"). */
  voice?: string;
  /** Per-language voices; picked by speakable's detected lang when `voice` isn't given. */
  voices?: { ne?: string; en?: string };
  rate?: number;
  pitchHz?: number;
  /** Directory for a content-hash cache of audio + timings (optional). */
  cacheDir?: string;
  fs?: Fs;
  /** speakable defaults (pronunciations, acronyms, …) applied to every call. */
  speak?: Omit<SpeakableOptions, "lang">;
  /** Retry transient engine failures (edge-tts 403 / NoAudioReceived). Default 3 attempts, 500 ms backoff ×2, then fallback voices. */
  retry?: { attempts?: number; backoffMs?: number; fallbackVoices?: Partial<Record<"ne" | "en", string[]>>; sleep?: (ms: number) => Promise<void> };
}

export interface SpeakResult {
  audio: Uint8Array;
  format: string;
  durationMs: number;
  /** speakable output (spoken text, SSML, segments, tokens). */
  spoken: SpeakableResult;
  /** Engine-native word boundaries when available. */
  boundaries?: WordBoundary[];
  /** Whether timings are engine-native ("engine") or speakable estimates scaled to the audio ("estimated"). */
  timing: "engine" | "estimated";
  aligned: AlignedSegment[];
  /** One entry per ORIGINAL token — feed @lacspace/captionsync fromSpeakable(). */
  words: ReturnType<typeof originalWordTimings>;
  /** captionsync-ready sentence segments with word timings. */
  segments: Array<{ text: string; startMs: number; endMs: number; words: Array<{ text: string; startMs: number; endMs: number }> }>;
  voice: string;
  cacheHit: boolean;
}

async function sha256(s: string): Promise<string> {
  const data = new TextEncoder().encode(s);
  const subtle = (globalThis as any).crypto?.subtle;
  if (subtle) {
    const h = await subtle.digest("SHA-256", data);
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  const { createHash } = await import("node:crypto");
  return createHash("sha256").update(data).digest("hex");
}

/** Scale speakable's estimated per-segment word timings so the whole thing spans the real audio. */
export function estimatedBoundaries(spoken: SpeakableResult, durationMs: number): WordBoundary[] {
  const est = spoken.estimatedDurationMs || 1;
  const k = durationMs > 0 ? durationMs / est : 1;
  const out: WordBoundary[] = [];
  let base = 0;
  for (const s of spoken.segments) {
    for (const w of s.words) out.push({ text: w.word, offsetMs: Math.round((base + w.startMs) * k), durationMs: Math.max(1, Math.round((w.endMs - w.startMs) * k)) });
    base += s.durationMs + s.pauseAfter;
  }
  return out;
}

/** Build a TTS pipeline: speakable normalisation → engine → timings aligned back to the original text. */
export function createTts(o: TtsOptions) {
  let fsp: Promise<Fs> | undefined;
  const getFs = () => (fsp ??= o.fs ? Promise.resolve(o.fs) : nodeFs());

  async function speak(text: string, opts: SpeakableOptions & { voice?: string; rate?: number; pitchHz?: number } = {}): Promise<SpeakResult> {
    const spoken = speakable(text, { ...o.speak, ...opts });
    const voice = opts.voice ?? o.voice ?? o.voices?.[spoken.lang] ?? VOICES.find((v) => v.lang === spoken.lang && v.engine === (o.engine.name === "piper" ? "piper" : "edge"))!.id;
    const rate = opts.rate ?? o.rate, pitchHz = opts.pitchHz ?? o.pitchHz;
    const key = await sha256(JSON.stringify([o.engine.name, voice, rate ?? 1, pitchHz ?? 0, spoken.text]));
    let audio: Uint8Array | undefined, format = "unknown", boundaries: WordBoundary[] | undefined, cacheHit = false;
    if (o.cacheDir) {
      const fs = await getFs();
      const meta = `${o.cacheDir}/${key}.json`;
      if (await fs.exists(meta)) {
        const m = JSON.parse(new TextDecoder().decode(await fs.readFile(meta))) as { format: string; boundaries?: WordBoundary[] };
        audio = await fs.readFile(`${o.cacheDir}/${key}.${m.format}`);
        format = m.format; boundaries = m.boundaries; cacheHit = true;
      }
    }
    let usedVoice = voice;
    if (!audio) {
      const r = await withRetry(o, spoken.lang, voice, (v) => o.engine.synthesize({ text: spoken.text, ssml: spoken.ssml, voice: v, rate, pitchHz, lang: spoken.lang }));
      audio = r.result.audio; format = r.result.format; boundaries = r.result.boundaries; usedVoice = r.voice;
      if (o.cacheDir) {
        const fs = await getFs();
        await fs.mkdir(o.cacheDir);
        await fs.writeFile(`${o.cacheDir}/${key}.${format}`, audio);
        await fs.writeFile(`${o.cacheDir}/${key}.json`, JSON.stringify({ format, boundaries }));
      }
    }
    const info = audioInfo(audio);
    const durationMs = info.durationMs || (boundaries?.length ? Math.max(...boundaries.map((b) => b.offsetMs + b.durationMs)) : spoken.estimatedDurationMs);
    const timing: SpeakResult["timing"] = boundaries?.length ? "engine" : "estimated";
    const events = boundaries?.length ? boundaries : estimatedBoundaries(spoken, durationMs);
    const aligned = alignWordBoundaries(spoken.tokens, spoken.segments, events);
    const words = originalWordTimings(aligned);
    const segments = aligned.filter((s) => s.words.length).map((s) => {
      const ws = words.filter((w) => w.segment === s.index);
      return { text: ws.map((w) => w.orig).join(" "), startMs: ws[0]!.startMs, endMs: ws[ws.length - 1]!.endMs, words: ws.map((w) => ({ text: w.orig, startMs: w.startMs, endMs: w.endMs })) };
    });
    return { audio, format, durationMs, spoken, boundaries, timing, aligned, words, segments, voice: usedVoice, cacheHit };
  }

  /** speak() plus the fields a caption/video step needs, under their captionsync names. */
  async function speakToCaptions(text: string, opts: Parameters<typeof speak>[1] = {}) {
    const r = await speak(text, opts);
    return { audio: r.audio, format: r.format, durationMs: r.durationMs, segments: r.segments, words: r.words, timing: r.timing, voice: r.voice, spokenText: r.spoken.text, cacheHit: r.cacheHit };
  }

  return { speak, speakToCaptions, voices: () => VOICES.filter((v) => v.engine === (o.engine.name === "piper" ? "piper" : "edge")), engine: o.engine };
}

const DEFAULT_FALLBACKS: Record<"ne" | "en", string[]> = { ne: ["ne-NP-SagarNeural", "hi-IN-SwaraNeural"], en: ["en-IN-NeerjaNeural", "en-US-JennyNeural"] };

/** Attempts × backoff on transient errors, then the same ladder on each fallback voice. */
async function withRetry<T>(o: TtsOptions, lang: "ne" | "en", voice: string, fn: (voice: string) => Promise<T>): Promise<{ result: T; voice: string }> {
  const attempts = o.retry?.attempts ?? 3, backoff = o.retry?.backoffMs ?? 500;
  const sleep = o.retry?.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const ladder = [voice, ...(o.retry?.fallbackVoices?.[lang] ?? DEFAULT_FALLBACKS[lang]).filter((v) => v !== voice)];
  let lastErr: unknown;
  for (const v of ladder) {
    for (let i = 0; i < attempts; i++) {
      try { return { result: await fn(v), voice: v }; } catch (e) {
        lastErr = e;
        if (!isTransient(e)) throw e;
        if (i < attempts - 1) await sleep(backoff * 2 ** i);
      }
    }
  }
  throw lastErr;
}

/** Machine-readable descriptor for an AI "conductor". */
export function describe() {
  return {
    name: "@lacspace/tts",
    version: VERSION,
    summary: "Engine-agnostic TTS pipeline for Nepali/English newsrooms: speakable normalisation → edge-tts CLI / Piper / custom engine → audio + word timings aligned back to the ORIGINAL text (engine WordBoundary or estimates scaled to the real duration), captionsync-ready segments, voice registry, content-hash cache.",
    voices: VOICES.map((v) => v.id),
    commands: [
      { name: "speak", input: { type: "object", properties: { text: { type: "string" }, voice: { type: "string" }, lang: { enum: ["ne", "en", "auto"] }, rate: { type: "number" }, pitchHz: { type: "number" }, pronunciations: { type: "object" } }, required: ["text"] }, output: "{ audio, format, durationMs, spoken, boundaries?, timing, aligned, words, segments, voice, cacheHit }" },
      { name: "voices", input: { type: "object", properties: {} }, output: "VoiceInfo[]" },
    ],
  };
}
