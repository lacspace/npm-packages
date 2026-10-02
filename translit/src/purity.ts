/**
 * Script purity: detect (and where unambiguous, repair) characters from look-alike Indic blocks
 * that LLMs sometimes emit inside Devanagari words — e.g. Gurmukhi vowel sign ਾ (U+0A3E) for
 * Devanagari ा (U+093E). Indic blocks share the same layout (ISCII order), so a confusable can
 * be mapped by offset when the target code point is a valid Devanagari character of the same class.
 */

export type IndicScript = "devanagari" | "bengali" | "gurmukhi" | "gujarati" | "oriya" | "tamil" | "telugu" | "kannada" | "malayalam";

const BLOCKS: Record<IndicScript, [number, number]> = {
  devanagari: [0x0900, 0x097f],
  bengali: [0x0980, 0x09ff],
  gurmukhi: [0x0a00, 0x0a7f],
  gujarati: [0x0a80, 0x0aff],
  oriya: [0x0b00, 0x0b7f],
  tamil: [0x0b80, 0x0bff],
  telugu: [0x0c00, 0x0c7f],
  kannada: [0x0c80, 0x0cff],
  malayalam: [0x0d00, 0x0d7f],
};

/** Devanagari code points that exist (not every slot in the block is assigned in every script). */
function isAssignedDevanagari(cp: number): boolean {
  if (cp < 0x0900 || cp > 0x097f) return false;
  // Unassigned / reserved in the Devanagari block as of Unicode 15: none in 0900–097F — all assigned.
  return true;
}

function scriptOf(cp: number): IndicScript | undefined {
  for (const [name, [lo, hi]] of Object.entries(BLOCKS) as Array<[IndicScript, [number, number]]>) if (cp >= lo && cp <= hi) return name;
  return undefined;
}

/** Character class by ISCII offset — vowel signs, consonants, independent vowels, digits, signs. */
function classOf(offset: number): "sign" | "vowel" | "consonant" | "matra" | "virama" | "nukta" | "digit" | "other" {
  if (offset <= 0x03) return "sign"; // candrabindu/anusvara/visarga
  if (offset >= 0x05 && offset <= 0x14) return "vowel";
  if (offset >= 0x15 && offset <= 0x39) return "consonant";
  if (offset === 0x3c) return "nukta";
  if (offset >= 0x3e && offset <= 0x4c) return "matra";
  if (offset === 0x4d) return "virama";
  if (offset >= 0x66 && offset <= 0x6f) return "digit";
  return "other";
}

export interface PurityIssue {
  index: number;
  char: string;
  codePoint: string;
  script: IndicScript | "other";
  /** Devanagari replacement when the mapping is unambiguous. */
  suggested?: string;
  /** The word the character sits in. */
  word: string;
}

export interface PurityResult {
  pure: boolean;
  /** Text with every unambiguous confusable mapped to Devanagari. */
  fixed: string;
  issues: PurityIssue[];
  /** Issues that could NOT be auto-fixed (still present in `fixed`). */
  unresolved: PurityIssue[];
}

/**
 * Check that Indic text uses only the expected script. Characters from other Indic blocks that
 * sit inside a word of the target script are reported; vowel signs, consonants, nukta, virama,
 * digits and nasal signs are auto-mapped by block offset when the Devanagari slot is valid.
 * Pure Latin/punctuation/whitespace is ignored. Only `target: "devanagari"` auto-fixes today;
 * other targets report issues.
 */
export function scriptPurity(text: string, target: IndicScript = "devanagari"): PurityResult {
  const issues: PurityIssue[] = [];
  const unresolved: PurityIssue[] = [];
  const out: string[] = [];
  const chars = [...text];
  const [tlo] = BLOCKS[target];
  // Pre-compute word spans for reporting.
  const wordAt = (i: number): string => {
    let a = i, b = i;
    const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{M}\p{N}]/u.test(c);
    while (a > 0 && isWordChar(chars[a - 1])) a--;
    while (b < chars.length - 1 && isWordChar(chars[b + 1])) b++;
    return chars.slice(a, b + 1).join("");
  };
  for (let i = 0; i < chars.length; i++) {
    const c = chars[i]!;
    const cp = c.codePointAt(0)!;
    const s = scriptOf(cp);
    if (!s || s === target) { out.push(c); continue; }
    // Foreign Indic char. Is it inside a target-script word? (neighbour in target block)
    const prev = chars[i - 1]?.codePointAt(0), next = chars[i + 1]?.codePointAt(0);
    const inTargetWord = (prev !== undefined && scriptOf(prev) === target) || (next !== undefined && scriptOf(next) === target);
    const issue: PurityIssue = { index: i, char: c, codePoint: "U+" + cp.toString(16).toUpperCase().padStart(4, "0"), script: s, word: wordAt(i) };
    if (!inTargetWord) {
      // A whole foreign-script word (e.g. a Hindi/Bengali quote) is reported but not touched.
      issues.push(issue); unresolved.push(issue); out.push(c); continue;
    }
    const offset = cp - BLOCKS[s][0];
    const cls = classOf(offset);
    const candidate = tlo + offset;
    if (target === "devanagari" && cls !== "other" && isAssignedDevanagari(candidate) && classOf(candidate - tlo) === cls) {
      issue.suggested = String.fromCodePoint(candidate);
      issues.push(issue);
      out.push(issue.suggested);
    } else {
      issues.push(issue); unresolved.push(issue); out.push(c);
    }
  }
  return { pure: issues.length === 0, fixed: out.join(""), issues, unresolved };
}
