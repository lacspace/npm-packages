import { matchName } from "@lacspace/translit";
import { extractDates, type DateClaim } from "./dates.js";
import { extractNumeric, normalizeDigits, type NumericClaim } from "./numbers.js";

export { normalizeDigits, extractNumeric } from "./numbers.js";
export type { NumericClaim, ClaimKind } from "./numbers.js";
export { extractDates } from "./dates.js";
export type { DateClaim } from "./dates.js";

export interface EntityClaim {
  kind: "entity";
  raw: string;
  value: string;
  start: number;
  end: number;
}

export type Claim = NumericClaim | DateClaim | EntityClaim;

export interface ExtractOptions {
  /** "en" | "ne" | "auto" — informational; extraction is script-agnostic. */
  lang?: "en" | "ne" | "auto";
  /** Known entities (any script) to always pick up, even single Devanagari words. */
  gazetteer?: string[];
}

export interface ExtractedClaims {
  numbers: NumericClaim[];
  amounts: NumericClaim[];
  percentages: NumericClaim[];
  dates: DateClaim[];
  entities: EntityClaim[];
}

function extractEntities(text: string, gazetteer: string[]): EntityClaim[] {
  const out: EntityClaim[] = [];
  const seen = new Set<string>();
  // Latin Title-Case runs of 1–4 words.
  for (const m of text.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g)) {
    const v = m[1]!;
    if (v.length < 3) continue;
    const key = `${v}@${m.index}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ kind: "entity", raw: v, value: v, start: m.index!, end: m.index! + v.length });
  }
  // Gazetteer occurrences (incl. Devanagari).
  for (const g of gazetteer) {
    if (!g) continue;
    let idx = text.indexOf(g);
    while (idx !== -1) {
      out.push({ kind: "entity", raw: g, value: g, start: idx, end: idx + g.length });
      idx = text.indexOf(g, idx + g.length);
    }
  }
  out.sort((a, b) => a.start - b.start);
  return out;
}

/** Pull every checkable claim out of a text. */
export function extractClaims(text: string, options: ExtractOptions = {}): ExtractedClaims {
  const numeric = extractNumeric(text || "");
  const dates = extractDates(text || "");
  const entities = extractEntities(text || "", options.gazetteer ?? []);
  return {
    numbers: numeric.filter((n) => n.kind === "number"),
    amounts: numeric.filter((n) => n.kind === "amount"),
    percentages: numeric.filter((n) => n.kind === "percentage"),
    dates,
    entities,
  };
}

export interface VerifyOptions {
  lang?: "en" | "ne" | "auto";
  gazetteer?: string[];
  /** Relative tolerance for numeric matching (0 = exact). e.g. 0.01 allows ±1%. Default 0. */
  numberTolerance?: number;
  /** Verify named entities against the sources too (cross-script). Default true. */
  checkEntities?: boolean;
  /** Similarity threshold for cross-script entity matching. Default 0.82. */
  entityThreshold?: number;
}

export interface Mismatch {
  type: "number" | "amount" | "percentage" | "date" | "entity";
  raw: string;
  value: string | number;
  currency?: string;
  /** Always true — the claim is in the article. */
  inArticle: true;
  /** Whether it was found in / derivable from the sources. */
  inSources: false;
  /** Closest value seen in the sources, if any. */
  nearest?: string | number;
  note: string;
}

export interface VerifyResult {
  ok: boolean;
  /** Claims present in the article but not supported by the sources. */
  mismatches: Mismatch[];
  /** Count of claims checked. */
  checked: number;
  /** Count of claims supported. */
  matched: number;
}

function numericValues(sources: string[]): { value: number; kind: string; currency?: string }[] {
  const out: { value: number; kind: string; currency?: string }[] = [];
  for (const s of sources) for (const c of extractNumeric(s)) out.push({ value: c.value, kind: c.kind, currency: c.currency });
  return out;
}

function close(a: number, b: number, tol: number): boolean {
  if (a === b) return true;
  if (tol <= 0) return false;
  const scale = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / scale <= tol;
}

/**
 * Verify that every number, amount, percentage, date and (optionally) named
 * entity in `article` appears in, or is derivable from, `sources`. Returns the
 * claims that do not — the list to fix before publishing, no LLM required.
 */
export function verify(article: string, sources: string[], options: VerifyOptions = {}): VerifyResult {
  const tol = options.numberTolerance ?? 0;
  const checkEntities = options.checkEntities ?? true;
  const entityThreshold = options.entityThreshold ?? 0.82;
  const claims = extractClaims(article, options);
  const srcNumeric = numericValues(sources);
  const srcText = sources.join("\n");
  const srcTextNorm = normalizeDigits(srcText);
  const mismatches: Mismatch[] = [];
  let checked = 0;
  let matched = 0;

  const checkNumeric = (list: NumericClaim[], type: "number" | "amount" | "percentage") => {
    for (const c of list) {
      checked++;
      const hit = srcNumeric.some((s) => close(s.value, c.value, tol));
      if (hit) {
        matched++;
        continue;
      }
      // nearest for the note
      let nearest: number | undefined;
      let bestD = Infinity;
      for (const s of srcNumeric) {
        const d = Math.abs(s.value - c.value);
        if (d < bestD) {
          bestD = d;
          nearest = s.value;
        }
      }
      mismatches.push({
        type,
        raw: c.raw,
        value: c.value,
        ...(c.currency ? { currency: c.currency } : {}),
        inArticle: true,
        inSources: false,
        ...(nearest !== undefined ? { nearest } : {}),
        note: `${type} ${c.raw} not found in sources${nearest !== undefined ? ` (nearest ${nearest})` : ""}`,
      });
    }
  };

  checkNumeric(claims.numbers, "number");
  checkNumeric(claims.amounts, "amount");
  checkNumeric(claims.percentages, "percentage");

  for (const d of claims.dates) {
    checked++;
    const norm = normalizeDigits(d.raw);
    const hit =
      srcTextNorm.includes(d.value) ||
      srcTextNorm.includes(norm) ||
      // component match: year present at least
      (d.calendar === "AD" && srcTextNorm.includes(d.value.slice(0, 4)));
    if (hit) matched++;
    else
      mismatches.push({ type: "date", raw: d.raw, value: d.value, inArticle: true, inSources: false, note: `date ${d.raw} (${d.calendar}) not found in sources` });
  }

  if (checkEntities) {
    const seen = new Set<string>();
    for (const e of claims.entities) {
      const key = e.value.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      checked++;
      // direct substring OR cross-script fuzzy name match against source text
      let hit = srcText.includes(e.value);
      if (!hit) {
        // compare against source Title-Case runs + gazetteer via matchName
        const candidates = [...srcText.matchAll(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})\b/g)].map((m) => m[1]!);
        for (const g of options.gazetteer ?? []) candidates.push(g);
        hit = candidates.some((cand) => matchName(e.value, cand, { threshold: entityThreshold }).match);
      }
      if (hit) matched++;
      else mismatches.push({ type: "entity", raw: e.raw, value: e.value, inArticle: true, inSources: false, note: `entity "${e.value}" not found in sources` });
    }
  }

  return { ok: mismatches.length === 0, mismatches, checked, matched };
}
