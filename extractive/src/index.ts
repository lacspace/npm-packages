import { keyphrase } from "@lacspace/keyphrase";
import { extractClaims } from "@lacspace/factcheck-lite";
import { splitSentences, tokenize } from "./sentences.js";
import { textrank } from "./textrank.js";

export { splitSentences, tokenize } from "./sentences.js";
export { textrank } from "./textrank.js";

const VERSION = "1.0.0";

export type Lang = "en" | "ne" | "auto";

export interface RankedSentence {
  text: string;
  /** TextRank score, 0–1. */
  score: number;
  /** Original position in the text. */
  index: number;
}

export interface SummarizeOptions {
  /** Hard cap on sentences. Overrides `ratio`. */
  maxSentences?: number;
  /** Fraction of sentences to keep when `maxSentences` is unset. Default 0.3. */
  ratio?: number;
  lang?: Lang;
}

export interface SummarizeResult {
  summary: string;
  sentences: RankedSentence[];
  /** Every sentence with its score, in original order. */
  ranked: RankedSentence[];
}

/** Extractive TextRank summary — picks the most central sentences, in original order. */
export function summarize(text: string, options: SummarizeOptions = {}): SummarizeResult {
  const sents = splitSentences(text);
  if (!sents.length) return { summary: "", sentences: [], ranked: [] };
  const scores = textrank(sents.map(tokenize));
  const ranked: RankedSentence[] = sents.map((t, i) => ({ text: t, score: round(scores[i] ?? 0), index: i }));
  const want = Math.max(1, options.maxSentences ?? Math.round(sents.length * (options.ratio ?? 0.3)));
  const chosen = [...ranked]
    .sort((a, b) => b.score - a.score)
    .slice(0, want)
    .sort((a, b) => a.index - b.index);
  return { summary: chosen.map((s) => s.text).join(" "), sentences: chosen, ranked };
}

export interface KeyFacts {
  numbers: unknown[];
  amounts: unknown[];
  percentages: unknown[];
  dates: unknown[];
  /** Named entities (people/places/orgs), merged from fact + keyphrase extraction. */
  entities: string[];
}

/** Pull the hard facts an AI writer must not change — numbers, money, %, dates, entities. */
export function keyFacts(text: string): KeyFacts {
  const claims = extractClaims(text);
  const kp = keyphrase(text);
  const entities = new Set<string>();
  for (const e of claims.entities) entities.add(e.value || e.raw);
  for (const e of kp.entities) entities.add(e.text);
  return {
    numbers: claims.numbers,
    amounts: claims.amounts,
    percentages: claims.percentages,
    dates: claims.dates,
    entities: [...entities],
  };
}

/** Candidate headlines: the lead sentence plus the shortest high-ranked ones. */
export function headlineCandidates(text: string, options: { max?: number } = {}): string[] {
  const max = options.max ?? 3;
  const { ranked } = summarize(text, { maxSentences: Math.max(5, max * 2) });
  if (!ranked.length) return [];
  const clean = (s: string) => s.replace(/[।॥.]+$/u, "").trim();
  const out: string[] = [];
  const add = (s: string) => {
    const c = clean(s);
    if (c && c.length <= 120 && !out.includes(c)) out.push(c);
  };
  add(ranked[0]!.text); // the lead
  for (const s of [...ranked].sort((a, b) => b.score - a.score)) {
    if (out.length >= max) break;
    if (s.text.length <= 100) add(s.text);
  }
  return out.slice(0, max);
}

export interface Brief {
  summary: string;
  headlineCandidates: string[];
  keyphrases: string[];
  hashtags: string[];
  keyFacts: KeyFacts;
  sentenceCount: number;
}

/**
 * A compact brief for an AI writer: a short extractive summary, headline candidates,
 * key phrases/hashtags, and the hard facts — so the model rewrites a fraction of the
 * text instead of ingesting the whole article. Deterministic; no LLM.
 */
export function brief(text: string, options: SummarizeOptions = {}): Brief {
  const s = summarize(text, { ratio: 0.25, ...options });
  const kp = keyphrase(text, { max: 10 } as any);
  return {
    summary: s.summary,
    headlineCandidates: headlineCandidates(text),
    keyphrases: kp.phrases.slice(0, 10).map((p: any) => p.phrase),
    hashtags: kp.phrases.slice(0, 6).map((p: any) => "#" + p.phrase.replace(/\s+/g, "")),
    keyFacts: keyFacts(text),
    sentenceCount: s.ranked.length,
  };
}

/** Machine-readable capability + options descriptor for an AI "conductor". */
export function describe() {
  return {
    name: "@lacspace/extractive",
    version: VERSION,
    summary: "Extractive TextRank summary, key-facts and headline candidates (en + ne) — a compact brief so an AI writer spends few tokens.",
    commands: [
      {
        name: "summarize",
        input: {
          type: "object",
          properties: {
            text: { type: "string" },
            maxSentences: { type: "integer", minimum: 1 },
            ratio: { type: "number", minimum: 0.05, maximum: 1 },
            lang: { enum: ["en", "ne", "auto"] },
          },
          required: ["text"],
        },
        output: "{ summary, sentences[], ranked[] }",
      },
      { name: "keyFacts", input: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, output: "{ numbers, amounts, percentages, dates, entities }" },
      { name: "headlineCandidates", input: { type: "object", properties: { text: { type: "string" }, max: { type: "integer" } }, required: ["text"] }, output: "string[]" },
      { name: "brief", input: { type: "object", properties: { text: { type: "string" } }, required: ["text"] }, output: "{ summary, headlineCandidates, keyphrases, hashtags, keyFacts, sentenceCount }" },
    ],
  };
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
