import { Segment, Token } from "./segment.js";

/** A word-boundary event from an engine (edge-tts WordBoundary: text, offset, duration in ms). */
export interface WordBoundary {
  text: string;
  offsetMs: number;
  durationMs: number;
}

export interface AlignedWord {
  /** Original text span this spoken word came from. */
  orig: string;
  origStart: number;
  origEnd: number;
  spoken: string;
  startMs: number;
  endMs: number;
  segment: number;
}

export interface AlignedSegment {
  index: number;
  orig: string;
  text: string;
  startMs: number;
  endMs: number;
  words: AlignedWord[];
}

const strip = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * Snap engine word boundaries onto the spoken words, then map each spoken word back to the
 * ORIGINAL text span (so captions show "रु. १ लाख" while the voice says "एक लाख रुपैयाँ").
 * Robust to engines that split/merge differently: unmatched spoken words inherit the timing
 * of their neighbours; unmatched engine words are skipped.
 */
export function alignWordBoundaries(tokens: Token[], segments: Segment[], boundaries: WordBoundary[]): AlignedSegment[] {
  const spoken: Array<{ word: string; seg: number; tokenIndex: number; startMs?: number; endMs?: number }> = [];
  segments.forEach((s, si) => s.words.forEach((w) => spoken.push({ word: w.word, seg: si, tokenIndex: w.tokenIndex })));
  const events = boundaries.filter((b) => strip(b.text)).map((b) => ({ key: strip(b.text), start: b.offsetMs, end: b.offsetMs + b.durationMs }));

  // Greedy monotone matching with a small look-ahead window on both sides.
  let ei = 0;
  for (let si = 0; si < spoken.length && ei < events.length; si++) {
    const key = strip(spoken[si]!.word);
    if (!key) continue;
    let found = -1;
    for (let k = ei; k < Math.min(events.length, ei + 4); k++) {
      const ek = events[k]!.key;
      if (ek === key || ek.startsWith(key) || key.startsWith(ek)) { found = k; break; }
    }
    if (found === -1) {
      // Maybe the engine merged this and the next spoken word ("twenty-six" vs "twenty six").
      const merged = key + strip(spoken[si + 1]?.word ?? "");
      const k = events.findIndex((e, idx) => idx >= ei && idx < ei + 4 && e.key === merged);
      if (k !== -1 && spoken[si + 1]) {
        const mid = events[k]!.start + (events[k]!.end - events[k]!.start) / 2;
        spoken[si]!.startMs = events[k]!.start; spoken[si]!.endMs = mid;
        spoken[si + 1]!.startMs = mid; spoken[si + 1]!.endMs = events[k]!.end;
        ei = k + 1; si++;
      }
      continue;
    }
    spoken[si]!.startMs = events[found]!.start;
    spoken[si]!.endMs = events[found]!.end;
    ei = found + 1;
  }
  // Fill gaps by interpolation between neighbours (or estimates when at the edges).
  let lastEnd = 0;
  for (let i = 0; i < spoken.length; i++) {
    const w = spoken[i]!;
    if (w.startMs === undefined) {
      const next = spoken.slice(i + 1).find((x) => x.startMs !== undefined);
      const est = segments[w.seg]!.words.find((x) => x.word === w.word && x.tokenIndex === w.tokenIndex);
      const span = est ? est.endMs - est.startMs : 250;
      w.startMs = lastEnd;
      w.endMs = next ? Math.min(next.startMs!, lastEnd + span) : lastEnd + span;
    }
    lastEnd = w.endMs!;
  }
  // Group by original token → original spans; then by segment.
  const out: AlignedSegment[] = segments.map((s, i) => ({ index: i, orig: s.orig, text: s.text, startMs: 0, endMs: 0, words: [] }));
  for (const w of spoken) {
    const tok = tokens[w.tokenIndex]!;
    out[w.seg]!.words.push({ orig: tok.orig.trim(), origStart: tok.start, origEnd: tok.end, spoken: w.word, startMs: w.startMs!, endMs: w.endMs!, segment: w.seg });
  }
  for (const s of out) {
    if (s.words.length) { s.startMs = s.words[0]!.startMs; s.endMs = s.words[s.words.length - 1]!.endMs; }
  }
  return out;
}

/**
 * Align engine word boundaries to UNNORMALISED text (the engine was fed the raw article).
 * Engines then emit digits as their own tokens ("१", "२४") and stall on abbreviations ("रु."
 * → "रु" + a long gap), which is the drift source speakable removes — but when you already have
 * such audio, this maps every raw whitespace token to a time span. Unmatched tokens (dropped by
 * the engine, e.g. punctuation-only) inherit the surrounding span.
 */
export function alignRaw(text: string, boundaries: WordBoundary[]): Array<{ orig: string; start: number; end: number; startMs: number; endMs: number }> {
  const toks: Array<{ orig: string; start: number; end: number; key: string; startMs?: number; endMs?: number }> = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) toks.push({ orig: m[0], start: m.index, end: m.index + m[0].length, key: strip(m[0]) });
  const events = boundaries.filter((b) => strip(b.text)).map((b) => ({ key: strip(b.text), start: b.offsetMs, end: b.offsetMs + b.durationMs }));
  let ei = 0;
  for (let ti = 0; ti < toks.length && ei < events.length; ti++) {
    const t = toks[ti]!;
    if (!t.key) continue;
    let found = -1;
    for (let k = ei; k < Math.min(events.length, ei + 4); k++) {
      const ek = events[k]!.key;
      if (ek === t.key || t.key.startsWith(ek) || ek.startsWith(t.key)) { found = k; break; }
    }
    if (found === -1) continue;
    // An engine may split one raw token into several events ("रु." → "रु"; "१,२०,०००" → "१" "२०" "०००"): absorb
    // following events while their concatenation is still a prefix of the token.
    let acc = events[found]!.key, endK = found;
    while (endK + 1 < events.length && acc.length < t.key.length && t.key.startsWith(acc + events[endK + 1]!.key)) { endK++; acc += events[endK]!.key; }
    t.startMs = events[found]!.start;
    t.endMs = events[endK]!.end;
    ei = endK + 1;
  }
  let lastEnd = 0;
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i]!;
    if (t.startMs === undefined) {
      const next = toks.slice(i + 1).find((x) => x.startMs !== undefined);
      t.startMs = lastEnd;
      t.endMs = next ? next.startMs! : lastEnd + 200;
    }
    lastEnd = t.endMs!;
  }
  return toks.map((t) => ({ orig: t.orig, start: t.start, end: t.end, startMs: t.startMs!, endMs: t.endMs! }));
}

/** Merge aligned words back into ORIGINAL-text caption units (one entry per original token). */
export function originalWordTimings(aligned: AlignedSegment[]): Array<{ orig: string; start: number; end: number; startMs: number; endMs: number; segment: number }> {
  const out: Array<{ orig: string; start: number; end: number; startMs: number; endMs: number; segment: number }> = [];
  for (const s of aligned) {
    for (const w of s.words) {
      const last = out[out.length - 1];
      const punctOnly = /^[^\p{L}\p{N}]+$/u.test(w.orig);
      if (last && last.start === w.origStart && last.end === w.origEnd) last.endMs = Math.max(last.endMs, w.endMs);
      else if (last && punctOnly && last.segment === s.index && last.end === w.origStart) { last.orig += w.orig; last.end = w.origEnd; last.endMs = Math.max(last.endMs, w.endMs); }
      else out.push({ orig: w.orig, start: w.origStart, end: w.origEnd, startMs: w.startMs, endMs: w.endMs, segment: s.index });
    }
  }
  return out;
}
