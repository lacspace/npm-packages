import { LICENSE_META, supportedIds, templateOf } from "./spdx.js";

/** A single licence-detection candidate. */
export interface DetectMatch {
  /** Canonical SPDX id. */
  id: string;
  /** Total characters of template body matched (used to rank overlapping licences). */
  score: number;
}

const PLACEHOLDER = /\{\{\s*(?:year|holder)\s*\}\}/g;

/**
 * Whitespace/case-insensitive normalization used for fuzzy matching. Collapses
 * all runs of whitespace (spaces, tabs, CR, LF) to a single space, lowercases,
 * and trims — so CRLF vs LF and re-wrapped paragraphs compare equal.
 */
export function normalizeLicenseText(text: string): string {
  return text.replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Split a template into its fixed, placeholder-free segments (normalized).
 * A licence matches a candidate when every fixed segment appears in it.
 */
function fixedSegments(template: string): string[] {
  return template
    .split(PLACEHOLDER)
    .map((s) => normalizeLicenseText(s))
    .filter((s) => s.length >= 24);
}

/**
 * Detect which supported licence a LICENSE file's text is, robust to CRLF and
 * whitespace differences and to filled copyright fields. Returns the best match
 * or `null`. When several licences match (e.g. a GPL family text embedded in a
 * larger one), the one with the most matched body text wins.
 */
export function detectLicense(text: string): string | null {
  const matches = detectMatches(text);
  return matches.length ? matches[0]!.id : null;
}

/** All matching licences, best (highest score) first. */
export function detectMatches(text: string): DetectMatch[] {
  const hay = normalizeLicenseText(text);
  const out: DetectMatch[] = [];
  for (const id of supportedIds()) {
    const segs = fixedSegments(templateOf(id));
    if (!segs.length) continue;
    let ok = true;
    let score = 0;
    for (const s of segs) {
      if (hay.includes(s)) {
        score += s.length;
      } else {
        ok = false;
        break;
      }
    }
    if (ok) out.push({ id, score });
  }
  out.sort((a, b) => b.score - a.score);
  return out;
}

/**
 * Does a LICENSE text match a specific expected SPDX id? Fuzzy on whitespace.
 */
export function licenseMatches(text: string, expectedId: string): boolean {
  const detected = detectLicense(text);
  if (!detected) return false;
  return sameLicense(detected, expectedId);
}

/**
 * Compare two licence ids for equality, tolerating case, aliases and the
 * `-only`/`-or-later` and `GPL-3.0` vs `GPL-3.0-only` style differences.
 */
export function sameLicense(a: string, b: string): boolean {
  const canon = (x: string): string => {
    const t = x.trim().toLowerCase().replace(/\+$/, "-or-later");
    // fold -only / -or-later suffixes to a common stem for comparison
    return t.replace(/-(only|or-later)$/, "");
  };
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return true;
  // resolve through metadata canonical ids where possible
  const ca = LICENSE_META[a] ? a : a;
  const cb = LICENSE_META[b] ? b : b;
  return canon(ca) === canon(cb);
}
