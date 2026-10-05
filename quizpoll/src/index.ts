import { keyFacts, splitSentences, summarize } from "@lacspace/extractive";
import { MEDIA, placePool, typedEntities } from "./entities.js";

export { placeLevel, placePool, typedEntities } from "./entities.js";
export type { EntityType, PlaceLevel, TypedEntity } from "./entities.js";

const VERSION = "1.2.0";

export type Lang = "en" | "ne";
export type ItemKind = "number" | "entity" | "truefalse" | "opinion" | "didyouknow";

export interface Option {
  text: string;
  correct?: boolean;
}

export interface Item {
  kind: ItemKind;
  question: string;
  options: Option[];
  /** Index of the correct option (quiz kinds). */
  answerIndex?: number;
  /** Short line to show after answering ("Source: …" / the sentence). */
  explanation: string;
  /** Sentence the item was built from. */
  source: string;
  /** Platform fit by option count: IG story poll 2, IG quiz 4, YouTube 5, X 4, Facebook 10. */
  fits: Record<"instagram-poll" | "instagram-quiz" | "youtube" | "x" | "facebook" | "telegram", boolean>;
}

export interface QuizPoll {
  lang: Lang;
  quiz: Item[];
  polls: Item[];
  didYouKnow: Item[];
  warnings: string[];
}

export interface QuizPollOptions {
  lang?: Lang | "auto";
  /** Max quiz items (default 4) and polls (default 2). */
  maxQuiz?: number;
  maxPolls?: number;
  /** Deterministic shuffle seed (default: derived from the text). */
  seed?: number;
  /** Extra opinion-poll templates per lang (question + options). */
  opinionTemplates?: Partial<Record<Lang, Array<{ q: string; options: string[] }>>>;
}

const T = {
  en: {
    blank: "Fill in the blank: ",
    tf: "True or false? ",
    dyk: "Did you know? ",
    trueOpt: "True", falseOpt: "False",
    answer: "Answer: ",
    opinion: [
      { q: "What do you think of this?", options: ["Good move", "Bad move", "Not sure"] },
      { q: "Does this affect you?", options: ["Yes", "No", "Somewhat"] },
      { q: "Should this go further?", options: ["Yes", "No"] },
    ],
  },
  ne: {
    blank: "खाली ठाउँ भर्नुहोस्: ",
    tf: "सही कि गलत? ",
    dyk: "थाहा छ? ",
    trueOpt: "सही", falseOpt: "गलत",
    answer: "उत्तर: ",
    opinion: [
      { q: "यसबारे तपाईंको धारणा के छ?", options: ["राम्रो निर्णय", "गलत निर्णय", "थाहा छैन"] },
      { q: "यसले तपाईंलाई असर गर्छ?", options: ["गर्छ", "गर्दैन", "केही"] },
      { q: "यो अझै अगाडि बढ्नुपर्छ?", options: ["हो", "होइन"] },
    ],
  },
};

const LIMITS = { "instagram-poll": 2, "instagram-quiz": 4, youtube: 5, x: 4, facebook: 10, telegram: 10 } as const;

function detect(text: string): Lang { return (text.match(/[ऀ-ॿ]/g)?.length ?? 0) > (text.match(/[A-Za-z]/g)?.length ?? 0) ? "ne" : "en"; }
function fits(n: number): Item["fits"] {
  const f = {} as Item["fits"];
  for (const [k, max] of Object.entries(LIMITS)) f[k as keyof Item["fits"]] = n >= 2 && n <= max;
  return f;
}
function hash(s: string): number { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed: number): () => number { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle<T>(arr: T[], r: () => number): T[] { const a = [...arr]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!]; } return a; }

const NE_DIGITS = "०१२३४५६७८९";
const toNe = (s: string) => s.replace(/[0-9]/g, (d) => NE_DIGITS[+d]!);
const toLatin = (s: string) => s.replace(/[०-९]/g, (d) => String(NE_DIGITS.indexOf(d)));

/**
 * Distractors for a figure as written ("१२ प्रतिशत", "रु. ५० अर्ब", "1,20,000", "15-member"): scale the
 * leading number by ×0.5 / ×1.5 / ×2 (or ±1/±2 for small counts), keep digit script, separators,
 * scale words and decimals.
 */
