import { ENGLISH_STOPWORDS, keyphrase } from "@lacspace/keyphrase";
import { transliterate, detectScript } from "@lacspace/translit";
import { FetchLike, googleTrendsDaily, RawTrend, TrendSource, wikipediaTop, youtubeMostPopular } from "./sources.js";

export * from "./sources.js";

const VERSION = "1.1.0";

export interface Trend {
  /** Display term (original casing/script of the strongest source). */
  term: string;
  /** Merged score, higher = more trending (multi-source terms rank up). */
  score: number;
  sources: TrendSource[];
  volume?: number;
  links: string[];
  /** 0–1 relevance to a story, set by relevanceTo / trends({ relevanceTo }). */
  relevance?: number;
}

/** A cross-script, lowercased key so "Dashain" and "दशैं" merge. */
function keyOf(term: string): string {
  const roman = detectScript(term) === "ne" ? transliterate(term, { from: "ne", to: "en" }) : term;
  return roman.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function tokens(s: string): string[] {
  const roman = detectScript(s) === "ne" ? transliterate(s, { from: "ne", to: "en" }) : s;
  return (roman.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => w.length > 2);
}

/** Merge raw trends from several sources into one scored, de-duplicated list. */
export function mergeTrends(raws: RawTrend[]): Trend[] {
  const groups = new Map<string, { best: RawTrend; score: number; sources: Set<TrendSource>; links: Set<string>; volume: number }>();
  for (const r of raws) {
    const k = keyOf(r.term);
    if (!k) continue;
    let g = groups.get(k);
    if (!g) {
      g = { best: r, score: 0, sources: new Set(), links: new Set(), volume: 0 };
      groups.set(k, g);
    }
    g.score += r.weight;
    g.sources.add(r.source);
    for (const l of r.links ?? []) g.links.add(l);
    if (r.volume) g.volume = Math.max(g.volume, r.volume);
    if (r.weight > g.best.weight) g.best = r; // strongest source sets the display term
  }
  const out: Trend[] = [];
  for (const g of groups.values()) {
    // Multi-source agreement is a strong signal → multiply by a diversity boost.
    const boost = 1 + 0.5 * (g.sources.size - 1);
    out.push({
      term: g.best.term,
      score: round(g.score * boost),
      sources: [...g.sources],
      volume: g.volume || undefined,
      links: [...g.links].slice(0, 5),
    });
  }
  return out.sort((a, b) => b.score - a.score);
}

/**
 * Everyday nouns/verbs that are too generic to make a trend relevant on their own
 * ("river" must not pull in "River Phoenix"). Stop-words come from @lacspace/keyphrase.
 */
export const COMMON_TERMS: string[] = (
  "river lake water rain flood floods storm fire earthquake road bridge city town village country nation state world people man woman men women " +
  "child children family home house school college university hospital market price prices money bank job jobs work worker news report story video " +
  "photo live today tomorrow yesterday week month year day night time new old big small high low first last top best good bad open close update " +
  "government minister ministry police army court law election vote party leader president prime team match game cup league final season player " +
  "fans film movie song music show star stars love life death dead killed kill dies died attack crash accident case cases test result results " +
  "index share shares stock stocks gold oil fuel power energy weather heat cold snow wind air sky sun moon park forest mountain hill valley " +
  "animal animals bird birds dog cat tiger rhino rhinos elephant phone app online internet data tech car bus train plane flight airport " +
  "festival holiday day nepal india china usa america global international national local district province area region zone north south east west " +
  "red blue black white green golden king queen prince lord saint new big"
).split(/\s+/);
const COMMON = new Set([...COMMON_TERMS, ...ENGLISH_STOPWORDS.map((w) => w.toLowerCase())]);

/** Crude English stem so "floods"/"flooded"/"flooding" meet "flood". */
function stem(w: string): string {
  if (w.length <= 4) return w;
  return w.replace(/(?:ing|ed|es|s)$/, "") || w;
}
const isCommon = (w: string) => COMMON.has(w) || COMMON.has(stem(w));
/** Title-cased 2–3 Latin words, e.g. "River Phoenix" — treat as a possible person name. */
const nameLike = (term: string) => /^\p{Lu}[\p{Ll}'.-]+(?:\s+\p{Lu}[\p{Ll}'.-]+){1,2}$/u.test(term.trim());

/**
 * Score each trend's relevance to a story (0–1) and attach it; optionally filter.
 *
 * A shared common word is never enough: a trend counts only when it matches the story on a
 * distinctive term (a proper noun / entity / rare word) or as a whole phrase. Name-like trends
 * ("River Phoenix") need every word of the name in the story. A single common-word trend
 * ("Flood") is capped at 0.2.
 */
export function relevanceTo(trends: Trend[], story: string, options: { min?: number } = {}): Trend[] {
  const kp = keyphrase(story, { max: 20 } as any);
  const storyTokens = new Set<string>();
  for (const p of kp.phrases ?? []) for (const t of tokens(p.phrase)) storyTokens.add(stem(t));
  for (const t of tokens(story)) storyTokens.add(stem(t));
  const storyKey = " " + tokens(story).map(stem).join(" ") + " ";
  const scored = trends.map((t) => {
    const tt = tokens(t.term);
    if (!tt.length || storyTokens.size === 0) return { ...t, relevance: 0 };
    const has = (w: string) => storyTokens.has(stem(w));
    const hits = tt.filter(has).length;
    const phrase = tt.length > 1 && storyKey.includes(" " + tt.map(stem).join(" ") + " ");
    const distinctive = tt.filter((w) => !isCommon(w));
    let rel: number;
    if (phrase) rel = 1;
    else if (tt.length === 1) rel = hits ? (distinctive.length ? 1 : 0.2) : 0;
    else if (nameLike(t.term)) rel = hits === tt.length ? 1 : 0;
    else if (!distinctive.length) rel = Math.min(0.2, hits / tt.length);
    else rel = distinctive.every(has) ? hits / tt.length : 0;
    return { ...t, relevance: round(rel) };
  });
  return options.min !== undefined ? scored.filter((t) => (t.relevance ?? 0) >= options.min!) : scored;
}

