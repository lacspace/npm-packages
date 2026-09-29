import { ENGLISH_STOPWORDS, NEPALI_STOPWORDS } from "./stopwords.js";

export { ENGLISH_STOPWORDS, NEPALI_STOPWORDS } from "./stopwords.js";

export interface KeyphraseOptions {
  /** "en", "ne", or "auto" (default) — picks built-in stopwords. */
  language?: "en" | "ne" | "auto";
  /** How many keyphrases/tags to return. Default 10. */
  topK?: number;
  /** Longest phrase, in words. Default 4. */
  maxWords?: number;
  /** Replace the built-in stopwords entirely. */
  stopwords?: string[];
  /** Add to the built-in stopwords. */
  extraStopwords?: string[];
  /** Known entities (people/places), en and ne forms — always surfaced and boosted. */
  gazetteer?: string[];
  /** Category lexicons: { category: [terms] }. Returns a vote per category by term hits. */
  categories?: Record<string, string[]>;
  /** Minimum characters for a candidate word. Default 2. */
  minWordLength?: number;
}

export interface ScoredPhrase {
  phrase: string;
  score: number;
}
export interface EntityHit {
  text: string;
  count: number;
}
export interface CategoryVote {
  category: string;
  score: number;
}
export interface KeyphraseResult {
  /** Top keyphrases by RAKE degree/frequency score. */
  phrases: ScoredPhrase[];
  /** Flat, de-duplicated tag strings (top phrases, normalized). */
  tags: string[];
  /** Hashtags built from the top tags (CamelCase for Latin, Devanagari kept whole). */
  hashtags: string[];
  /** Candidate named entities: Latin Title-Case runs + gazetteer hits. */
  entities: EntityHit[];
  /** Category votes (only when `categories` is provided), highest first. */
  categories: CategoryVote[];
  /** Detected/So-used language. */
  language: "en" | "ne";
}

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{M}\p{N}‌‍]*/gu;
const DEVANAGARI_RE = /[ऀ-ॿ]/;

function detectLanguage(text: string): "en" | "ne" {
  const deva = (text.match(/[ऀ-ॿ]/g) || []).length;
  const latin = (text.match(/[A-Za-z]/g) || []).length;
  return deva > latin ? "ne" : "en";
}

function words(text: string): { w: string; start: number }[] {
  const out: { w: string; start: number }[] = [];
  let m: RegExpExecArray | null;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text)) !== null) out.push({ w: m[0], start: m.index });
  return out;
}

