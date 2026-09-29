import { bm25 } from "@lacspace/rerank";
import { countTokens } from "@lacspace/tokenizer";
import { hasEntity, hasNumber, hasQuote, jaccard, shingles } from "./features.js";
import { splitSentences } from "./sentences.js";

export { splitSentences } from "./sentences.js";
export type { Sentence } from "./sentences.js";

/** One input article about the story. */
export interface CondenseSource {
  text: string;
  /** Short label used in the grouped output header, e.g. "Kathmandu Post". Defaults to "S{n}". */
  label?: string;
  url?: string;
  publishedAt?: string | Date;
}

export interface CondenseOptions {
  /** Total token budget for the condensed digest. Default 1500. */
  tokenBudget?: number;
  /** Cap on kept sentences from any single source, so one long article can't crowd out the rest. Default 8. */
  maxSentencesPerSource?: number;
  /** Drop a sentence whose 3-gram Jaccard similarity to an already-kept sentence is ≥ this. Default 0.8. */
  dedupeThreshold?: number;
  /** Always keep each source's first sentence (the lede) regardless of score. Default true. */
  keepLede?: boolean;
  /** Named entities (people/places) to always keep and to boost — pass en and ne forms. */
  gazetteer?: string[];
  /** Model hint for token counting (passed to @lacspace/tokenizer). */
  model?: string;
  /** Override token counting entirely. Default: @lacspace/tokenizer countTokens. */
  countTokens?: (text: string) => number;
  /** Header format for each source group. Default `[S{n} {label}]`. */
  header?: (source: { idx: number; label: string; url?: string }) => string;
}

export interface CondensedSentence {
  text: string;
  /** Index of the source this sentence came from (0-based). */
  sourceIdx: number;
  /** Character offsets in that source's original text. */
  start: number;
  end: number;
  /** BM25 centrality score within the cluster. */
  score: number;
  /** Why it was kept: any of "lede", "number", "quote", "entity", "rank". */
  reasons: string[];
}

export interface CondensedSource {
  idx: number;
  label: string;
  url?: string;
  sentences: CondensedSentence[];
}

export interface CondenseResult {
  /** The digest: kept sentences grouped per source (source order) under a header line. */
  text: string;
  /** Kept sentences grouped per source, each in the source's original order. */
  sources: CondensedSource[];
  /** All kept sentences, flat, in output (source-grouped) order. */
  sentences: CondensedSentence[];
  /** Token count of `text` (same counter used for the budget). */
  tokens: number;
  /** How many near-duplicate sentences were dropped. */
  droppedDup: number;
  /** Total sentences seen across all sources. */
  totalSentences: number;
}

interface Candidate {
  text: string;
  sourceIdx: number;
  start: number;
  end: number;
  order: number; // global index for stable ties
  score: number;
  lede: boolean;
  number: boolean;
  quote: boolean;
  entity: boolean;
  shingle: Set<string>;
  tokens: number;
}

/**
 * Condense several sources on the same story into one short, deduplicated,
 * token-budgeted digest that keeps the numbers, quotes and named entities — so
 * an LLM only rewrites a fraction of the words. Purely extractive and
 * deterministic; no network, no model.
 */
