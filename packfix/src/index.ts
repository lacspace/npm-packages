/**
 * @lacspace/packfix — targeted repair of a failed story pack instead of a whole-pack rewrite.
 *
 * fix(pack, failures, sources) handles three validator failure types:
 *  - names:      drops false positives (descriptive Title Case phrases, names that are in the
 *                sources in another script), swaps near-misspellings for the source spelling, and
 *                flags the sentences holding names that can't be backed by a source.
 *  - plagiarism: finds the sentences that share 8-word shingles with the sources, ranked, plus the
 *                smallest set to rewrite to get under the limit.
 *  - tone:       replaces listed judgement words with neutral ones; question headlines are
 *                returned for a model rewrite.
 * Anything it can't fix comes back in `remaining`, with sentence ids to re-ask the model for.
 */
import { devanagariToLatin, isDevanagari, matchName } from "@lacspace/translit";
import { COMMON, STOP, stems } from "./words.js";

export interface Pack {
  language: string;
  headline: string;
  deck?: string;
  summary?: string;
  body: string[];
  bullets?: string[];
  entities?: string[];
  tags?: string[];
  [k: string]: unknown;
}
export interface Source { n?: number; language?: string; title?: string; text: string }

export interface Sentence { id: string; text: string }
export interface Rewrite { id: string; text: string; reason: "names" | "plagiarism" | "tone"; detail: string }
export interface NameDecision {
  name: string;
  verdict: "not-a-name" | "in-source" | "respelled" | "unbacked";
  /** For "respelled": the source spelling now used. */
  replacement?: string;
}
export interface Overlap {
  /** % of the pack's body shingles found in same-language sources (sources may be truncated, so this can read lower than your validator). */
  pct: number;
  limit: number;
  /** Sentences sharing shingles with the sources, most overlap first. */
  sentences: { id: string; text: string; shared: number; shingles: number }[];
  /** Smallest set of sentence ids whose rewrite brings the overlap under the limit. */
  rewrite: string[];
}
export interface FixOptions {
  /** Plagiarism shingle size (default 8) and limit in % (default: parsed from the failure, else 3). */
  shingle?: number;
  limit?: number;
  /** Extra words to treat as common English. */
  commonWords?: string[];
  /** Known good names (gazetteer) — always accepted. */
  knownNames?: string[];
  /** Name match threshold for translit/fuzzy matching (default 0.82). */
  threshold?: number;
}
export interface FixResult {
  pack: Pack;
  fixed: string[];
  remaining: string[];
  names: NameDecision[];
  overlap?: Overlap;
  /** Sentences to send back to the model, one small call each. */
  rewrite: Rewrite[];
}

