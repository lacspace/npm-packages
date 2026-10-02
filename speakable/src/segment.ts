import { Lang } from "./rules.js";

export interface Token {
  /** Original text span. */
  orig: string;
  start: number;
  end: number;
  /** Spoken replacement (may be several words). */
  spoken: string;
  /** Produced by a number/date/currency rule → read slower. */
  numeric: boolean;
  /** Which rule produced it (or "word" / "space" / "punct"). */
  rule: string;
}

export interface Segment {
  /** Spoken text of the sentence. */
  text: string;
  /** Original text of the sentence. */
  orig: string;
  /** Token indices [from, to) in the token list. */
  tokens: [number, number];
  /** Pause after this segment, ms. */
  pauseAfter: number;
  /** Suggested relative rate (1 = normal; numbers-heavy sentences < 1). */
  rate: number;
  /** Estimated spoken duration, ms, excluding pauseAfter. */
  durationMs: number;
  /** Per spoken word timing estimate (relative to segment start). */
  words: Array<{ word: string; startMs: number; endMs: number; tokenIndex: number }>;
}

export interface PacingOptions {
  /** Base words per minute for the engine at rate 1.0. Default: ne 125, en 160. */
  wpm?: number;
  sentencePauseMs?: number; // 400
  clausePauseMs?: number; // 180
  paragraphPauseMs?: number; // 700
  /** Rate multiplier applied to numeric tokens. Default 0.88. */
  numberRate?: number;
}

const SENTENCE_END = /[।.!?]+["’”)]*$/;
const CLAUSE_END = /[,;:—–]$/;

/** Count syllables — Devanagari: consonant/vowel nuclei (virama joins clusters); Latin: vowel groups. */
export function syllables(word: string): number {
  let n = 0;
  const chars = [...word];
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    const code = c.codePointAt(0)!;
    if (code >= 0x0904 && code <= 0x0914) n++; // independent vowels
    else if (code >= 0x0915 && code <= 0x0939 || code >= 0x0958 && code <= 0x095f) {
      if (chars[i + 1] !== "्") n++; // consonant without virama = syllable
    }
  }
  if (n) return n;
  const latin = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!latin) return /\d/.test(word) ? word.replace(/\D/g, "").length : 0;
  const groups = latin.replace(/e$/, "").match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Split tokens into sentence segments, attach pauses, rates and estimated word timings. */
export function segment(tokens: Token[], lang: Lang, o: PacingOptions = {}): Segment[] {
  const wpm = o.wpm ?? (lang === "ne" ? 125 : 160);
  const msPerSyllable = lang === "ne" ? 60000 / (wpm * 2.6) : 60000 / (wpm * 1.5);
  const sentencePause = o.sentencePauseMs ?? 400, clausePause = o.clausePauseMs ?? 180, paragraphPause = o.paragraphPauseMs ?? 700;
  const numberRate = o.numberRate ?? 0.88;

  const segs: Segment[] = [];
  let from = 0;
  const flush = (to: number, pause: number) => {
    const slice = tokens.slice(from, to);
    if (!slice.some((t) => t.spoken.trim())) { from = to; return; }
    const text = slice.map((t) => t.spoken).join("").replace(/\s+/g, " ").trim();
    const orig = slice.map((t) => t.orig).join("").trim();
    const numericWeight = slice.filter((t) => t.numeric).reduce((a, t) => a + t.spoken.split(/\s+/).length, 0);
    const totalWords = slice.reduce((a, t) => a + (t.spoken.trim() ? t.spoken.trim().split(/\s+/).length : 0), 0);
    const rate = totalWords ? round(1 - (1 - numberRate) * Math.min(1, numericWeight / totalWords)) : 1;
    const words: Segment["words"] = [];
    let t = 0;
    slice.forEach((tok, i) => {
      if (!tok.spoken.trim()) return;
      for (const w of tok.spoken.trim().split(/\s+/)) {
        const dur = (syllables(w) * msPerSyllable + 40) * (tok.numeric ? 1 / numberRate : 1);
        words.push({ word: w, startMs: Math.round(t), endMs: Math.round(t + dur), tokenIndex: from + i });
        t += dur;
        if (CLAUSE_END.test(w)) t += clausePause;
      }
    });
    segs.push({ text, orig, tokens: [from, to], pauseAfter: pause, rate, durationMs: Math.round(t), words });
    from = to;
  };
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i]!;
    if (tok.rule === "para") { flush(i + 1, paragraphPause); continue; }
    if (SENTENCE_END.test(tok.orig.trimEnd()) && (tok.rule === "punct" || tok.rule === "word")) {
      // A sentence ends here only if followed by whitespace/end or a quote; abbreviations were already expanded.
      const next = tokens[i + 1];
      if (next?.rule === "para") { flush(i + 2, paragraphPause); i++; }
      else if (!next || /^\s/.test(next.orig)) flush(i + 1, sentencePause);
    }
  }
  flush(tokens.length, 0);
  return segs;
}

/** SSML (edge-tts / Azure dialect) with breaks and prosody; `plain` turns pauses into punctuation. */
export function toSsml(segs: Segment[], lang: Lang, options: { voice?: string; baseRate?: number; plain?: boolean } = {}): string {
  if (options.plain) {
    return segs.map((s) => s.text + (s.pauseAfter >= 600 ? "\n\n" : s.pauseAfter >= 300 ? " " : " ")).join("").trim();
  }
  const xmlLang = lang === "ne" ? "ne-NP" : "en-US";
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = segs.map((s) => {
    const rate = Math.round(((options.baseRate ?? 1) * s.rate - 1) * 100);
    const inner = Math.abs(rate) >= 3 ? `<prosody rate="${rate > 0 ? "+" : ""}${rate}%">${esc(s.text)}</prosody>` : esc(s.text);
    return `<s>${inner}</s>${s.pauseAfter ? `<break time="${s.pauseAfter}ms"/>` : ""}`;
  }).join("");
  const voice = options.voice ? `<voice name="${options.voice}">${body}</voice>` : body;
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${xmlLang}">${voice}</speak>`;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