// --- hashtags ----------------------------------------------------------------------
export const HASHTAG_LIMITS: Record<string, number> = {
  instagram: 30, tiktok: 6, x: 3, facebook: 3, youtube: 15, threads: 5, linkedin: 5, telegram: 10,
};
// A conservative starter list of broken/shadow-ban-prone tags; callers extend.
const DEFAULT_BANNED = new Set(["followme", "follow4follow", "like4like", "nepaltiktok", "viral", "fyp"]);

function toHashtag(term: string): string {
  const roman = detectScript(term) === "ne" ? transliterate(term, { from: "ne", to: "en" }) : term;
  const camel = roman.replace(/[^a-zA-Z0-9]+/g, " ").trim().split(/\s+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
  return camel ? "#" + camel : "";
}

/** Build a platform-appropriate hashtag set from trend terms (+ optional extra tags). */
export function hashtagsFor(
  terms: string[],
  platform: keyof typeof HASHTAG_LIMITS | string,
  options: { banned?: string[]; max?: number; extra?: string[] } = {},
): string[] {
  const limit = options.max ?? HASHTAG_LIMITS[platform] ?? 10;
  const banned = new Set([...DEFAULT_BANNED, ...(options.banned ?? []).map((b) => b.toLowerCase().replace(/^#/, ""))]);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of [...terms, ...(options.extra ?? [])]) {
    const tag = toHashtag(raw);
    const bare = tag.slice(1).toLowerCase();
    if (!tag || bare.length < 2 || banned.has(bare) || seen.has(bare)) continue;
    seen.add(bare);
    out.push(tag);
    if (out.length >= limit) break;
  }
  return out;
}

export interface TrendsOptions {
  geo?: string;
  /** Sources to query. Default: google + wikipedia (youtube added iff youtubeApiKey). */
  sources?: TrendSource[];
  youtubeApiKey?: string;
  wikipediaProject?: string;
  /** Attach + filter by relevance to this story. */
  relevanceTo?: string;
  minRelevance?: number;
  fetch?: FetchLike;
  signal?: AbortSignal;
}

export interface TrendsResult {
  trends: Trend[];
  sources: TrendSource[];
  warnings: string[];
}

/** Fetch, merge and score trends from the configured official/public sources. */
export async function trends(options: TrendsOptions = {}): Promise<TrendsResult> {
  const want = options.sources ?? (["google", "wikipedia", ...(options.youtubeApiKey ? ["youtube"] as const : [])] as TrendSource[]);
  const warnings: string[] = [];
  const used: TrendSource[] = [];
  const raws: RawTrend[] = [];
  const run = async (s: TrendSource, fn: () => Promise<RawTrend[]>) => {
    try {
      const r = await fn();
      raws.push(...r);
      used.push(s);
    } catch (e) {
      warnings.push(`${s}: ${(e as Error).message}`);
    }
  };
  await Promise.all(
    want.map((s) => {
      if (s === "google") return run("google", () => googleTrendsDaily({ geo: options.geo, fetch: options.fetch, signal: options.signal }));
      if (s === "wikipedia") return run("wikipedia", () => wikipediaTop({ project: options.wikipediaProject, fetch: options.fetch, signal: options.signal }));
      if (s === "youtube" && options.youtubeApiKey) return run("youtube", () => youtubeMostPopular({ apiKey: options.youtubeApiKey!, regionCode: options.geo, fetch: options.fetch, signal: options.signal }));
      return Promise.resolve();
    }),
  );
  let merged = mergeTrends(raws);
  if (options.relevanceTo) merged = relevanceTo(merged, options.relevanceTo, { min: options.minRelevance });
  return { trends: merged, sources: used, warnings };
}

/** Machine-readable descriptor for an AI "conductor". */
export function describe() {
  return {
    name: "@lacspace/trends",
    version: VERSION,
    summary: "Trending topics for a region from official/public sources only (Google Trends RSS, YouTube mostPopular, Wikipedia pageviews), merged + scored, with story-relevance gating and per-platform hashtag sets.",
    sources: ["google", "youtube", "wikipedia"],
    commands: [
      { name: "trends", input: { type: "object", properties: { geo: { type: "string" }, sources: { type: "array" }, youtubeApiKey: { type: "string" }, relevanceTo: { type: "string" }, minRelevance: { type: "number" } } }, output: "{ trends:[{term,score,sources,volume,links,relevance}], sources, warnings }" },
      { name: "relevanceTo", input: { type: "object", properties: { trends: { type: "array" }, story: { type: "string" }, min: { type: "number" } }, required: ["trends", "story"] }, output: "Trend[] (with relevance)" },
      { name: "hashtagsFor", input: { type: "object", properties: { terms: { type: "array" }, platform: { type: "string" }, max: { type: "integer" }, banned: { type: "array" } }, required: ["terms", "platform"] }, output: "string[]" },
    ],
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