export function numberDistractors(raw: string, count = 3): string[] {
  const m = raw.match(/[0-9०-९][0-9०-९,]*(?:\.[0-9०-९]+)?/);
  if (!m) return [];
  const numStr = m[0], isNe = /[०-९]/.test(numStr);
  const value = Number(toLatin(numStr).replace(/,/g, ""));
  if (!Number.isFinite(value)) return [];
  const decimals = (toLatin(numStr).split(".")[1] ?? "").length;
  const yearish = Number.isInteger(value) && value >= 1900 && value <= 2100 && !/[,.]/.test(numStr) && !/[०-९0-9]\s*(प्रतिशत|%|लाख|करोड|अर्ब|हजार)/.test(raw);
  const factors = yearish ? [value + 1, value - 1, value + 2, value - 2]
    : value <= 30 && Number.isInteger(value) ? [value + 1, value + 2, Math.max(1, value - 1), value + 3]
    : [value * 0.5, value * 1.5, value * 2, value * 0.75, value * 1.25];
  const fmt = (v: number) => {
    let s = decimals ? v.toFixed(decimals) : String(Math.round(v));
    if (/,/.test(numStr)) s = s.replace(/\B(?=(\d{3})+(?!\d))/g, ","); // western grouping is fine for a distractor
    return isNe ? toNe(s) : s;
  };
  const out: string[] = [];
  for (const f of factors) {
    const alt = raw.replace(numStr, fmt(f));
    if (alt !== raw && !out.includes(alt)) out.push(alt);
    if (out.length >= count) break;
  }
  return out;
}

