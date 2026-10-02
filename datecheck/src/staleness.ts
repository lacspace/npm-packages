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
  /** The article's dated events are in the FUTURE (an upcoming-event piece). */
  upcoming: boolean;
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

  // 2) Explicit dates (English / ISO / BS), keeping full day precision (never lumped
  //    into the year). Each window holds a whole day+month+year so "20 December 2026"
  //    is read as one date. Future dates are allowed so upcoming events are detected.
  const nbody = normalizeDigits(body);
  const DATE_WINDOWS: RegExp[] = [
    /\d{1,2}(?:st|nd|rd|th)?\s*(?:साल\s*)?[A-Za-zऀ-ॿ]{2,14}\.?,?\s*\d{4}/g, // DMY
    /[A-Za-zऀ-ॿ]{2,14}\.?\s*\d{1,2}(?:st|nd|rd|th)?\s*,?\s*\d{4}/g, // MDY
    /\d{4}\s*(?:साल\s*)?[A-Za-zऀ-ॿ]{2,14}\.?\s*\d{1,2}/g, // YMD
    /\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?/g, // ISO
  ];
  const windows: string[] = [];
  for (const re of DATE_WINDOWS) windows.push(...(nbody.match(re) ?? []));
  const seen = new Set<string>();
  const explicitYears = new Set<number>();
  for (const w of windows) {
    const d = parseAnyDate(w, { now, allowFuture: true });
    if (d) {
      const key = `${d.getTime()}`;
      if (!seen.has(key)) {
        seen.add(key);
        mentions.push({ date: d, raw: w.trim(), kind: "date" });
        explicitYears.add(d.getUTCFullYear());
      }
    }
  }

  // 3) Bare years — AD (Latin) and BS (Devanagari digits). A year already covered by an
  //    explicit date is skipped, so "September 10, 2019" stays the day, not Dec 31 2019.
  const nowYear = now.getUTCFullYear();
  for (const m of body.match(/\b(?:19|20)\d{2}\b/g) ?? []) {
    const y = Number(m);
    if (y >= 1990 && y <= nowYear + 1 && !explicitYears.has(y)) {
      const end = Math.min(Date.UTC(y, 11, 31), now.getTime());
      mentions.push({ date: new Date(end), raw: m, kind: "year" });
    }
  }
  for (const m of body.match(/[०-९]{4}/g) ?? []) {
    const y = Number(normalizeDigits(m));
    if (y >= BS_MIN_YEAR && y <= BS_MAX_YEAR) {
      try {
        const adYear = bsToAd(y, 1, 1).getUTCFullYear();
        if (explicitYears.has(adYear) || explicitYears.has(adYear + 1)) continue;
        const lastMonthStart = bsToAd(y, 12, 1).getTime();
        mentions.push({ date: new Date(Math.min(lastMonthStart, now.getTime())), raw: m, kind: "year" });
      } catch {
        /* ignore */
      }
    }
  }

  if (!mentions.length) {
    return { stale: false, upcoming: false, signals: ["no dated content found"], newestMention: null, oldestMention: null, confidence: 0.2 };
  }

  let newest = mentions[0]!.date;
  let oldest = mentions[0]!.date;
  let newestPast: Date | null = null;
  let hasFuture = false;
  for (const m of mentions) {
    if (m.date.getTime() > newest.getTime()) newest = m.date;
    if (m.date.getTime() < oldest.getTime()) oldest = m.date;
    if (m.date.getTime() > now.getTime() + DAY) hasFuture = true;
    else if (!newestPast || m.date.getTime() > newestPast.getTime()) newestPast = m.date;
  }

  const hasExplicit = mentions.some((m) => m.kind === "date");
  const recent = hasRecentRelative || (newestPast !== null && newestPast.getTime() >= windowStart);
  const signals: string[] = [];

  if (recent) {
    signals.push(hasRecentRelative ? "relative recency marker present" : "a dated mention falls inside the window");
    return { stale: false, upcoming: hasFuture, signals, newestMention: newest, oldestMention: oldest, confidence: hasRecentRelative ? 0.7 : hasExplicit ? 0.8 : 0.5 };
  }
  if (hasFuture) {
    signals.push("dated events are in the future — upcoming, not stale");
    return { stale: false, upcoming: true, signals, newestMention: newest, oldestMention: oldest, confidence: hasExplicit ? 0.8 : 0.5 };
  }

  const ageDays = Math.round((now.getTime() - (newestPast ?? newest).getTime()) / DAY);
  signals.push(`newest dated mention is ~${ageDays} days old (> ${options.maxAgeDays})`);
  if (!hasExplicit) signals.push("only bare year mentions — lower confidence");
  return { stale: true, upcoming: false, signals, newestMention: newest, oldestMention: oldest, confidence: hasExplicit ? 0.8 : 0.5 };
}
