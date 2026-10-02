# @lacspace/audiomix

**Mix a voiceover with a music bed the way a newsroom should — ducked, loud-normalized, and licence-clean.** Builds the ffmpeg command to sidechain-duck music under narration, drop SFX stings, and normalize to **-14 LUFS**; loads a **licensed** music library (every track must carry a licence sidecar, and you get the credit line back); and detects tempo/beats deterministically for beat-synced cuts. No copyrighted platform music, ever.

```bash
npm i @lacspace/audiomix   # needs ffmpeg on the server
```

```ts
import { loadLibrary, pickTrack, buildMix, detectTempo, extractPcm } from "@lacspace/audiomix";

const library = await loadLibrary("/srv/music");       // only tracks with a licence sidecar
const bed = pickTrack(library, { mood: "calm", minDuration: 60 });

const { args, attribution } = buildMix({
  voice: "narration.wav",
  music: bed,                 // ducked under the voice
  stings: [{ src: "sfx/whoosh.wav", at: 0.0, attribution: "Whoosh — CC0" }],
  output: "mix.m4a",
});
// run ffmpeg with `args`, then print `attribution` under the video:
// → ["Music: Sunrise by Kevin MacLeod (incompetech.com) — Licensed under CC BY 4.0", "Whoosh — CC0"]

// beat-synced cuts for @lacspace/montage:
const { samples, sampleRate } = await extractPcm("narration.wav");
const { bpm, beats } = detectTempo(samples, sampleRate);
```

## Why

Ducking, loudness and attribution done by hand (or by LLM) every time is slow and risky. This bakes the house sound once and guarantees the credit line — and it will only ever touch tracks that carry a licence.

## API

### Licensed library
- **`loadLibrary(dir)`** (Node) — scans a folder for audio files, and for each one reads a licence sidecar (`track.license.json`, `track.license.txt`, `track.mp3.LICENSE`, or `track.json`). **A file with no sidecar is skipped** — the library is licence-clean by construction. Ship your CC-BY beds (e.g. Kevin MacLeod) and your own SFX, each with its licence.
- **`parseLicence(raw)`** — JSON or `Key: value` text → `{ licence, mood?, bpm?, duration?, tags? }`. Infers mood from words (urgent→breaking, upbeat→energetic, ambient→calm).
- **`buildAttribution(fields)`** — one-line credit; special-cases Kevin MacLeod / incompetech.
- **`pickTrack(tracks, { mood?, minDuration?, rotate? })`** — deterministic choice (no RNG); `rotate` cycles through matches across stories.

### Mixing
- **`buildMix(spec)`** → `{ args, filter, attribution }` — pure. `spec`: `voice`, `music?`, `stings?`, `output`, `targetLUFS` (default -14), `truePeak` (default -1.5), `musicGainDb` (default -9), `duckDb` (default -12). Music is ducked under the voice with `sidechaincompress`, stings are placed with `adelay`, everything is mixed and run through `loudnorm`. `attribution` collects every licensed asset's credit, de-duplicated.
- **`runMix(spec, options?)`** (Node) — builds and runs ffmpeg under `nice` + `ulimit -c 0`.

### Free music finder (Jamendo)
- **`searchFreeMusic(clientId, options?)`** / **`trendingFreeMusic(clientId, options?)`** → `{ tracks, warnings }` — search the **Jamendo** Creative-Commons catalog (hundreds of thousands of tracks) and get back the same `Track` shape as the local library, each with its CC licence and a ready attribution line. `options`: `query`, `mood`, `minDuration`/`maxDuration`, `order` (`trending` | `trending_month` | `popular` | `newest` | `relevance`), `limit`, `downloadableOnly` (default true), and an injectable `fetch`. The returned `track.path` is a direct audio URL that ffmpeg (and `buildMix`) reads straight away.

```ts
import { trendingFreeMusic, buildMix } from "@lacspace/audiomix";
const { tracks } = await trendingFreeMusic(process.env.JAMENDO_CLIENT_ID!, { mood: "energetic", minDuration: 60 });
const { args, attribution } = buildMix({ voice: "vo.wav", music: tracks[0], output: "mix.m4a" });
```

> **Why not TikTok/Reels/YouTube "trending sounds"?** Those catalogs are licensed **only inside each platform's own editor**. Bake one into an MP4 and upload it via the API and it gets **Content-ID-claimed** — muted, demonetized, or a strike on the account. For an automated pipeline, use free/CC sources like the above (Jamendo's popularity ordering is the safe analogue to "trending"), or the platforms' own *free* audio libraries. This package only surfaces licence-clean tracks.

### Tempo / beats
- **`detectTempo(samples, sampleRate, options?)`** → `{ bpm, beats, confidence }` — energy-onset autocorrelation with a perceptual tempo prior (resolves octave errors). Pure; feed it mono PCM.
- **`extractPcm(file, options?)`** (Node) — decode a file to mono float PCM via ffmpeg for `detectTempo`.
- **`snapToBeats(cutTimes, beats)`** — snap montage cut points to the nearest beat.

## Licensing stance
This package **only** uses files you pass it, and `loadLibrary` **only** surfaces tracks that carry a licence file — so copyrighted platform music can't slip in. You are responsible for the licences of the files you supply; `attribution` gives you the credit line to display.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
