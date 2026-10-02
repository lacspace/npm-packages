# @lacspace/captionsync

**Platform-safe burn-in captions from word or sentence timings — Devanagari-safe, two lines max, auto-fit, karaoke-ready.** Emits ASS (libass shapes Devanagari with HarfBuzz, which ffmpeg's `drawtext` does not), SRT, VTT, the ffmpeg filter string and a `@lacspace/montage` drawtext fallback.

```bash
npm i @lacspace/captionsync
```

```ts
import { captions, fromSpeakable } from "@lacspace/captionsync";

// word timings from @lacspace/speakable (originalWordTimings) or any [{ text, startMs, endMs }]
const segs = fromSpeakable(originalWordTimings);
const r = captions(segs, {
  canvas: "reels",              // reels | tiktok | shorts | fb-feed | square | youtube | landscape | { width, height, safe }
  fontName: "Mukta", karaoke: "fill", style: "box", position: "bottom",
  assPath: "/tmp/story.ass", fontsDir: "/fonts",
});
r.ass          // write this file, then:
r.filter       // "subtitles='/tmp/story.ass':fontsdir='/fonts'"  → montage spec.ass or your own -vf
r.srt, r.vtt   // for uploads / players
r.montageCaptions  // drawtext fallback when ffmpeg lacks libass
r.stats        // { cues, fontSize, maxLines, longestLinePx, durationMs }
```

## What the layout guarantees

- **Never breaks inside a word.** Lines are built from whole words, so conjuncts (`क्ष`, `ज्ञ`, `श्र`) and matras can never be split across lines.
- **≤ 2 lines per cue** (configurable); long sentences become several contiguous cues.
- **Fits the platform's safe area.** Line width is estimated per script (Devanagari runs wider; matras combine) against the canvas minus the platform's UI insets (Reels right rail, TikTok caption band, Shorts…).
- **Auto font-size.** Starts at 6 % of the canvas width (≈ 64 px at 1080) and shrinks (down to `minFontSize`) when a single word can't fit; otherwise text is re-flowed, not shrunk.
- **Punctuation-aware breaks** (`, । . ; : ? ! —`) within the last 40 % of a line; **no one-word orphan** on the second line.
- **Cue timing**: 1–5 s bounds, tiny gaps butt-joined so captions don't flicker, timings inherited from words (or distributed by character weight when only sentence times exist).
- **Karaoke**: `karaoke: "fill"` emits `\kf` sweeps per word (silent gaps respected), `"word"` emits `\k` pops; the highlight colour is `highlightColor`.

## ASS details

`PlayResX/Y` = canvas, margins = safe area, alignment centred at `position`, `BorderStyle 3` box (or `1` outline), `ScaledBorderAndShadow`, `\fad` in/out. Burn it with ffmpeg built with libass (`subtitles=` filter) and pass a `fontsdir` containing Mukta / Noto Sans Devanagari — `@lacspace/montage` ≥ 1.1 accepts `spec.ass = { file, fontsDir }` and renders it inside the same graph (also per cut in `buildMultiCut`).

`describe()` returns the command schema for an AI conductor. Zero dependencies.

## Licence
[Lacspace Free Licence v1.0](https://developer.lacspace.com/licenses/lacspace-free-1.0) — free for personal and commercial use.
