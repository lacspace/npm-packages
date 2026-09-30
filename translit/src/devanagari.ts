// Compact Devanagari romanization tuned for names (phonetic, not strict IAST).

const INDEPENDENT: Record<string, string> = {
  "अ": "a", "आ": "aa", "इ": "i", "ई": "ii", "उ": "u", "ऊ": "uu",
  "ऋ": "ri", "ए": "e", "ऐ": "ai", "ओ": "o", "औ": "au", "ऑ": "o",
};
const MATRA: Record<string, string> = {
  "ा": "aa", "ि": "i", "ी": "ii", "ु": "u", "ू": "uu", "ृ": "ri",
  "े": "e", "ै": "ai", "ो": "o", "ौ": "au", "ॉ": "o",
};
const CONSONANT: Record<string, string> = {
  "क": "k", "ख": "kh", "ग": "g", "घ": "gh", "ङ": "ng",
  "च": "ch", "छ": "chh", "ज": "j", "झ": "jh", "ञ": "ny",
  "ट": "t", "ठ": "th", "ड": "d", "ढ": "dh", "ण": "n",
  "त": "t", "थ": "th", "द": "d", "ध": "dh", "न": "n",
  "प": "p", "फ": "ph", "ब": "b", "भ": "bh", "म": "m",
  "य": "y", "र": "r", "ल": "l", "व": "w", "श": "sh",
  "ष": "sh", "स": "s", "ह": "h", "ळ": "l",
};
const VIRAMA = "्";
const ANUSVARA = "ं"; // ं
const CHANDRABINDU = "ँ"; // ँ
const VISARGA = "ः"; // ः
const NUKTA = "़";
const DEVANAGARI_DIGITS = "०१२३४५६७८९";

export function isDevanagari(ch: string): boolean {
  return ch >= "ऀ" && ch <= "ॿ";
}

/** Best-effort phonetic romanization of Devanagari text (names, words). Deterministic. */
export function devanagariToLatin(input: string): string {
  let out = "";
  const s = input.normalize("NFC");
  for (let i = 0; i < s.length; i++) {
    let ch = s[i]!;
    // Merge a nukta into the preceding consonant (ड़ etc.) — treat as the base.
    if (s[i + 1] === NUKTA) {
      // fall through using the base consonant; skip the nukta afterward
    }
    if (CONSONANT[ch] !== undefined) {
      const base = CONSONANT[ch]!;
      let j = i + 1;
      if (s[j] === NUKTA) j++; // consume nukta
      const next = s[j];
      if (next === VIRAMA) {
        out += base;
        i = j;
      } else if (next !== undefined && MATRA[next] !== undefined) {
        out += base + MATRA[next];
        i = j;
      } else {
        // Schwa deletion: a bare consonant keeps its inherent 'a' only when it is
        // not at the end of a word (Nepali drops the final schwa: राम → raam).
        const wordFinal = next === undefined || /\s/.test(next) || !isDevanagari(next);
        out += wordFinal ? base : base + "a";
        i = j - 1;
      }
      continue;
    }
    if (INDEPENDENT[ch] !== undefined) {
      out += INDEPENDENT[ch];
      continue;
    }
    if (ch === ANUSVARA || ch === CHANDRABINDU) {
      out += "n";
      continue;
    }
    if (ch === VISARGA) {
      out += "h";
      continue;
    }
    if (ch === NUKTA || ch === VIRAMA) continue;
    const d = DEVANAGARI_DIGITS.indexOf(ch);
    if (d !== -1) {
      out += String(d);
      continue;
    }
    out += ch; // spaces, Latin, punctuation pass through
  }
  return out;
}

// --- Latin → Devanagari (best-effort; longest-match digraphs first) ------------

const LATIN_CONSONANT: [string, string][] = [
  ["chh", "छ"], ["ch", "च"], ["kh", "ख"], ["gh", "घ"], ["ng", "ङ"],
  ["jh", "झ"], ["th", "थ"], ["dh", "ध"], ["ph", "फ"], ["bh", "भ"],
  ["sh", "श"], ["ny", "ञ"],
  ["k", "क"], ["g", "ग"], ["j", "ज"], ["t", "त"], ["d", "द"],
  ["n", "न"], ["p", "प"], ["b", "ब"], ["m", "म"], ["y", "य"],
  ["r", "र"], ["l", "ल"], ["w", "व"], ["v", "व"], ["s", "स"],
  ["h", "ह"], ["f", "फ"], ["c", "क"], ["z", "ज"], ["x", "क"],
];
const LATIN_VOWEL_MATRA: [string, string][] = [
  ["aa", "ा"], ["ai", "ै"], ["au", "ौ"], ["ee", "ी"], ["ii", "ी"],
  ["oo", "ू"], ["uu", "ू"], ["a", ""], ["i", "ि"], ["e", "े"],
  ["u", "ु"], ["o", "ो"],
];
const LATIN_VOWEL_INDEP: [string, string][] = [
  ["aa", "आ"], ["ai", "ऐ"], ["au", "औ"], ["ee", "ई"], ["ii", "ई"],
  ["oo", "ऊ"], ["uu", "ऊ"], ["a", "अ"], ["i", "इ"], ["e", "ए"],
  ["u", "उ"], ["o", "ओ"],
];

/** Best-effort Devanagari spelling of a Latin (romanized) word. Approximate. */
export function latinToDevanagari(input: string): string {
  const s = input.toLowerCase();
  let out = "";
  let i = 0;
  let lastWasConsonant = false;
  while (i < s.length) {
    const rest = s.slice(i);
    const cons = LATIN_CONSONANT.find(([k]) => rest.startsWith(k));
    if (cons) {
      if (lastWasConsonant) out += VIRAMA;
      out += cons[1];
      lastWasConsonant = true;
      i += cons[0].length;
      continue;
    }
    const vowel = (lastWasConsonant ? LATIN_VOWEL_MATRA : LATIN_VOWEL_INDEP).find(([k]) => rest.startsWith(k));
    if (vowel) {
      out += vowel[1];
      lastWasConsonant = false;
      i += vowel[0].length;
      continue;
    }
    out += s[i];
    lastWasConsonant = false;
    i++;
  }
  return out;
}