export function condense(sources: CondenseSource[], options: CondenseOptions = {}): CondenseResult {
  const tokenBudget = options.tokenBudget ?? 1500;
  const maxPer = options.maxSentencesPerSource ?? 8;
  const dedupe = options.dedupeThreshold ?? 0.8;
  const keepLede = options.keepLede ?? true;
  const count = options.countTokens ?? ((t: string) => countTokens(t, options.model));
  const gaz = options.gazetteer && options.gazetteer.length ? new Set(options.gazetteer) : null;
  const header =
    options.header ?? ((s: { idx: number; label: string }) => `[S${s.idx + 1} ${s.label}]`);

  const labels = sources.map((s, i) => s.label?.trim() || `S${i + 1}`);

  // 1. Split every source into sentences with offsets.
  const cands: Candidate[] = [];
  let order = 0;
  sources.forEach((src, sIdx) => {
    const sents = splitSentences(src.text ?? "");
    sents.forEach((sen, localIdx) => {
      cands.push({
        text: sen.text,
        sourceIdx: sIdx,
        start: sen.start,
        end: sen.end,
        order: order++,
        score: 0,
        lede: localIdx === 0,
        number: hasNumber(sen.text),
        quote: hasQuote(sen.text),
        entity: hasEntity(sen.text, gaz),
        shingle: shingles(sen.text),
        tokens: count(sen.text),
      });
    });
  });
  const totalSentences = cands.length;
  if (totalSentences === 0) {
    return { text: "", sources: [], sentences: [], tokens: 0, droppedDup: 0, totalSentences: 0 };
  }

  // 2. Score sentence centrality with BM25 against the whole cluster.
  const clusterQuery = cands.map((c) => c.text).join(" ");
  const scored = bm25(
    clusterQuery,
    cands.map((c) => ({ id: String(c.order), text: c.text })),
  );
  const scoreById = new Map(scored.map((s) => [s.id, s.rerankScore]));
  for (const c of cands) c.score = scoreById.get(String(c.order)) ?? 0;

  // 3. Priority: always-keep (lede/number/quote/entity) first, then by score.
  //    Deterministic tie-break by global order.
  const priority = (c: Candidate) =>
    (keepLede && c.lede ? 4 : 0) + (c.quote ? 3 : 0) + (c.number ? 2 : 0) + (c.entity ? 1 : 0);
  const ranked = [...cands].sort((a, b) => {
    const pa = priority(a);
    const pb = priority(b);
    if (pa !== pb) return pb - pa;
    if (b.score !== a.score) return b.score - a.score;
    return a.order - b.order;
  });

  // 4. Greedy selection: dedupe against kept, respect per-source cap and budget.
  const kept: Candidate[] = [];
  const keptShingles: Set<string>[] = [];
  const perSource = new Map<number, number>();
  let used = 0;
  let droppedDup = 0;

  for (const c of ranked) {
    let dup = false;
    for (const ks of keptShingles) {
      if (jaccard(c.shingle, ks) >= dedupe) {
        dup = true;
        break;
      }
    }
    if (dup) {
      droppedDup++;
      continue;
    }
    if ((perSource.get(c.sourceIdx) ?? 0) >= maxPer) continue;
    if (used + c.tokens > tokenBudget && kept.length > 0) continue; // keep at least one
    kept.push(c);
    keptShingles.push(c.shingle);
    perSource.set(c.sourceIdx, (perSource.get(c.sourceIdx) ?? 0) + 1);
    used += c.tokens;
  }

  // 5. Group kept sentences per source, each in original reading order.
  const bySource = new Map<number, Candidate[]>();
  for (const c of kept) {
    const arr = bySource.get(c.sourceIdx) ?? [];
    arr.push(c);
    bySource.set(c.sourceIdx, arr);
  }

  const toOut = (c: Candidate): CondensedSentence => {
    const reasons: string[] = [];
    if (keepLede && c.lede) reasons.push("lede");
    if (c.quote) reasons.push("quote");
    if (c.number) reasons.push("number");
    if (c.entity) reasons.push("entity");
    if (reasons.length === 0) reasons.push("rank");
    return { text: c.text, sourceIdx: c.sourceIdx, start: c.start, end: c.end, score: c.score, reasons };
  };

  const outSources: CondensedSource[] = [];
  const flat: CondensedSentence[] = [];
  const parts: string[] = [];
  sources.forEach((src, sIdx) => {
    const list = (bySource.get(sIdx) ?? []).sort((a, b) => a.start - b.start);
    if (list.length === 0) return;
    const outSents = list.map(toOut);
    outSources.push({ idx: sIdx, label: labels[sIdx]!, url: src.url, sentences: outSents });
    flat.push(...outSents);
    parts.push(`${header({ idx: sIdx, label: labels[sIdx]!, url: src.url })}\n${outSents.map((s) => s.text).join(" ")}`);
  });

  const text = parts.join("\n\n");
  return { text, sources: outSources, sentences: flat, tokens: count(text), droppedDup, totalSentences };
}
