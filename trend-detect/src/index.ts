/**
 * @lacspace/trend-detect — find what is bursting in your own item stream.
 * You supply items (title/text, timestamp, optional category); it scores each
 * term/entity by how far its frequency in a recent window departs from a rolling
 * baseline, so you can rank a writer queue by what is actually rising. No network,
 * no platform scraping — purely your data.
 */

export interface Item {
  /** Text to mine terms from (title + summary is ideal). */
  text: string;
  /** Epoch ms, or an ISO string / Date. */
  at: number | string | Date;
  /** Optional bucket (e.g. "politics"). Trends can be computed per category. */
  category?: string;
  /** Optional pre-extracted terms/entities; if given, `text` is not tokenized. */
  terms?: string[];
  /** Optional id, echoed in matches. */
  id?: string;
}

export interface TrendOptions {
  /** "now" for the analysis, epoch ms. Default: max item time. */
  now?: number;
  /** Recent window length in hours (the "burst" window). Default 24. */
  windowHours?: number;
  /** Baseline length in hours before the window. Default 168 (7 days). */
  baselineHours?: number;
  /** Minimum recent count for a term to be considered. Default 3. */
  minCount?: number;
  /** Extra stopwords on top of the built-ins. */
  stopwords?: string[];
  /** Replace the built-in stopwords. */
  baseStopwords?: string[];
  /** Longest phrase in words for n-gram terms. Default 2. */
  maxWords?: number;
  /** Known entities to always track (any script). */
  gazetteer?: string[];
  /** How many trends to return. Default 20. */
  topK?: number;
}

export interface Trend {
  term: string;
  /** Count in the recent window. */
  recent: number;
  /** Mean per-window count across the baseline. */
  baseline: number;
  /** Standard score of the recent count against the baseline distribution. */
  z: number;
  /** recent / (baseline + 1) — how many times above the usual rate. */
  growth: number;
  /** Combined rising score (higher = more bursting). */
  score: number;
  category?: string;
  /** ids of recent items containing the term. */
  items: string[];
}

import { EN_STOP, NE_STOP } from "./stopwords.js";

const WORD_RE = /[\p{L}\p{N}][\p{L}\p{M}\p{N}‌‍]*/gu;

function toMs(at: Item["at"]): number {
  if (typeof at === "number") return at;
  if (at instanceof Date) return at.getTime();
  const t = Date.parse(at);
  return Number.isNaN(t) ? 0 : t;
}

function terms(text: string, stop: Set<string>, maxWords: number): string[] {
  const words: string[] = [];
  let m: RegExpExecArray | null;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text)) !== null) {
    const w = m[0];
    if (w.length < 2 || /^\d+$/.test(w) || stop.has(w.toLowerCase())) {
      words.push("\u0000"); // break marker so n-grams don't cross a stopword
    } else {
      words.push(w);
    }
  }
  const out: string[] = [];
  for (let n = 1; n <= maxWords; n++) {
    for (let i = 0; i + n <= words.length; i++) {
      const slice = words.slice(i, i + n);
      if (slice.includes("\u0000")) continue;
      out.push(slice.join(" ").toLowerCase());
    }
  }
  return out;
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
function stddev(xs: number[], mu: number): number {
  if (xs.length < 2) return 0;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mu) ** 2, 0) / xs.length);
}
function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Detect bursting terms/entities across `items`. For each term, the recent-window
 * count is compared to its per-window counts across the baseline period (z-score),
 * combined with raw growth. Deterministic.
 */
export function detectTrends(items: Item[], options: TrendOptions = {}): Trend[] {
  const windowMs = (options.windowHours ?? 24) * 3_600_000;
  const baselineMs = (options.baselineHours ?? 168) * 3_600_000;
  const minCount = options.minCount ?? 3;
  const maxWords = options.maxWords ?? 2;
  const topK = options.topK ?? 20;
  const gaz = (options.gazetteer ?? []).filter(Boolean);

  const times = items.map((it) => toMs(it.at));
  const now = options.now ?? (times.length ? Math.max(...times) : Date.now());
  const windowStart = now - windowMs;
  const baselineStart = windowStart - baselineMs;

  // Detect a common language for stopwords (majority of items).
  const base = options.baseStopwords ?? autoStop(items);
  const stop = new Set([...base, ...(options.stopwords ?? [])].map((s) => s.toLowerCase()));

  // Bucket baseline into windows of `windowMs` for the distribution.
  const nBaseWindows = Math.max(1, Math.round(baselineMs / windowMs));

  // term -> { recent, itemIds, baseWindowCounts[] , category }
  interface Agg {
    term: string;
    recent: number;
    items: string[];
    baseCounts: number[];
    category?: string;
  }
  const map = new Map<string, Agg>();
  const ensure = (term: string, category?: string): Agg => {
    const key = category ? `${category}\u0000${term}` : term;
    let a = map.get(key);
    if (!a) {
      a = { term, recent: 0, items: [], baseCounts: new Array(nBaseWindows).fill(0), category };
      map.set(key, a);
    }
    return a;
  };

  items.forEach((it, idx) => {
    const t = times[idx]!;
    if (t < baselineStart || t > now) return;
    const id = it.id ?? String(idx);
    const list = it.terms && it.terms.length ? it.terms.map((s) => s.toLowerCase()) : terms(it.text ?? "", stop, maxWords);
    const uniq = new Set(list);
    for (const g of gaz) if ((it.text ?? "").includes(g)) uniq.add(g.toLowerCase());
    for (const term of uniq) {
      const a = ensure(term, it.category);
      if (t >= windowStart) {
        a.recent++;
        a.items.push(id);
      } else {
        const w = Math.min(nBaseWindows - 1, Math.floor((t - baselineStart) / windowMs));
        a.baseCounts[w] = (a.baseCounts[w] ?? 0) + 1;
      }
    }
  });

  const trends: Trend[] = [];
  for (const [, a] of map) {
    if (a.recent < minCount) continue;
    const mu = mean(a.baseCounts);
    const sd = stddev(a.baseCounts, mu);
    const z = sd > 0 ? (a.recent - mu) / sd : a.recent > mu ? a.recent - mu : 0;
    const growth = a.recent / (mu + 1);
    const score = round(Math.max(0, z) * Math.log2(1 + growth) * Math.log2(1 + a.recent));
    trends.push({
      term: a.term,
      recent: a.recent,
      baseline: round(mu),
      z: round(z),
      growth: round(growth),
      score,
      ...(a.category ? { category: a.category } : {}),
      items: a.items.slice(0, 20),
    });
  }
  trends.sort((x, y) => y.score - x.score || y.recent - x.recent || x.term.localeCompare(y.term));
  return trends.slice(0, topK);
}


function autoStop(items: Item[]): string[] {
  let deva = 0;
  let latin = 0;
  for (const it of items) {
    for (const ch of it.text ?? "") {
      if (ch >= "ऀ" && ch <= "ॿ") deva++;
      else if (/[A-Za-z]/.test(ch)) latin++;
    }
  }
  return deva > latin ? NE_STOP : EN_STOP;
}

export { EN_STOP, NE_STOP } from "./stopwords.js";
