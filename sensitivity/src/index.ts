/**
 * @lacspace/sensitivity — zero-AI first pass for a newsroom's sensitive-category gate (Nepali / English).
 *
 * classify({ title, text, lang }) → { categories, confidence, hits }.
 *  - confidence "certain": the lexicons settle it (clearly nothing sensitive, or clearly sensitive);
 *    skip the model.
 *  - confidence "unsure": something ambiguous is there; ask the model, but only for these.
 */
import { EXCLUDE, HARM, NOT_PERSON_EN, PERSON_ROLES_NE, TERMS, type Category } from "./lexicon.js";

export type { Category } from "./lexicon.js";
export const CATEGORIES: Category[] = ["election", "court", "death", "communal", "named_individual", "minor", "health_emergency"];

export interface ClassifyInput {
  title: string;
  text?: string;
  lang?: "en" | "ne";
  /** Optional named entities from your extractor; person names help named_individual. */
  entities?: string[];
}
export interface Hit { term: string; cat: Category; where: "title" | "lead" | "text"; strength: "strong" | "weak" }
export interface ClassifyResult {
  categories: Category[];
  confidence: "certain" | "unsure";
  hits: Hit[];
  /** Per-category evidence score (title strong = 2, text strong = 1, weak = half). */
  scores: Partial<Record<Category, number>>;
  /** Why the result is unsure, for logs. */
  reasons: string[];
}
export interface ClassifyOptions {
  /** Score at which a category counts (default 1) and is certain (default 2). */
  include?: number;
  certain?: number;
  /** Category scores below this are treated as noise for confidence (default 0.6): a lone weak
   * word deep in the page shouldn't send every story to the model. */
  noise?: number;
  /** Characters of body text to read (default 2000). */
  maxText?: number;
  /** The opening of the body that counts fully (default 600 chars); later text — often sidebar or
   * related-story junk in scraped sources — counts at 0.3. */
  leadChars?: number;
  /** Categories you don't gate on; they are still reported in hits. */
  ignore?: Category[];
}

const NE_DIGITS = "०१२३४५६७८९";
const toAscii = (s: string) => s.replace(/[०-९]/g, (d) => String(NE_DIGITS.indexOf(d)));
const DEV_WORD = "[\\p{Script=Devanagari}\\p{M}]";

interface Compiled { cat: Category; w: "strong" | "weak"; label: string; re: RegExp }
const COMPILED: Compiled[] = TERMS.flatMap((t) => [
  ...(t.ne ?? []).map((term) => ({ cat: t.cat, w: t.w, label: term, re: new RegExp(`(?<!${DEV_WORD})${term.replace(/\s+/g, "\\s*")}`, "gu") })),
  ...(t.en ?? []).map((term) => ({ cat: t.cat, w: t.w, label: term.replace(/[()?:\\[\]|^$]/g, "").replace(/\s+/g, " "), re: new RegExp(`\\b(?:${term})\\b`, "gi") })),
]);
// a court story about a person's case, not a policy ruling
const CASE_RE = /\b(?:bail|custody|remanded|verdict|accused|charged|sentenced|convicted|acquitted|indicted|pre-trial|trial|defendant|money laundering|fraud)\b|धरौटी|थुना|फैसला|पक्राउ|अभियोग|अभियुक्त|आरोपित|बयान|पुर्पक्ष|बिचौलिया|मुद्दा/iu;
// rulings about a law or policy rather than a person's case
const POLICY_RE = /mandamus|legal principle|precedent|in the name of the government|public interest litigation|constitutional bench|परमादेश|नजिर|सिद्धान्त प्रतिपादन|सार्वजनिक सरोकार/iu;
const HARM_RE = new RegExp(`(?:${HARM.en.map((x) => `\\b${x}\\b`).join("|")})|(?:${HARM.ne.map((x) => `(?<!${DEV_WORD})${x}`).join("|")})`, "iu");
const AGE_RE = /(?:(\d{1,2})\s*वर्ष(?:ीय|ीया|की|का|को)?\s*(बालक|बालिका|छोरा|छोरी|किशोर|किशोरी|बच्चा|बच्ची|नानी|विद्यार्थी|छात्रा|छात्र)?)|(?:\b(\d{1,2})[- ]year[- ]old\b)|(?:\baged (\d{1,2})\b)/giu;

