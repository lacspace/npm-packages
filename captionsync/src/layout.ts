import { Canvas, Cue, CueLine, Layout, LayoutOptions, TimedSegment, TimedWord } from "./types.js";

/** Rough glyph advance (em) — Devanagari runs wider than Latin at the same point size; matras combine. */
export function estimateWidth(text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0)!;
    if (cp >= 0x0900 && cp <= 0x097f) w += (cp >= 0x093e && cp <= 0x094d) || cp <= 0x0903 || cp === 0x0962 || cp === 0x0963 ? 0.12 : 0.62;
    else if (/[A-Z0-9]/.test(ch)) w += 0.62;
    else if (/[ .,:;'|/\-।]/.test(ch)) w += 0.3;
    else w += 0.52;
  }
  return w * fontSize;
}

/** A word is atomic: we never break inside it, so conjuncts/matras can never split. */
function tokenize(seg: TimedSegment): TimedWord[] {
  if (seg.words?.length) return seg.words.filter((w) => w.text.trim());
  const words = seg.text.split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  // Distribute time by character weight when no word timings exist.
  const weights = words.map((w) => Math.max(1, [...w].length));
  const total = weights.reduce((a, b) => a + b, 0);
  const span = seg.endMs - seg.startMs;
  let t = seg.startMs;
  return words.map((text, i) => {
    const d = (span * weights[i]!) / total;
    const w = { text, startMs: Math.round(t), endMs: Math.round(t + d) };
    t += d;
    return w;
  });
}

const DEFAULT_BREAK_AFTER = ",।.;:?!—–";

/** Greedy line fill with look-back for a punctuation break and orphan avoidance. */
function fillLines(words: TimedWord[], maxPx: number, fontSize: number, maxLines: number, breakAfter: string): { lines: CueLine[]; rest: TimedWord[] } {
  const lines: CueLine[] = [];
  let i = 0;
  while (i < words.length && lines.length < maxLines) {
    let j = i, px = 0;
    while (j < words.length) {
      const add = estimateWidth(words[j]!.text, fontSize) + (j > i ? estimateWidth(" ", fontSize) : 0);
      if (px + add > maxPx && j > i) break;
      px += add;
      j++;
    }
    // Prefer to end the line after punctuation if one sits in the last ~40% of the line.
    if (j < words.length) {
      for (let k = j - 1; k > i + Math.floor((j - i) * 0.6); k--) {
        if (breakAfter.includes(words[k]!.text.slice(-1))) { j = k + 1; break; }
      }
    }
    lines.push({ words: words.slice(i, j), text: words.slice(i, j).map((w) => w.text).join(" ") });
    i = j;
  }
  // Orphan: a last line with a single short word → steal one from the previous line.
  const last = lines[lines.length - 1], prev = lines[lines.length - 2];
  if (last && prev && last.words.length === 1 && prev.words.length > 2 && estimateWidth(last.words[0]!.text, fontSize) < maxPx * 0.25) {
    const moved = prev.words.pop()!;
    last.words.unshift(moved);
    prev.text = prev.words.map((w) => w.text).join(" ");
    last.text = last.words.map((w) => w.text).join(" ");
  }
  return { lines, rest: words.slice(i) };
}

/**
 * Lay timed segments out as caption cues: ≤ maxLines per cue, each line fitting the safe width at
 * the chosen font size (auto-shrunk down to minFontSize before text is split further), never
 * breaking inside a word, preferring punctuation breaks, with cue-duration bounds and merging.
 */
export function layoutCaptions(segments: TimedSegment[], o: LayoutOptions): Layout {
  const canvas = o.canvas;
  const maxLines = o.maxLines ?? 2;
  const minCue = o.minCueMs ?? 1000, maxCue = o.maxCueMs ?? 5000;
  const breakAfter = o.breakAfter ?? DEFAULT_BREAK_AFTER;
  const availPx = canvas.width - canvas.safe.left - canvas.safe.right - Math.round(canvas.width * 0.04);
  const target = o.fontSize ?? Math.round(canvas.width * 0.06);
  const minFs = o.minFontSize ?? Math.round(target * 0.65);

  const all = segments.map(tokenize).filter((w) => w.length);
  // Choose the largest font size at which every segment can be shown in ≤ maxLines cues of sensible length.
  let fontSize = target;
  const cuesFor = (fs: number): Cue[] => {
    const cues: Cue[] = [];
    for (const words of all) {
      let rest = words;
      while (rest.length) {
        const { lines, rest: r } = fillLines(rest, availPx, fs, maxLines, breakAfter);
        if (!lines.length) break;
        const cueWords = lines.flatMap((l) => l.words);
        cues.push({ index: 0, startMs: cueWords[0]!.startMs, endMs: cueWords[cueWords.length - 1]!.endMs, lines, text: lines.map((l) => l.text).join("\n") });
        rest = r;
      }
    }
    return cues;
  };
  let cues = cuesFor(fontSize);
  // Shrink while any single word is wider than the line (can't be broken) or cues are too short/choppy.
  const tooWide = (fs: number) => all.some((ws) => ws.some((w) => estimateWidth(w.text, fs) > availPx));
  while (fontSize > minFs && tooWide(fontSize)) fontSize -= 2;
  cues = cuesFor(fontSize);

  // Duration bounds: extend short cues into the following gap; split none (already by lines); merge tiny gaps.
  const mergeGap = o.mergeGapMs ?? 120;
  const out: Cue[] = [];
  for (const c of cues) {
    const prev = out[out.length - 1];
    if (prev && c.startMs - prev.endMs < mergeGap) prev.endMs = c.startMs; // butt-join, no flicker
    out.push({ ...c });
  }
  for (let i = 0; i < out.length; i++) {
    const c = out[i]!, next = out[i + 1];
    if (c.endMs - c.startMs < minCue) c.endMs = next ? Math.min(c.startMs + minCue, next.startMs) : c.startMs + minCue;
    if (c.endMs - c.startMs > maxCue) c.endMs = c.startMs + maxCue;
    c.index = i + 1;
  }
  const widestPx = Math.max(0, ...out.flatMap((c) => c.lines.map((l) => estimateWidth(l.text, fontSize))));
  return { cues: out, fontSize, maxCharsPerLine: Math.floor(availPx / (fontSize * 0.55)), position: o.position ?? "bottom", canvas, widestPx };
}

/** Preset canvases (mirror @lacspace/montage safe areas). */
export const CANVASES: Record<string, Canvas> = {
  reels: { width: 1080, height: 1920, safe: { top: 220, bottom: 380, left: 60, right: 180 } },
  tiktok: { width: 1080, height: 1920, safe: { top: 160, bottom: 440, left: 40, right: 200 } },
  shorts: { width: 1080, height: 1920, safe: { top: 160, bottom: 380, left: 40, right: 150 } },
  "fb-feed": { width: 1080, height: 1350, safe: { top: 90, bottom: 120, left: 60, right: 60 } },
  square: { width: 1080, height: 1080, safe: { top: 80, bottom: 100, left: 60, right: 60 } },
  youtube: { width: 1920, height: 1080, safe: { top: 60, bottom: 90, left: 80, right: 80 } },
  landscape: { width: 1920, height: 1080, safe: { top: 60, bottom: 90, left: 80, right: 80 } },
};
