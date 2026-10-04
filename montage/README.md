# @lacspace/montage

**Turn a list of clips and stills into a platform-ready social video — deterministically.** A timeline compiler that builds the exact ffmpeg command for a montage: scale-to-cover per platform preset, Ken Burns on stills, beat-friendly transitions, Devanagari-shaped kinetic captions, lower-thirds, a logo bug and a progress bar. It builds the command (pure, testable); you run it, or let the built-in runner spawn ffmpeg under `nice` with a thread cap.

```bash
npm i @lacspace/montage   # needs ffmpeg on the server (built with libx264, freetype, libharfbuzz)
```

```ts
import { buildMontage, runMontage } from "@lacspace/montage";

const spec = {
  preset: "reels",                    // 1080×1920 with Reels safe areas
  fontFile: "/fonts/NotoSansDevanagari-Bold.ttf", // correct conjunct/matra shaping
  segments: [
    { kind: "still", src: "cover.jpg", duration: 3, kenBurns: "in" },
    { kind: "clip",  src: "broll.mp4", duration: 5 },
  ],
  transitions: { type: "crossfade", duration: 0.5 },
  captions: [{ text: "आज काठमाडौंमा…", start: 0, end: 3, position: "bottom" }],
  lowerThirds: [{ title: "काठमाडौं", subtitle: "संवाददाता", start: 3.5, end: 7 }],
  logo: { src: "bug.png", corner: "top-right", width: 120 },
  progressBar: true,
  audio: "mix.m4a",                   // optional, e.g. from @lacspace/audiomix
  output: "reel.mp4",
};

const { args, filter, duration } = buildMontage(spec); // pure — runs nothing
// → feed `args` to ffmpeg yourself, or:
await runMontage(spec, { niceLevel: 15, threads: 2 });  // spawns ffmpeg under nice, ulimit -c 0
```

## Why

Driving ffmpeg by hand (or by LLM) for every reel is error-prone and burns tokens. This encodes the house style once: give it segments + captions and it emits a correct, low-CPU ffmpeg command every time.

## Presets

`reels` · `tiktok` · `shorts` (1080×1920) · `fb-feed` (1080×1350) · `fb-square`/`square` (1080×1080) · `youtube`/`landscape` (1920×1080). Each carries a conservative **safe area** so captions and lower-thirds clear the platform's own UI. Pass your own `PresetInfo` to override.

## API

### `buildMontage(spec, options?)` → `{ args, filter, width, height, fps, duration }`
Pure and deterministic — it never touches the filesystem or spawns anything. `args` is the full ffmpeg argument vector; `filter` is the `-filter_complex` graph (handy for tests).

- **segments** — `{ kind: "clip", src, start?, duration }` or `{ kind: "still", src, duration, kenBurns?: "in"|"out"|"none" }`. Clips are scaled-to-cover and cropped to the canvas; stills get a `zoompan` Ken Burns move.
- **transitions** — one `{ type, duration? }` applied between every pair, or an array (one per gap). Types: `crossfade`, `slide`, `zoom-punch`, `whip` (mapped to ffmpeg `xfade` transitions). Offsets and total duration account for the overlaps.
- **captions** — `drawtext` with your `fontFile`. Give it a **Devanagari-capable font (Mukta / Noto Sans Devanagari)** and an ffmpeg built with libharfbuzz for correct conjunct/matra shaping. `kinetic` (default on) fades + slides the text up on entry; `position` top/center/bottom respects the safe area.
- **lowerThirds**, **logo** (corner + width, pinned inside the safe area), **progressBar** (animated bottom bar).
- **audio** — a pre-mixed track (e.g. from `@lacspace/audiomix`); muxed as AAC with `-shortest`. No audio → silent.

### `runMontage(spec, options?)` → `Promise<RunResult>` (Node only)
Builds, then spawns ffmpeg under **`nice`** (default level 15) with **`ulimit -c 0`** and an encoder **thread cap** (default 2) so a render can't peg the box. `onLog` streams ffmpeg's progress lines. Rejects with ffmpeg's tail on a non-zero exit.

### Build options
`ffmpegPath`, `encodePreset` (default `veryfast`), `crf` (default 20), `threads` (default 2).

## Notes
- **Bring your own ffmpeg** — this package emits/drives commands; it bundles no binary. The build must include `libx264`, `freetype` and (for Devanagari) `libharfbuzz`.
- Deterministic and isomorphic for `buildMontage`; `runMontage` is Node-only (dynamically imports `child_process`).

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.

## 1.1 — render budget tools

- **`plan(spec, { quality?, cuts?, machineFactor? })`** → `{ frames, filters, units, estimatedSeconds, breakdown:{decode,kenBurns,transitions,text,encode}, suggestions:[{change, estimatedSeconds}] }`. Estimate before rendering; pick a preset that fits your budget. Calibrate once: `machineFactor = calibrate(plan, measuredSeconds)`.
- **`quality: "fast"`** in `BuildOptions` → `ultrafast`, crf 23, 24 fps default, 1.5× Ken Burns oversample (Ken Burns step scales with fps so the move looks the same).
- **`prepareRenditions(spec, { outDir, height: 720 })`** → `{ jobs:[{src,out,args}], renditions }` — pre-encode each distinct clip once to a 720p mezzanine (cacheable by source), then pass `renditions` to every later build.
- **`buildMultiCut(spec, cuts, options)`** — one ffmpeg process, N outputs: the decode + Ken Burns + xfade graph runs once, then `split` feeds per-cut canvas (`recanvas` scale/crop), captions (en/ne), lower-thirds, ASS, logo, audio track. `{ preset, output, captions?, lowerThirds?, ass?, logo?, audio?, progressBar? }` per cut.
- **`spec.ass = { file, fontsDir }`** — burn an ASS file from `@lacspace/captionsync` with libass (needs ffmpeg built with libass): correct Devanagari shaping, karaoke, 2-line safe-area captions.

## Text escaping (1.1.1)

`escapeDrawtext(text)` and `escapePath(path)` return values meant to sit **inside single quotes**: `text='…'` and `fontfile='…'`. They escape for all three levels ffmpeg parses: drawtext expansion (`\` and `%`), the option parser (`\`, `'` and `:`), and the filtergraph quotes. At the filtergraph level a literal `'` becomes `'\''`. Leading and trailing spaces are kept.

Before 1.1.1, any apostrophe ("Nepal's") broke the whole filtergraph. A test round-trips `' " : % \ , ; [ ]`, padding and Devanagari with `।` through a simulation of ffmpeg's parser. With `FFMPEG_DRAWTEXT` and `FONT_FILE` set, it also renders against a real ffmpeg and checks the frame is pixel-identical to the same text drawn from `textfile=`.
