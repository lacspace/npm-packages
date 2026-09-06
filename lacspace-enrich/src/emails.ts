/**
 * Email-pattern guessing — from a person's name + a domain, produce the likely
 * addresses (`first.last@`, `flast@`, `first@`, …) ranked by how common the
 * pattern is. If a known email at the domain reveals the actual pattern, that
 * pattern is boosted to the top. All pure and unit-tested.
 */
import type { EmailGuess } from "./types.js";

/** Strip accents and non-letters from a name part, lower-cased. */
function slug(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

/** Split a full name into {first, last, middle[]}. Pure. */
export function splitName(name: string): { first: string; last: string; middle: string[] } {
  const parts = name.trim().split(/\s+/).map(slug).filter(Boolean);
  if (parts.length === 0) return { first: "", last: "", middle: [] };
  if (parts.length === 1) return { first: parts[0]!, last: "", middle: [] };
  return { first: parts[0]!, last: parts[parts.length - 1]!, middle: parts.slice(1, -1) };
}

/** The ordered pattern catalogue: id → builder + base confidence. */
interface Pattern { id: string; build: (n: { first: string; last: string }) => string | undefined; weight: number }
const PATTERNS: Pattern[] = [
  { id: "first.last", weight: 0.95, build: (n) => (n.first && n.last ? `${n.first}.${n.last}` : undefined) },
  { id: "first", weight: 0.85, build: (n) => n.first || undefined },
  { id: "flast", weight: 0.8, build: (n) => (n.first && n.last ? `${n.first[0]}${n.last}` : undefined) },
  { id: "firstl", weight: 0.6, build: (n) => (n.first && n.last ? `${n.first}${n.last[0]}` : undefined) },
  { id: "first_last", weight: 0.6, build: (n) => (n.first && n.last ? `${n.first}_${n.last}` : undefined) },
  { id: "firstlast", weight: 0.55, build: (n) => (n.first && n.last ? `${n.first}${n.last}` : undefined) },
  { id: "lastfirst", weight: 0.4, build: (n) => (n.first && n.last ? `${n.last}${n.first}` : undefined) },
  { id: "last.first", weight: 0.4, build: (n) => (n.first && n.last ? `${n.last}.${n.first}` : undefined) },
  { id: "last", weight: 0.35, build: (n) => n.last || undefined },
  { id: "f.last", weight: 0.35, build: (n) => (n.first && n.last ? `${n.first[0]}.${n.last}` : undefined) },
  { id: "fl", weight: 0.25, build: (n) => (n.first && n.last ? `${n.first[0]}${n.last[0]}` : undefined) },
];

/**
 * Detect which pattern a KNOWN email at `domain` uses, given the person's name.
 * Returns the pattern id (e.g. `first.last`) or undefined if it doesn't match.
 * Pure.
 */
export function detectPatternFromEmail(email: string, name: string): string | undefined {
  const at = email.lastIndexOf("@");
  if (at < 0) return undefined;
  const local = email.slice(0, at).toLowerCase();
  const { first, last } = splitName(name);
  if (!first) return undefined;
  for (const p of PATTERNS) {
    if (p.build({ first, last }) === local) return p.id;
  }
  return undefined;
}

export interface GuessOptions {
  /** Cap the number of guesses returned. Default: all buildable patterns. */
  limit?: number;
  /**
   * A known email for THIS same person — its pattern is promoted to confidence
   * 1 (e.g. you already have one form of their address).
   */
  knownEmail?: string;
  /**
   * A colleague's known name + email at the domain. Reveals the ORG's address
   * pattern, which is then promoted to confidence 1 for the target person.
   */
  knownContact?: { name: string; email: string };
  /** Restrict to these pattern ids (in this order of preference). */
  patterns?: string[];
}

/**
 * Guess likely email addresses for `name` at `domain`, ranked by confidence.
 * If a known email/contact reveals the org's real pattern, that address ranks
 * first at confidence 1 and the rest are de-emphasised. Pure.
 */
export function guessEmails(name: string, domain: string, opts: GuessOptions = {}): EmailGuess[] {
  const parts = splitName(name);
  const dom = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0]!.toLowerCase();
  const known = opts.knownContact
    ? detectPatternFromEmail(opts.knownContact.email, opts.knownContact.name)
    : opts.knownEmail
      ? detectPatternFromEmail(opts.knownEmail, name)
      : undefined;

  let pool = PATTERNS;
  if (opts.patterns?.length) {
    const order = new Map(opts.patterns.map((id, i) => [id, i]));
    pool = PATTERNS.filter((p) => order.has(p.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }

  const seen = new Set<string>();
  const guesses: EmailGuess[] = [];
  for (const p of pool) {
    const local = p.build(parts);
    if (!local) continue;
    const email = `${local}@${dom}`;
    if (seen.has(email)) continue;
    seen.add(email);
    const confidence = known ? (p.id === known ? 1 : Math.min(p.weight, 0.5)) : p.weight;
    guesses.push({ email, pattern: p.id, confidence });
  }
  guesses.sort((a, b) => b.confidence - a.confidence);
  return typeof opts.limit === "number" ? guesses.slice(0, Math.max(0, opts.limit)) : guesses;
}
