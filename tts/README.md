# @lacspace/tts

**Engine-agnostic text-to-speech pipeline for Nepali and English newsrooms.** `@lacspace/speakable` normalisation in → edge-tts (Python stream or CLI), Piper, or your own engine → audio **plus word timings aligned back to the original text**, ready for `@lacspace/captionsync`. Retries edge-tts's transient failures with backoff and a voice fallback ladder; caches by content hash. Bring your own engine binary — no bundled keys.

```bash
npm i @lacspace/tts
# plus one engine: pip install edge-tts   |   piper + a voice .onnx   |   your own
```

```ts
import { createTts, edge, nodeExec, nodeFs } from "@lacspace/tts";

const tts = createTts({
  engine: edge({ pythonBin: "/srv/venv/bin/python", cliBin: "/srv/venv/bin/edge-tts", tmpDir: "/tmp/tts", exec: await nodeExec(), fs: await nodeFs() }),
  voices: { ne: "ne-NP-HemkalaNeural", en: "en-IN-NeerjaNeural" },
  rate: 0.95, cacheDir: "/var/cache/tts",
  speak: { pronunciations: { Lamichhane: { ne: "लामिछाने" } } },
  retry: { attempts: 3, backoffMs: 500, fallbackVoices: { ne: ["ne-NP-SagarNeural"] } },
});

const r = await tts.speakToCaptions("आगामी मङ्सिर १ गतेदेखि रु. १ लाख ५० हजार खर्च हुनेछ।");
r.audio        // mp3 bytes            r.durationMs   // from the MP3 frames (no ffprobe needed)
r.segments     // captionsync TimedSegment[] — ORIGINAL words ("रु. १ लाख ५० हजार") with engine timings
r.timing       // "engine" (WordBoundary) | "estimated" (speakable estimate scaled to the real duration)
r.voice        // the voice that actually produced it (after any fallback)
```

## Engines

- **`edge({ pythonBin?, cliBin?, tmpDir, exec, fs })`** — with `pythonBin`, runs an inline `edge_tts.Communicate(text, voice, rate, pitch, boundary="WordBoundary")` stream (exact offsets, the shape `{ text, offsetMs, durationMs }`); non-transient failure (no module, bad python) falls back to the CLI `--write-media … --write-subtitles … --words-in-cue 1` path. Rate 0.9 → `-10%`, pitch 5 → `+5Hz`.
- **`edgePython(...)`** / **`edgeCli(...)`** — the two paths individually.
- **`piper({ model, tmpDir, exec, fs, lengthScale? })`** — offline WAV; no word timings, so speakable's estimates are scaled to the real WAV duration.
- **`custom(name, synthesize)`** — Azure/Google/OpenAI with your own fetch and keys, or an in-process model. Return `{ audio, format, boundaries? }`.

`exec`/`fs` are injectable (see `nodeExec()` / `nodeFs()`), so the whole pipeline is unit-testable without binaries.

## Retry + fallback

Errors matching 403 / `NoAudioReceived` / handshake / connection resets are retried `attempts` times with exponential backoff, then the same ladder runs on each fallback voice (`ne`: Sagar → hi-IN Swara; `en`: en-IN Neerja → en-US Jenny by default). Anything else throws immediately.

## Timings

- `boundaries` — engine WordBoundary events when available.
- `aligned` / `words` — `@lacspace/speakable`'s `alignWordBoundaries` + `originalWordTimings`: every **original** token (e.g. `रु. १ लाख`) gets the span of its spoken words (`एक लाख रुपैयाँ`), so captions show the editor's text and never drift.
- `segments` — sentence-level with word timings; pass straight to `captions(segments, { canvas: "reels", karaoke: "fill" })`.
- `durationMs` — read from the WAV header or by walking MP3 frames (zero deps).

`VOICES` lists Edge and Piper voices with language/gender; `describe()` returns the command schema for an AI conductor.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