/** Extract keyphrases, tags, hashtags, entities and category votes — no LLM. */
export function keyphrase(text: string, options: KeyphraseOptions = {}): KeyphraseResult {
  const language = options.language && options.language !== "auto" ? options.language : detectLanguage(text || "");
  const topK = options.topK ?? 10;
  const maxWords = options.maxWords ?? 4;
  const minLen = options.minWordLength ?? 2;
  const base = options.stopwords ?? (language === "ne" ? NEPALI_STOPWORDS : ENGLISH_STOPWORDS);
  const stop = new Set([...base, ...(options.extraStopwords ?? [])].map((s) => s.toLowerCase()));
  const gaz = (options.gazetteer ?? []).filter(Boolean);

  const empty: KeyphraseResult = { phrases: [], tags: [], hashtags: [], entities: [], categories: [], language };
  if (!text || !text.trim()) return empty;

  // 1. RAKE: break into candidate phrases at stopwords and non-word chars.
  const candidates: string[][] = [];
  let current: string[] = [];
  // Walk the raw text so punctuation also breaks phrases.
  const tokenStream = tokenizeWithGaps(text);
  for (const tok of tokenStream) {
    if (tok.isBreak) {
      if (current.length) candidates.push(current);
      current = [];
      continue;
    }
    const lw = tok.w!.toLowerCase();
    if (stop.has(lw) || tok.w!.length < minLen || /^\d+$/.test(tok.w!)) {
      if (current.length) candidates.push(current);
      current = [];
    } else {
      current.push(tok.w!);
    }
  }
  if (current.length) candidates.push(current);

  // 2. Word scores: degree / frequency (classic RAKE).
  const freq = new Map<string, number>();
  const degree = new Map<string, number>();
  for (const phrase of candidates) {
    const deg = phrase.length - 1;
    for (const w of phrase) {
      const k = w.toLowerCase();
      freq.set(k, (freq.get(k) ?? 0) + 1);
      degree.set(k, (degree.get(k) ?? 0) + deg + 1);
    }
  }
  const wordScore = (w: string) => {
    const k = w.toLowerCase();
    const f = freq.get(k) ?? 1;
    return (degree.get(k) ?? f) / f;
  };

  // 3. Phrase scores; keep ≤ maxWords; dedupe by lowercase text; boost gazetteer.
  const gazLower = new Set(gaz.map((g) => g.toLowerCase()));
  const phraseScores = new Map<string, { phrase: string; score: number; order: number }>();
  let order = 0;
  for (const phrase of candidates) {
    if (phrase.length === 0 || phrase.length > maxWords) continue;
    const text2 = phrase.join(" ");
    const key = text2.toLowerCase();
    let score = phrase.reduce((s, w) => s + wordScore(w), 0);
    if (gazLower.has(key) || gaz.some((g) => text2.includes(g))) score *= 1.5;
    const prev = phraseScores.get(key);
    if (prev) prev.score = Math.max(prev.score, score);
    else phraseScores.set(key, { phrase: text2, score, order: order++ });
  }
  const phrases = [...phraseScores.values()]
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, topK)
    .map((p) => ({ phrase: p.phrase, score: round(p.score) }));

  // 4. Tags + hashtags.
  const tags = phrases.map((p) => p.phrase);
  const hashtags = dedupe(tags.map(toHashtag).filter((h) => h.length > 1));

  // 5. Entities: Latin Title-Case runs + gazetteer hits.
  const entities = extractEntities(text, gaz);

  // 6. Category votes.
  const categories: CategoryVote[] = [];
  if (options.categories) {
    const lower = text.toLowerCase();
    for (const [cat, terms] of Object.entries(options.categories)) {
      let score = 0;
      for (const term of terms) {
        if (!term) continue;
        if (DEVANAGARI_RE.test(term)) {
          score += countOccurrences(text, term);
        } else {
          const re = new RegExp(`(?:^|[^a-z0-9])${escapeRe(term.toLowerCase())}(?:[^a-z0-9]|$)`, "g");
          score += (lower.match(re) || []).length;
        }
      }
      if (score > 0) categories.push({ category: cat, score });
    }
    categories.sort((a, b) => b.score - a.score || a.category.localeCompare(b.category));
  }

  return { phrases, tags, hashtags, entities, categories, language };
}

interface StreamTok {
  w?: string;
  isBreak: boolean;
}
function tokenizeWithGaps(text: string): StreamTok[] {
  const out: StreamTok[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text)) !== null) {
    if (m.index > last) {
      // any non-word gap that contains sentence punctuation is a hard break
      const gap = text.slice(last, m.index);
      if (/[.!?;:,।॥\n\-–—/()\[\]"'“”]/.test(gap)) out.push({ isBreak: true });
    }
    out.push({ w: m[0], isBreak: false });
    last = m.index + m[0].length;
  }
  return out;
}

/** Build a hashtag: strip #, CamelCase Latin words, keep Devanagari, keep only letters/marks/numbers. */
export function toHashtag(input: string): string {
  const cleaned = input.replace(/^#/, "");
  const parts = cleaned.split(/[\s\-_/]+/).filter(Boolean);
  const joined = parts
    .map((p) => (/^[a-z]/.test(p) ? p.charAt(0).toUpperCase() + p.slice(1) : p))
    .join("");
  const kept = [...joined].filter((ch) => /[\p{L}\p{M}\p{N}]/u.test(ch)).join("");
  return kept.length >= 2 && kept.length <= 30 ? "#" + kept : "";
}

function extractEntities(text: string, gaz: string[]): EntityHit[] {
  const counts = new Map<string, number>();
  // Latin Title-Case runs of 1–4 words.
  const re = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const e = m[1]!;
    // skip a lone word that starts a sentence and is common (heuristic: keep multiword or gazetteer)
    counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  // Gazetteer (incl. Devanagari) always counted.
  for (const g of gaz) {
    if (!g) continue;
    const c = countOccurrences(text, g);
    if (c > 0) counts.set(g, Math.max(counts.get(g) ?? 0, c));
  }
  return [...counts.entries()]
    .map(([t, c]) => ({ text: t, count: c }))
    .sort((a, b) => b.count - a.count || a.text.localeCompare(b.text))
    .filter((e) => e.text.includes(" ") || gaz.includes(e.text) || e.count > 1 || /[ऀ-ॿ]/.test(e.text));
}

function countOccurrences(hay: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = hay.indexOf(needle);
  while (i !== -1) {
    n++;
    i = hay.indexOf(needle, i + needle.length);
  }
  return n;
}
function dedupe(arr: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of arr) {
    const k = x.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(x);
    }
  }
  return out;
}
function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