/** End of the lead: the sentence boundary nearest after n characters. */
function cut(s: string, n: number): number {
  if (s.length <= n) return s.length;
  const m = /[.!?।]\s/g;
  m.lastIndex = n;
  const r = m.exec(s);
  return r && r.index < n + 200 ? r.index + 1 : n;
}
function clean(s: string): string {
  let out = s;
  for (const re of EXCLUDE) out = out.replace(re, " ");
  return out;
}
function find(text: string, where: Hit["where"]): Hit[] {
  const hits: Hit[] = [];
  const seen = new Set<string>();
  for (const c of COMPILED) {
    c.re.lastIndex = 0;
    const m = c.re.exec(text);
    if (!m) continue;
    const key = `${c.cat}:${c.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({ term: m[0], cat: c.cat, where, strength: c.w });
  }
  // ages under 18
  AGE_RE.lastIndex = 0;
  for (let m = AGE_RE.exec(toAscii(text)); m; m = AGE_RE.exec(toAscii(text))) {
    const n = Number(m[1] ?? m[3] ?? m[4]);
    const noun = m[2];
    const english = m[3] ?? m[4];
    if (n > 0 && n < 18 && (noun || english || /वर्षीय|वर्षीया/.test(m[0]))) {
      hits.push({ term: m[0].trim(), cat: "minor", where, strength: "strong" });
      break;
    }
  }
  return hits;
}
function hasPerson(title: string, text: string, entities: string[] | undefined, lang: string): boolean {
  const all = `${title}\n${text}`;
  if (PERSON_ROLES_NE.some((r) => all.includes(r))) return true;
  const ents = (entities ?? []).filter((e) => /^\p{Lu}\p{Ll}+(?:\s+\p{Lu}\.?\p{Ll}*){1,3}$/u.test(e) && !e.split(/\s+/).some((w) => NOT_PERSON_EN.has(w)));
  if (ents.length) return true;
  if (lang === "ne" && /[\p{Script=Devanagari}]/u.test(all) && !/[A-Za-z]{3}/.test(all)) return false;
  // a Title Case span of 2–4 words that isn't an institution/place
  for (const m of all.matchAll(/(?<![.!?]\s)\b(\p{Lu}\p{Ll}+(?:\s+\p{Lu}\p{Ll}+){1,3})\b/gu)) {
    const words = m[1]!.split(/\s+/);
    if (!words.some((w) => NOT_PERSON_EN.has(w)) && words.length >= 2) return true;
  }
  return /\b(?:Mr|Ms|Mrs|Dr|MP|Minister|Judge|Justice|Chairman|Chairperson|Mayor|businessman|businesswoman|leader|lawmaker)\.?\s+\p{Lu}/u.test(all);
}

export function classify(input: ClassifyInput, options: ClassifyOptions = {}): ClassifyResult {
  const include = options.include ?? 1;
  const certainAt = options.certain ?? 2;
  const lang = input.lang ?? (/[\p{Script=Devanagari}]/u.test(input.title) ? "ne" : "en");
  const title = clean(input.title ?? "");
  // many feeds repeat the title at the top of the body
  let body = (input.text ?? "").slice(0, options.maxText ?? 2000);
  if (input.title && body.startsWith(input.title)) body = body.slice(input.title.length);
  body = clean(body);

  const leadEnd = cut(body, options.leadChars ?? 600);
  const lead = body.slice(0, leadEnd);
  const rest = body.slice(leadEnd);
  const same = (a: Hit, b: Hit) => a.cat === b.cat && a.term.toLowerCase() === b.term.toLowerCase();
  const titleHits = find(title, "title");
  const leadHits = find(lead, "lead").filter((h) => !titleHits.some((t) => same(t, h)));
  const restHits = find(rest, "text").filter((h) => ![...titleHits, ...leadHits].some((t) => same(t, h)));
  let hits = [...titleHits, ...leadHits, ...restHits];
  const reasons: string[] = [];

  // minors only count with a harm context; allegations only with a person
  const harm = HARM_RE.test(`${title}\n${lead}`);
  if (!harm) hits = hits.filter((h) => h.cat !== "minor");
  if (hits.some((h) => h.cat === "named_individual") && !hasPerson(input.title, body, input.entities, lang)) {
    hits = hits.map((h) => (h.cat === "named_individual" ? { ...h, strength: "weak" as const } : h));
    reasons.push("allegation words without a clear person");
  }

  const scores: Partial<Record<Category, number>> = {};
  for (const h of hits) {
    const base = h.strength === "strong" ? 1 : 0.5;
    scores[h.cat] = Math.round(((scores[h.cat] ?? 0) + base * (h.where === "title" ? 2 : h.where === "lead" ? 1 : 0.3)) * 100) / 100;
  }
  const ignore = new Set(options.ignore ?? []);
  const categories = CATEGORIES.filter((c) => !ignore.has(c) && (scores[c] ?? 0) >= include && (hits.some((h) => h.cat === c && h.where !== "text") || (scores[c] ?? 0) >= 1.5));
  let certain = true;
  for (const c of CATEGORIES) {
    const s = scores[c] ?? 0;
    if (ignore.has(c) || s < (options.noise ?? 0.6)) continue;
    // hits only deep in the page (sidebars, related stories) are noise unless there are many
    const upfront = hits.some((h) => h.cat === c && h.where !== "text");
    if (!upfront && s < 1.5) continue;
    const strong = hits.some((h) => h.cat === c && h.strength === "strong");
    if (s < certainAt || !strong) { certain = false; reasons.push(`${c}: weak evidence (${s})`); continue; }
    // sure it's sensitive only with the topic in the headline and two distinct strong signals
    const strongTerms = new Set(hits.filter((h) => h.cat === c && h.strength === "strong" && h.where !== "text").map((h) => h.term.toLowerCase()));
    const inTitle = hits.some((h) => h.cat === c && h.where === "title" && h.strength === "strong");
    if (!inTitle || strongTerms.size < 2) { certain = false; reasons.push(`${c}: ${inTitle ? "single signal" : "not in the headline"}`); continue; }
    if (c === "court" && (!CASE_RE.test(`${title}\n${lead}`) || POLICY_RE.test(`${title}\n${lead}`))) { certain = false; reasons.push("court: policy ruling or no case/charge words"); }
  }
  return { categories, confidence: certain ? "certain" : "unsure", hits, scores, reasons };
}

export function describe() {
  return {
    name: "@lacspace/sensitivity",
    version: "1.0.0",
    summary: "Zero-AI bilingual (Nepali/English) first pass for sensitive-story gating: election, court, death, communal, named_individual, minor, health_emergency, with certain/unsure confidence so the model is only called when needed.",
    commands: ["classify({ title, text, lang, entities }, options)", "CATEGORIES"],
  };
}
