import { parseAnyDate, normalizeDigits, Lang } from "./parse.js";
import { bsToAd, BS_MIN_YEAR, BS_MAX_YEAR } from "./bs.js";

export interface TextStalenessOptions {
  now?: Date;
  /** Articles whose newest dated mention is older than this are stale. */
  maxAgeDays: number;
  lang?: Lang;
}

export interface TextStalenessResult {
  stale: boolean;
  signals: string[];
  newestMention: Date | null;
  oldestMention: Date | null;
  /** 0–1: higher when backed by explicit dates or a relative "today". */
  confidence: number;
}

interface Mention {
  date: Date;
  raw: string;
  kind: "date" | "year" | "relative";
}

const DAY = 86400000;

function stripTags(s: string): string {
  return s.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

/**
 * Decide whether an article's BODY TEXT reads as stale — it talks only about events
 * older than `maxAgeDays`, with no recent mention. "Fresh" needs at least one dated
 * mention inside the window, or a relative "today/yesterday/आज/हिजो". Historical
 * background in otherwise-fresh news does not trip it (a single recent mention is
 * enough to keep it fresh). Deterministic.
 */
export function textStaleness(text: string, options: TextStalenessOptions): TextStalenessResult {
  const now = options.now ?? new Date();
  const windowStart = now.getTime() - options.maxAgeDays * DAY;
  const body = stripTags(text ?? "");
  const mentions: Mention[] = [];
  let hasRecentRelative = false;

  // 1) Relative recency words.
  if (/\btoday\b|just now|moments? ago/i.test(body) || /आज|भर्खरै|अहिले/.test(body)) {
    hasRecentRelative = true;
    mentions.push({ date: now, raw: "today", kind: "relative" });
  }
  if (/\byesterday\b/i.test(body) || /हिजो/.test(body)) {
    hasRecentRelative = true;
    mentions.push({ date: new Date(now.getTime() - DAY), raw: "yesterday", kind: "relative" });
  }
  for (const m of body.match(/\d+\s*(?:hour|minute|day)s?\s*(?:ago|back)|[०-९\d]+\s*\S+\s*(?:अगाडि|अघि|पहिले)/gi) ?? []) {
    const d = parseAnyDate(m, { now });
    if (d && d.getTime() >= windowStart) {
      hasRecentRelative = true;
      mentions.push({ date: d, raw: m.trim(), kind: "relative" });
    }
  }

  // 2) Explicit dates (English / ISO / BS) anywhere in the body.
  const windows = body.match(
    /(?:वि\.?\s*सं\.?|बि\.?\s*सं\.?)?\s*[A-Za-z०-९\d][^.?!\n]{0,24}?(?:[०-९\d]{1,4})/g,
  ) ?? [];
  const seen = new Set<string>();
  for (const w of windows) {
    const d = parseAnyDate(w, { now });
    if (d) {
      const key = `${d.getTime()}`;
      if (!seen.has(key)) {
        seen.add(key);
        mentions.push({ date: d, raw: w.trim(), kind: "date" });
      }
    }
  }

  // 3) Bare years — AD (Latin) and BS (Devanagari digits), mapped to the LATEST day of
  //    that year so a current-year mention is not wrongly treated as old.
  const nowYear = now.getUTCFullYear();
  for (const m of body.match(/\b(?:19|20)\d{2}\b/g) ?? []) {
    const y = Number(m);
    if (y >= 1990 && y <= nowYear + 1) {
      const end = Math.min(Date.UTC(y, 11, 31), now.getTime());
      mentions.push({ date: new Date(end), raw: m, kind: "year" });
    }
  }
  for (const m of body.match(/[०-९]{4}/g) ?? []) {
    const y = Number(normalizeDigits(m));
    if (y >= BS_MIN_YEAR && y <= BS_MAX_YEAR) {
      try {
        const lastMonthStart = bsToAd(y, 12, 1).getTime();
        mentions.push({ date: new Date(Math.min(lastMonthStart, now.getTime())), raw: m, kind: "year" });
      } catch {
        /* ignore */
      }
    }
  }

  if (!mentions.length) {
    return { stale: false, signals: ["no dated content found"], newestMention: null, oldestMention: null, confidence: 0.2 };
  }

  let newest = mentions[0]!.date;
  let oldest = mentions[0]!.date;
  for (const m of mentions) {
    if (m.date.getTime() > newest.getTime()) newest = m.date;
    if (m.date.getTime() < oldest.getTime()) oldest = m.date;
  }

  const recent = hasRecentRelative || newest.getTime() >= windowStart;
  const hasExplicit = mentions.some((m) => m.kind === "date");
  const signals: string[] = [];
  let confidence: number;

  if (recent) {
    signals.push(hasRecentRelative ? "relative recency marker present" : "a dated mention falls inside the window");
    confidence = hasRecentRelative ? 0.7 : hasExplicit ? 0.8 : 0.5;
    return { stale: false, signals, newestMention: newest, oldestMention: oldest, confidence };
  }

  const ageDays = Math.round((now.getTime() - newest.getTime()) / DAY);
  signals.push(`newest dated mention is ~${ageDays} days old (> ${options.maxAgeDays})`);
  if (!hasExplicit) signals.push("only bare year mentions — lower confidence");
  confidence = hasExplicit ? 0.8 : 0.5;
  return { stale: true, signals, newestMention: newest, oldestMention: oldest, confidence };
}