/** Build quiz items (cloze on numbers/entities, true/false), opinion polls and did-you-know cards. */
export function quizpoll(text: string, o: QuizPollOptions = {}): QuizPoll {
  const lang: Lang = !o.lang || o.lang === "auto" ? detect(text) : o.lang;
  const t = T[lang];
  const r = rng(o.seed ?? hash(text));
  const warnings: string[] = [];
  const sents = splitSentences(text);
  if (!sents.length) throw new Error("quizpoll: empty text");
  const facts = keyFacts(text);
  const { ranked } = summarize(text, { maxSentences: sents.length });
  // Quiz items come only from full sentences: final punctuation, 5+ words, no outlet named.
  const isItemSentence = (x: string) => /[।॥.!?]["”’)]?$/u.test(x) && x.split(/\s+/).length >= 5 && !MEDIA.test(x);
  const ordered = [...ranked].sort((a, b) => b.score - a.score).map((s) => s.text);
  const important = ordered.filter(isItemSentence);
  // A wrong option must not be another figure that is in the article.
  const notInText = (alts: string[]) => alts.filter((a) => !text.includes(a.replace(/^\D*?([0-9०-९][0-9०-९,.]*).*$/u, "$1")));
  const used = new Set<string>();
  const maxQuiz = o.maxQuiz ?? 4;
  const numberItems: Item[] = [], entityItems: Item[] = [], tfItems: Item[] = [];
  const quiz: Item[] = []; // filled by round-robin at the end

  const mk = (kind: ItemKind, question: string, opts: Option[], source: string, explanation: string): Item => {
    const options = shuffle(opts, r);
    const answerIndex = options.findIndex((x) => x.correct);
    return { kind, question, options, answerIndex: answerIndex >= 0 ? answerIndex : undefined, explanation, source, fits: fits(options.length) };
  };

  // 1) Number cloze — strongest quiz: the sentence with the figure blanked out.
  const numClaims = [...(facts.amounts as any[]), ...(facts.percentages as any[]), ...(facts.numbers as any[])].filter((c) => c?.raw && String(c.raw).replace(/[^0-9०-९]/g, "").length >= 2);
  for (const c of numClaims) {
    if (numberItems.length >= maxQuiz) break;
    const s = important.find((x) => x.includes(c.raw) && !used.has(x));
    if (!s) continue;
    const d = notInText(numberDistractors(c.raw, 6)).slice(0, 3);
    if (d.length < 2) continue;
    used.add(s);
    numberItems.push(mk("number", t.blank + s.replace(c.raw, "____"), [{ text: c.raw, correct: true }, ...d.map((x) => ({ text: x }))], s, t.answer + c.raw));
  }
  // 2) Entity cloze — options are all the same kind as the answer (place↔place, person↔person, org↔org),
  // taken from the article; a place answer may borrow other districts/countries the article doesn't mention.
  const ents = typedEntities(text, sents, lang, facts.entities);
  for (const e of ents) {
    if (entityItems.length >= 2) break;
    const s = important.find((x) => x.includes(e.text) && !used.has(x) && !ents.some((o) => o !== e && x.includes(o.text) && o.text.includes(e.text)));
    if (!s) continue;
    // Options share the answer's type, and for places its level (district, province, municipality…).
    // A district/province/country/city answer takes ones the article doesn't name: a place the article
    // does name may be true as well ("from Jagadulla" when the goats came from Dolpa).
    let others = ents.filter((x) => x.type === e.type && x !== e && x.level === e.level && !s.includes(x.text) && !x.text.includes(e.text) && !e.text.includes(x.text)).map((x) => x.text);
    if (e.type === "place") {
      const pool = placePool(e.text, lang).filter((p) => !text.includes(p.split(" ")[0]!) && p !== e.text);
      if (pool.length) others = shuffle(pool, r).slice(0, 3);
    }
    if (others.length < 2) continue;
    used.add(s);
    entityItems.push(mk("entity", t.blank + s.replace(e.text, "____"), [{ text: e.text, correct: true }, ...others.slice(0, 3).map((x) => ({ text: x }))], s, t.answer + e.text));
  }
  // 3) True/false — a true top sentence, and a false one made by perturbing a figure.
  // A true statement may share a sentence with a cloze (different item kind); prefer an unused one.
  const tfTrue = important.find((x) => !used.has(x) && x.length < 160) ?? important.find((x) => x.length < 160);
  if (tfTrue) {
    used.add(tfTrue);
    tfItems.push(mk("truefalse", t.tf + tfTrue, [{ text: t.trueOpt, correct: true }, { text: t.falseOpt }], tfTrue, t.answer + t.trueOpt));
  }
  // False statement: prefer an unused figure sentence; a cloze-used one is acceptable (different item kind).
  const withNum = numClaims.find((c) => important.some((x) => x.includes(c.raw) && !used.has(x))) ?? numClaims.find((c) => important.some((x) => x.includes(c.raw)));
  if (withNum) {
    const s = important.find((x) => x.includes(withNum.raw) && !used.has(x)) ?? important.find((x) => x.includes(withNum.raw))!;
    const alt = notInText(numberDistractors(withNum.raw, 4))[0];
    if (alt) {
      used.add(s);
      const falseS = s.replace(withNum.raw, alt);
      tfItems.push(mk("truefalse", t.tf + falseS, [{ text: t.falseOpt, correct: true }, { text: t.trueOpt }], s, `${t.answer}${t.falseOpt} — ${withNum.raw}`));
    }
  }
  // Round-robin so a short quiz still mixes kinds: number, entity, true/false (false first), then the rest.
  const lanes = [numberItems, entityItems, [...tfItems].reverse()];
  while (quiz.length < maxQuiz && lanes.some((l) => l.length)) for (const l of lanes) { const it = l.shift(); if (it && quiz.length < maxQuiz) quiz.push(it); }
  if (!quiz.length) warnings.push("no figures or entities to build a quiz from");

  // 4) Opinion polls — templates, no claims made.
  const templates = [...(o.opinionTemplates?.[lang] ?? []), ...t.opinion];
  const polls: Item[] = templates.slice(0, o.maxPolls ?? 2).map((tp) => ({ kind: "opinion" as const, question: tp.q, options: tp.options.map((x) => ({ text: x })), explanation: "", source: important[0] ?? ordered[0]!, fits: fits(tp.options.length) }));

  // 5) Did-you-know cards from the figure sentences.
  const didYouKnow: Item[] = numClaims.slice(0, 3).map((c) => sents.find((x) => x.includes(c.raw) && isItemSentence(x))).filter((s): s is string => !!s).filter((s, i, a) => a.indexOf(s) === i).map((s) => ({ kind: "didyouknow" as const, question: t.dyk + s, options: [], explanation: "", source: s, fits: fits(0) }));

  return { lang, quiz, polls, didYouKnow, warnings };
}

/** Machine-readable descriptor for an AI "conductor". */
export function describe() {
  return {
    name: "@lacspace/quizpoll",
    version: VERSION,
    summary: "Quiz and poll items from an article (en/ne), no LLM: fill-in-the-blank on figures (distractors by scaling the number as written) and on typed entities (same-type distractors: place/person/org), true/false (incl. a perturbed figure), opinion polls from safe templates, did-you-know cards; deterministic seeded shuffle; per-platform fit (IG poll 2 / IG quiz 4 / YouTube 5 / X 4).",
    commands: [
      { name: "quizpoll", input: { type: "object", properties: { text: { type: "string" }, lang: { enum: ["en", "ne", "auto"] }, maxQuiz: { type: "integer" }, maxPolls: { type: "integer" }, seed: { type: "integer" } }, required: ["text"] }, output: "{ lang, quiz:Item[], polls:Item[], didYouKnow:Item[], warnings }" },
      { name: "numberDistractors", input: { type: "object", properties: { raw: { type: "string" }, count: { type: "integer" } }, required: ["raw"] }, output: "string[]" },
    ],
  };
}
