/** Turn a free-text brief + keywords into concrete design choices — no AI. */
import { PALETTES, FONTS, ICONS, MOODS, KEYWORDS, paletteById, fontById, iconByKey, moodById } from "./data.js";
import type { FontPair, IconDef, LogoBrief, Mood, Palette } from "./types.js";
import type { Rng } from "./rng.js";

const STOP = new Set(
  "the a an and or for of to with we our is are your you it this that in on at by as be brand company business co inc ltd studio group solutions services".split(
    /\s+/,
  ),
);

/** Normalise keywords + brief text into a clean token list. */
export function tokenize(brief: LogoBrief): string[] {
  const raw: string[] = [];
  if (Array.isArray(brief.keywords)) raw.push(...brief.keywords);
  else if (typeof brief.keywords === "string") raw.push(...brief.keywords.split(/[,\s]+/));
  if (brief.brief) raw.push(...brief.brief.split(/[^\p{L}\p{N}]+/u));
  if (brief.industry) raw.push(brief.industry);
  if (brief.style) raw.push(brief.style);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const w = t.trim().toLowerCase();
    if (w.length < 2 || STOP.has(w) || seen.has(w)) continue;
    seen.add(w);
    out.push(w);
  }
  return out;
}

function overlap(a: readonly string[], b: readonly string[]): number {
  const set = new Set(b);
  let c = 0;
  for (const x of a) if (set.has(x)) c++;
  return c;
}

/** Pick the best-scoring mood for the tokens (with vibe-word nudges). */
export function chooseMood(tokens: string[], rng: Rng, forced?: string): Mood {
  if (forced) {
    const m = moodById(forced.toLowerCase()) || MOODS.find((x) => x.keywords.includes(forced.toLowerCase()));
    if (m) return m;
  }
  const scored = MOODS.map((m) => {
    let score = overlap(tokens, m.keywords) * 3;
    for (const t of tokens) if (KEYWORDS.vibeWords[t] === m.id) score += 2;
    return { m, score };
  });
  const max = Math.max(...scored.map((s) => s.score));
  const top = scored.filter((s) => s.score === max && max > 0).map((s) => s.m);
  if (top.length) return rng.pick(top);
  return moodById("modern")!;
}

function byMood<T extends { mood: string[] }>(items: T[], tags: string[]): T[] {
  // Prefer the items that overlap the MOST mood tags, not merely any.
  const scored = items.map((i) => ({ i, s: overlap(i.mood, tags) }));
  const max = Math.max(0, ...scored.map((x) => x.s));
  if (max === 0) return items;
  return scored.filter((x) => x.s === max).map((x) => x.i);
}

export function choosePalette(tokens: string[], mood: Mood, rng: Rng, forced?: string): Palette {
  if (forced) {
    const p = paletteById(forced);
    if (p) return p;
  }
  for (const t of tokens) {
    const id = KEYWORDS.colorWords[t];
    if (id) {
      const p = paletteById(id);
      if (p) return p;
    }
  }
  return rng.pick(byMood(PALETTES, mood.paletteMood));
}

export function chooseFont(mood: Mood, rng: Rng, forced?: string): FontPair {
  if (forced) {
    const f = fontById(forced);
    if (f) return f;
  }
  return rng.pick(byMood(FONTS, mood.fontMood));
}

/** Best icon for the tokens, or undefined when nothing matches (→ mark/monogram). */
export function chooseIcon(tokens: string[], rng: Rng, forced?: string): IconDef | undefined {
  if (forced) {
    const i = iconByKey(forced);
    if (i) return i;
  }
  const scored = ICONS.map((icon) => ({ icon, score: overlap(tokens, icon.keywords) }));
  const max = Math.max(0, ...scored.map((s) => s.score));
  if (max === 0) return undefined;
  return rng.pick(scored.filter((s) => s.score === max).map((s) => s.icon));
}
