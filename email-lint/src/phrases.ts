/**
 * Phrases commonly associated with spam and scams. Matching is
 * case-insensitive and whole-word. No single phrase makes a message spam;
 * a cluster of them is what tends to hurt.
 */
export const SPAM_PHRASES: string[] = [
  // money / income
  "make money", "earn money", "earn extra cash", "extra income", "double your income",
  "double your money", "get rich", "get rich quick", "be your own boss", "work from home",
  "free money", "free cash", "cash bonus", "million dollars", "billion dollars",
  "guaranteed income", "investment opportunity", "risk-free investment", "wire transfer",
  "no credit check", "pre-approved", "eliminate debt", "consolidate debt", "lowest rates",
  "bitcoin investment", "crypto giveaway", "unclaimed funds", "inheritance", "beneficiary",
  // prizes
  "you have won", "you won", "you've won", "you are a winner", "you're a winner", "dear winner",
  "you have been selected", "you've been selected", "claim your prize", "claim your reward",
  "lottery", "casino",
  // pressure / urgency
  "act now", "act immediately", "urgent response", "limited time offer", "once in a lifetime",
  "expires today", "offer expires", "while supplies last", "don't delete", "do not delete",
  "this is not spam", "not spam",
  // hard sell
  "100% free", "100% guaranteed", "100% satisfied", "risk-free", "risk free", "no strings attached",
  "no catch", "no obligation", "no hidden fees", "satisfaction guaranteed", "money back guarantee",
  "free gift", "free access", "buy now", "order now", "click here", "click below", "lowest price",
  "best price", "huge discount", "incredible deal", "amazing offer", "special promotion",
  "exclusive deal", "cheap", "bargain", "miracle", "lose weight", "weight loss", "viagra", "$$$",
  // phishing-style
  "dear friend", "verify your account", "confirm your account", "account suspended",
  "your account has been suspended", "update your payment",
  // Nepali
  "निःशुल्क", "तुरुन्त", "जित्नुभयो", "अफर", "बधाई छ", "पुरस्कार", "लटरी", "छिटो पैसा",
];

const WORD = /[\p{L}\p{N}\p{M}]/u;
const LATIN_END = /[A-Za-z0-9]/;

function escape(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

interface Compiled {
  phrase: string;
  re: RegExp;
  leftWord: boolean;
  rightWord: boolean;
}

function compile(list: string[]): Compiled[] {
  return list.map((phrase) => {
    const body = phrase.split(/\s+/).map((p) => escape(p.replace(/'/g, "\u0001")).replace(/\u0001/g, "['’]")).join("\\s+");
    return {
      phrase,
      re: new RegExp(body, "giu"),
      leftWord: WORD.test(phrase[0] as string),
      // Nepali attaches postpositions to the word ("अफरमा"), so only Latin
      // phrases need a right-hand word boundary.
      rightWord: LATIN_END.test(phrase[phrase.length - 1] as string),
    };
  });
}

const COMPILED = compile(SPAM_PHRASES);

/**
 * Spammy phrases found in `text`, in the casing they appear, de-duplicated
 * case-insensitively, in order of first appearance.
 */
export function spamPhrases(text: string): string[] {
  if (!text) return [];
  const hits: Array<{ at: number; end: number; s: string }> = [];
  for (const c of COMPILED) {
    c.re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = c.re.exec(text)) !== null) {
      const at = m.index;
      const end = at + m[0].length;
      if (m[0].length === 0) { c.re.lastIndex++; continue; }
      const before = at > 0 ? text[at - 1] : undefined;
      const after = text[end];
      const okLeft = !c.leftWord || before === undefined || !WORD.test(before);
      const contraction = (after === "'" || after === "\u2019") && WORD.test(text[end + 1] ?? "");
      const okRight = !c.rightWord || after === undefined || (!WORD.test(after) && !contraction);
      if (okLeft && okRight) hits.push({ at, end, s: m[0] });
    }
  }
  hits.sort((a, b) => a.at - b.at || b.end - a.end);
  const out: string[] = [];
  const seen = new Set<string>();
  let coveredTo = -1;
  for (const h of hits) {
    // skip a phrase fully inside a longer one already taken ("risk-free" inside "risk-free investment")
    if (h.end <= coveredTo) continue;
    coveredTo = Math.max(coveredTo, h.end);
    const key = h.s.toLowerCase().replace(/\s+/g, " ").replace(/’/g, "'");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h.s);
  }
  return out;
}