// ---------- sentences ----------
const SPLIT = /(?<=[.!?।])\s+(?=["'“‘(]?[\p{Lu}\p{Script=Devanagari}\d])/u;
export function splitSentences(text: string): string[] {
  return (text ?? "").split(SPLIT).map((s) => s.trim()).filter(Boolean);
}
/** Stable sentence ids: headline, deck, summary.N, body.P.N, bullets.N */
export function sentences(pack: Pack): Sentence[] {
  const out: Sentence[] = [{ id: "headline", text: pack.headline }];
  if (pack.deck) out.push({ id: "deck", text: pack.deck });
  splitSentences(pack.summary ?? "").forEach((t, i) => out.push({ id: `summary.${i}`, text: t }));
  pack.body.forEach((p, pi) => splitSentences(p).forEach((t, i) => out.push({ id: `body.${pi}.${i}`, text: t })));
  (pack.bullets ?? []).forEach((t, i) => out.push({ id: `bullets.${i}`, text: t }));
  return out;
}
/** Put a rewritten sentence back by id. Returns a new pack. */
export function replaceSentence(pack: Pack, id: string, text: string): Pack {
  const p: Pack = { ...pack, body: [...pack.body], bullets: pack.bullets ? [...pack.bullets] : pack.bullets };
  const parts = id.split(".");
  const swap = (para: string, n: number) => splitSentences(para).map((s, i) => (i === n ? text.trim() : s)).filter(Boolean).join(" ");
  if (id === "headline") p.headline = text.trim();
  else if (id === "deck") p.deck = text.trim();
  else if (parts[0] === "summary") p.summary = swap(p.summary ?? "", Number(parts[1]));
  else if (parts[0] === "body") p.body[Number(parts[1])] = swap(p.body[Number(parts[1])] ?? "", Number(parts[2]));
  else if (parts[0] === "bullets" && p.bullets) p.bullets[Number(parts[1])] = text.trim();
  else throw new Error(`unknown sentence id: ${id}`);
  return p;
}
function mapText(pack: Pack, f: (s: string) => string): Pack {
  return {
    ...pack,
    headline: f(pack.headline),
    deck: pack.deck == null ? pack.deck : f(pack.deck),
    summary: pack.summary == null ? pack.summary : f(pack.summary),
    body: pack.body.map(f),
    bullets: pack.bullets?.map(f),
  };
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ---------- failure parsing ----------
export interface ParsedFailure { type: "names" | "plagiarism" | "tone" | "other"; raw: string; names?: string[]; pct?: number; limit?: number; phrases?: string[]; question?: boolean }
export function parseFailure(raw: string): ParsedFailure {
  const m = /^\s*(\w+)\s*:\s*(.*)$/s.exec(raw);
  const type = m?.[1]?.toLowerCase();
  const rest = m?.[2] ?? "";
  if (type === "names") {
    const list = rest.replace(/^.*?:\s*/, "");
    return { type, raw, names: list.split(/,\s+/).map((s) => s.trim()).filter(Boolean) };
  }
  if (type === "plagiarism") {
    const pct = /([\d.]+)\s*%/.exec(rest);
    const lim = /limit\s*([\d.]+)\s*%/.exec(rest);
    return { type, raw, pct: pct ? Number(pct[1]) : undefined, limit: lim ? Number(lim[1]) : undefined };
  }
  if (type === "tone") {
    const question = /question headline/i.test(rest);
    const bp = /banned phrases?\s*:\s*(.*)$/i.exec(rest);
    const phrases = bp ? bp[1]!.split(/,\s*/).map((s) => s.trim()).filter(Boolean) : [];
    return { type, raw, question, phrases };
  }
  return { type: "other", raw };
}

// ---------- names ----------
function lowerUses(texts: string[]): Set<string> {
  // words used in lower case anywhere (not just sentence-initial capitals)
  const set = new Set<string>();
  for (const t of texts) for (const w of t.match(/\b[a-z][a-z'-]{2,}\b/g) ?? []) set.add(w);
  return set;
}
function isCommonToken(tok: string, extra: Set<string>, lower: Set<string>): boolean {
  const w = tok.toLowerCase().replace(/[’']s$/, "").replace(/[^a-z-]/g, "");
  if (!w) return /^\d/.test(tok); // numbers/ordinals are not names
  if (STOP.has(w)) return true;
  return w.split("-").every((part) => stems(part).some((s) => COMMON.has(s) || extra.has(s) || lower.has(s)));
}
function capSequences(text: string): string[] {
  return text.match(/\b\p{Lu}[\p{L}'’-]*(?:\s+(?:of|and|the|de|da|bin)?\s*\p{Lu}[\p{L}'’-]*)*/gu) ?? [];
}

function decideName(name: string, ctx: { english: string[]; nepaliLatin: string[]; extra: Set<string>; lower: Set<string>; known: string[]; threshold: number }): NameDecision {
  const tokens = name.split(/\s+/).filter(Boolean);
  const content = tokens.filter((t) => !STOP.has(t.toLowerCase()));
  if (ctx.known.some((k) => k.toLowerCase() === name.toLowerCase())) return { name, verdict: "in-source" };
  const srcEn = ctx.english.join("\n");
  if (srcEn.toLowerCase().includes(name.toLowerCase())) return { name, verdict: "in-source" };
  // tokens that need backing = not common words
  const proper = content.filter((t) => !isCommonToken(t, ctx.extra, ctx.lower));
  if (!proper.length) return { name, verdict: "not-a-name" };
  const srcWordsEn = new Set((srcEn.match(/[\p{L}'’-]+/gu) ?? []).map((w) => w.toLowerCase()));
  let respelled = name;
  let allBacked = true;
  for (const t of proper) {
    const lt = t.toLowerCase();
    if (srcWordsEn.has(lt)) continue;
    // other-script source: transliterated word match
    if (ctx.nepaliLatin.some((w) => matchName(t, w, { threshold: ctx.threshold }).match)) continue;
    // same-script near-miss: swap in the source spelling
    const cands = [...new Set(capSequences(srcEn).flatMap((c) => c.split(/\s+/)))].filter((c) => /^\p{Lu}/u.test(c));
    const best = cands
      .map((c) => ({ c, r: matchName(t, c, { threshold: ctx.threshold }), d: lev(lt, c.toLowerCase()) }))
      .filter((x) => x.r.match && x.d <= Math.max(1, Math.floor(lt.length / 4)))
      .sort((a, b) => a.d - b.d || b.r.score - a.r.score)[0];
    if (best) { respelled = respelled.replace(new RegExp(`\\b${esc(t)}\\b`, "g"), best.c); continue; }
    allBacked = false;
  }
  if (!allBacked) return { name, verdict: "unbacked" };
  if (respelled !== name) return { name, verdict: "respelled", replacement: respelled };
  return { name, verdict: "in-source" };
}
function lev(a: string, b: string): number {
  const dp = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!; dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

// ---------- plagiarism ----------
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}\s]|_/gu, " ").split(/\s+/).filter(Boolean);
function shingles(tokens: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + n <= tokens.length; i++) out.push(tokens.slice(i, i + n).join(" "));
  return out;
}
export function overlap(pack: Pack, sources: Source[], options: { shingle?: number; limit?: number } = {}): Overlap {
  const n = options.shingle ?? 8;
  const limit = options.limit ?? 3;
  const lang = (pack.language ?? "").toLowerCase();
  const src = new Set<string>();
  for (const s of sources) if (!s.language || !lang || s.language.toLowerCase() === lang) for (const g of shingles(norm(s.text), n)) src.add(g);
  // body sentences, shingled per paragraph so phrases across a sentence break still count
  const rows: Overlap["sentences"] = [];
  let total = 0, shared = 0;
  pack.body.forEach((para, pi) => {
    const sents = splitSentences(para);
    const owner: number[] = [];
    const toks: string[] = [];
    sents.forEach((s, si) => norm(s).forEach((t) => { toks.push(t); owner.push(si); }));
    const counts = sents.map(() => ({ shared: 0, shingles: 0 }));
    for (let i = 0; i + n <= toks.length; i++) {
      const g = toks.slice(i, i + n).join(" ");
      const hit = src.has(g);
      total++; if (hit) shared++;
      // credit every sentence the shingle touches
      for (const si of new Set(owner.slice(i, i + n))) { counts[si]!.shingles++; if (hit) counts[si]!.shared++; }
    }
    sents.forEach((s, si) => { if (counts[si]!.shared) rows.push({ id: `body.${pi}.${si}`, text: s, ...counts[si]! }); });
  });
  rows.sort((a, b) => b.shared - a.shared || b.shared / b.shingles - a.shared / a.shingles);
  const pct = total ? Math.round((10000 * shared) / total) / 100 : 0;
  // greedy: rewrite the worst sentences until the remaining shared shingles are under the limit
  const rewrite: string[] = [];
  let left = shared;
  for (const r of rows) {
    if (total && (100 * left) / total < limit) break;
    rewrite.push(r.id); left -= r.shared;
  }
  return { pct, limit, sentences: rows, rewrite };
}

// ---------- tone ----------
interface ToneRule { re: RegExp; to: (m: string, next: string) => string | null }
const DEVICE = /^(devices?|materials?|substances?|ordnance|charges?|experts?|ordinance|remnants?|laden)\b/i;
const HERITAGE = /^(sites?|monuments?|buildings?|districts?|cities|city|centres?|centers?|core|preservation|palace|temples?|square|areas?|towns?)\b/i;
const GROWTH = /^(growth|rise|rises|increase|increases|surge|expansion|demand)\b/i;
const EN_TONE: Record<string, ToneRule> = {
  explosive: { re: /\bexplosive\b/gi, to: (_m, next) => (DEVICE.test(next) ? null : GROWTH.test(next) ? "rapid" : "aggressive") },
  massive: { re: /\bmassive\b/gi, to: () => "major" },
  huge: { re: /\bhuge\b/gi, to: () => "large" },
  shocking: { re: /\bshocking\b/gi, to: () => "unexpected" },
  stunning: { re: /\bstunning\b/gi, to: () => "notable" },
  dramatic: { re: /\bdramatic\b/gi, to: (_m, next) => (GROWTH.test(next) || /^(fall|drop|decline)/i.test(next) ? "sharp" : "notable") },
  historic: { re: /\bhistoric\b/gi, to: (_m, next) => (HERITAGE.test(next) ? null : "notable") },
  slams: { re: /\bslams\b/gi, to: () => "criticises" },
  slammed: { re: /\bslammed\b/gi, to: () => "criticised" },
  whopping: { re: /\b(?:a\s+)?whopping\s+/gi, to: () => "" },
  staggering: { re: /\b(?:a\s+)?staggering\s+(?=[\d$₹])/gi, to: () => "" },
  "skyrocketed": { re: /\bskyrocketed\b/gi, to: () => "rose sharply" },
  "skyrockets": { re: /\bskyrockets\b/gi, to: () => "rises sharply" },
};
const NE_TONE: Record<string, ToneRule> = {
  "मुख्य कुरा": { re: /मुख्य कुरा\s*[:：]?\s*/g, to: () => "" },
  "सनसनीपूर्ण": { re: /सनसनीपूर्ण/g, to: () => "उल्लेखनीय" },
  "भयानक": { re: /भयानक/g, to: () => "ठूलो" },
};
function applyCase(src: string, out: string): string {
  if (!out) return out;
  if (src === src.toUpperCase() && /[A-Z]/.test(src)) return out.toUpperCase();
  return /^[A-Z]/.test(src) ? out[0]!.toUpperCase() + out.slice(1) : out;
}
function applyTone(text: string, rule: ToneRule): { text: string; n: number } {
  let n = 0;
  const out = text.replace(rule.re, (m: string, ...args: unknown[]) => {
    const offset = args[args.length - 2] as number;
    const next = text.slice(offset + m.length).trimStart();
    const to = rule.to(m, next);
    if (to === null) return m;
    n++;
    return applyCase(m.trimStart(), to);
  });
  return { text: out.replace(/\s{2,}/g, " ").replace(/\ba ([aeiou])/gi, (m, v) => (m[0] === "A" ? "An " : "an ") + v), n };
}

// ---------- main ----------
export function fix(pack: Pack, failures: string[], sources: Source[], options: FixOptions = {}): FixResult {
  let p: Pack = JSON.parse(JSON.stringify(pack));
  const fixed: string[] = [];
  const remaining: string[] = [];
  const rewrite: Rewrite[] = [];
  const names: NameDecision[] = [];
  let ov: Overlap | undefined;
  const threshold = options.threshold ?? 0.82;
  const parsed = failures.map(parseFailure);
  const lang = (p.language ?? "en").toLowerCase();

  for (const f of parsed.filter((x) => x.type === "tone")) {
    const map = lang === "ne" ? NE_TONE : EN_TONE;
    const left: string[] = [];
    for (const phrase of f.phrases ?? []) {
      const rule = map[phrase.toLowerCase()] ?? map[phrase];
      if (!rule) { left.push(phrase); continue; }
      let count = 0;
      p = mapText(p, (s) => { const r = applyTone(s, rule); count += r.n; return r.text; });
      if (count) fixed.push(`tone: "${phrase}" replaced ${count}×`);
      // anything the rule declined (e.g. "explosive device") goes back to the model
      for (const s of sentences(p)) if (new RegExp(rule.re.source, "i").test(s.text)) rewrite.push({ id: s.id, text: s.text, reason: "tone", detail: `"${phrase}" kept: factual use? check` });
      if (sentences(p).some((s) => new RegExp(rule.re.source, "i").test(s.text))) left.push(phrase);
    }
    if (f.question) rewrite.push({ id: "headline", text: p.headline, reason: "tone", detail: "question headline → statement" });
    const parts = [left.length ? `banned phrases: ${left.join(", ")}` : "", f.question ? "question headline" : ""].filter(Boolean);
    if (parts.length) remaining.push(`tone: ${parts.join("; ")}`);
  }

  for (const f of parsed.filter((x) => x.type === "names")) {
    const english = sources.filter((s) => !s.language || s.language === "en" || !/[ऀ-ॿ]/.test(s.text)).map((s) => `${s.title ?? ""}\n${s.text}`);
    const nepali = sources.filter((s) => /[ऀ-ॿ]/.test(s.text));
    const nepaliLatin = [...new Set(nepali.flatMap((s) => (`${s.title ?? ""} ${s.text}`.match(/[ऀ-ॿ]+/g) ?? []).filter((w) => [...w].some(isDevanagari)).map(devanagariToLatin)))].filter((w) => w.length >= 3);
    const packText = sentences(p).map((s) => s.text).concat(p.tags ?? []);
    const lower = lowerUses([...packText, ...english]);
    const ctx = { english, nepaliLatin, extra: new Set((options.commonWords ?? []).map((w) => w.toLowerCase())), lower, known: options.knownNames ?? [], threshold };
    const unresolved: string[] = [];
    for (const name of f.names ?? []) {
      const d = decideName(name, ctx);
      names.push(d);
      if (d.verdict === "not-a-name") fixed.push(`names: "${name}" is a descriptive phrase, not a name`);
      else if (d.verdict === "in-source") fixed.push(`names: "${name}" is in the sources`);
      else if (d.verdict === "respelled") {
        const re = new RegExp(`\\b${esc(name)}\\b`, "g");
        p = mapText(p, (s) => s.replace(re, d.replacement!));
        p.entities = p.entities?.map((e) => e.replace(re, d.replacement!));
        p.tags = p.tags?.map((t) => (t.toLowerCase() === name.toLowerCase() ? d.replacement!.toLowerCase() : t));
        fixed.push(`names: "${name}" → "${d.replacement}" (source spelling)`);
      } else {
        unresolved.push(name);
        const before = p.entities?.length ?? 0;
        p.entities = p.entities?.filter((e) => e.toLowerCase() !== name.toLowerCase());
        if ((p.entities?.length ?? 0) < before) fixed.push(`names: removed "${name}" from entities`);
        const re = new RegExp(`\\b${esc(name)}\\b`, "i");
        for (const s of sentences(p)) if (re.test(s.text)) rewrite.push({ id: s.id, text: s.text, reason: "names", detail: `"${name}" is not in the sources` });
      }
    }
    if (unresolved.length) remaining.push(`names: names not in sources or gazetteer: ${unresolved.join(", ")}`);
  }

  for (const f of parsed.filter((x) => x.type === "plagiarism")) {
    ov = overlap(p, sources, { shingle: options.shingle, limit: options.limit ?? f.limit ?? 3 });
    const ids = ov.rewrite.length ? ov.rewrite : ov.sentences.slice(0, 1).map((s) => s.id);
    for (const id of ids) {
      const s = ov.sentences.find((x) => x.id === id);
      if (s && !rewrite.some((r) => r.id === id)) rewrite.push({ id, text: s.text, reason: "plagiarism", detail: `${s.shared}/${s.shingles} shingles shared with the sources` });
    }
    remaining.push(f.raw);
  }

  for (const f of parsed.filter((x) => x.type === "other")) remaining.push(f.raw);
  return { pack: p, fixed, remaining, names, overlap: ov, rewrite };
}

export function describe() {
  return {
    name: "@lacspace/packfix",
    version: "1.0.0",
    summary: "Targeted repair of failed story packs (names, plagiarism, tone) so only 1–2 sentences go back to the model instead of the whole pack.",
    commands: ["fix(pack, failures, sources, options)", "overlap(pack, sources, { shingle, limit })", "sentences(pack)", "replaceSentence(pack, id, text)", "parseFailure(raw)"],
  };
}
