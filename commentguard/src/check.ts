/**
 * check(): a strict, word-boundary comment filter for news sites. @since 1.1.0
 *
 * Returns { ok, code, review, hits }:
 *   code "abuse"    profanity / slurs (English, Nepali Devanagari, romanised Nepali), with
 *                   leetspeak and masked spellings (f*ck, sh!t, m.u.j.i)
 *   code "personal" phone numbers (Nepal mobile/landline, +977), emails, citizenship / NID /
 *                   passport / account-like numbers
 *   code "spam"     link-heavy text, shorteners and chat invites, promo, crypto/betting
 *   code "repeat"   the same text from the same user in your window, or character/word floods
 * Mild words (e.g. "chor", "idiot") don't block on their own: ok stays true with review: true.
 * Matching is on whole words, so news vocabulary ("class", "Putin", "Kami Rita", "mula") is safe.
 */

export type Code = "abuse" | "personal" | "spam" | "repeat";
export interface CheckHit { code: Code; term: string; severity: "high" | "mild" }
export interface CheckInput {
  text: string;
  lang?: "en" | "ne";
  /** The same user's earlier comments in your window (e.g. last 24 h), newest first. */
  userHistory?: string[];
}
export interface CheckOptions {
  /** Treat mild words as blocking (default false: they only set review). */
  strict?: boolean;
  /** Extra blocked words / phrases (matched as whole words). */
  extraAbuse?: string[];
  /** Words to never treat as abuse (e.g. a place or surname in your area). */
  allow?: string[];
  /** Links allowed before it counts as spam (default 1, your own domain never counts). */
  maxLinks?: number;
  /** Domains that never count as links (e.g. "wenepal.com"). */
  ownDomains?: string[];
  /** Similarity at which a comment repeats one in userHistory (0–1, default 0.9). */
  repeatSimilarity?: number;
}
export interface CheckResult { ok: boolean; code?: Code; review: boolean; hits: CheckHit[] }

const DEV = "[\\p{Script=Devanagari}\\p{M}]";
const word = (body: string) => `(?<![\\p{L}\\p{M}\\p{N}])(?:${body})(?![\\p{L}\\p{M}\\p{N}])`;
// Devanagari insults take case endings (मुजीको, मुजीहरू): allow suffixes there.
const devWord = (body: string) => `(?<!${DEV})(?:${body})(?:को|का|की|ले|लाई|हरू|हरु)?(?!${DEV})`;

/** English: masked letters (f*ck, f**k, sh!t) are covered by the [\W_]* gaps and leet map. */
const EN_HIGH = [
  "f+u*c+k+(?:e[dr]|ing|in|s)?", "motherf+u*c+k+(?:e[rd]|ing|in)?", "f+[\\W_]*c+[\\W_]*k+", "f+[\\W_]+k+",
  "sh+i+t+(?:s|ty|head)?", "sh[\\W_]+t", "b+i+t+c+h+(?:e?s)?", "bastards?", "ass ?holes?", "a[\\W_]+hole", "dick ?heads?", "cunts?",
  "whores?", "sluts?", "pricks?", "retard(?:ed|s)?", "n+i+g+g+(?:a|er)s?", "faggots?", "fags?",
];
const EN_MILD = ["idiots?", "stupid", "morons?", "dumb", "fools?", "losers?", "shut up", "nonsense", "trash", "rubbish", "clowns?", "liars?", "crap", "damn"];

/** Romanised Nepali (Nepanglish) and common Hindi insults used by Nepali commenters. */
const ROM_HIGH = [
  "m+u+j+i+(?:ko|haru|harulai)?", "m+u+[\\W_]+j+i+", "mug+i", "m(?:a|u)chik+n(?:e+y?|y|a)", "machinne", "randi(?:ko|haru)?", "rand+i+ko",
  "lad+o+(?:ko)?", "lado", "put+i+(?:ko)?", "ged+a+", "jhat+u+", "jhatt+u+", "chik+ne+y?", "gand+u+", "chut+i+y+a+",
  "bh?osd(?:i|ike|ika)", "madar ?chod", "mader ?chod", "behen ?chod", "bhen ?chod", "bhenchod", "lamt+o+", "dall+a+(?:ko)?",
  "har+a+m+i+", "kut+t+a+", "kut+i+y+a+", "sal+a+ ?kut+a+",
];
const ROM_MILD = ["lund", "chik+n(?:a|i)", "khate", "pakhe", "jath+a+", "chor(?:haru|ko)?", "murkh(?:a|ha)?", "gadh(?:a|aa)", "bekar", "sala", "saala", "thukka", "bhando", "dhoti", "bhote", "madise", "chink(?:e|ey|i|y)?"];

const NE_HIGH = ["मुजी", "मुजि", "मचिक्ने", "मचिक्न", "रण्डी", "रन्डी", "रांडी", "लाडो", "पुती", "गेडा", "झाटु", "झाँटु", "चिक्ने", "चिक्नी", "गान्डु", "चुतिया", "भोस्डी", "मादरचोद", "बहिनचोद", "हरामी", "कुत्ता", "कुकुर्नी", "दल्ला", "लम्टो"];
const NE_MILD = ["खाते", "पाखे", "जाठा", "चोर", "मूर्ख", "मुर्ख", "गधा", "बेकार", "साला", "थुक्क", "भाँड", "धोती", "भोटे", "मधिसे"];

const LEET: Record<string, string> = { "@": "a", "4": "a", "3": "e", "1": "i", "!": "i", "|": "i", "0": "o", "$": "s", "5": "s", "7": "t", "+": "t" };
const deleet = (s: string) => s.replace(/[@4310!|$57+]/g, (c) => LEET[c] ?? c);
const devDigits = (s: string) => s.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));

const compile = (list: string[], dev = false) => new RegExp(list.map((t) => (dev ? devWord(t) : word(t))).join("|"), "giu");
const RE = {
  enHigh: compile(EN_HIGH), enMild: compile(EN_MILD), romHigh: compile(ROM_HIGH), romMild: compile(ROM_MILD),
  neHigh: compile(NE_HIGH, true), neMild: compile(NE_MILD, true),
};

const PERSONAL: { re: RegExp; term: string }[] = [
  // Nepal mobiles: 96x/97x/98x + 7 digits, optional +977 / 977 / 0 and separators
  { re: /(?<!\d)(?:\+?977[\s-]?)?9[678]\d[\s-]?\d{3}[\s-]?\d{4}(?!\d)/g, term: "phone" },
  // landline: 01-4XXXXXX, 061-5XXXXX, +977-1-...
  { re: /(?<!\d)(?:\+?977[\s-]?|0)(?:1|[2-9]\d)[\s-]\d{6,7}(?!\d)/g, term: "landline" },
  // other international numbers written as +CC ...
  { re: /(?<![\w+])\+(?!977)\d{1,3}[\s-]?\d{3,4}[\s-]?\d{3,4}[\s-]?\d{0,4}(?!\d)/g, term: "phone" },
  { re: /[\w.+-]+@[\w-]+\.[\w.-]+/g, term: "email" },
  // citizenship: district-ward/year-serial e.g. 27-01-71-12345, 123/456
  { re: /(?<!\d)\d{2}[-/]\d{2}[-/]\d{2}[-/]\d{3,6}(?!\d)/g, term: "citizenship-number" },
  { re: /(?:नागरिकता|citizenship|nagarikta)[^\d]{0,20}\d[\d\s/-]{4,}/giu, term: "citizenship-number" },
  { re: /(?:nid|national id|राष्ट्रिय परिचय(?:पत्र)?)[^\d]{0,20}\d{3}[\s-]?\d{3}[\s-]?\d{3}[\s-]?\d(?!\d)/giu, term: "national-id" },
  { re: /(?:passport|राहदानी)[^\w]{0,10}[A-Z]{0,2}\d{7,9}\b/giu, term: "passport" },
  { re: /(?:account|a\/c|khata|खाता)[^\d]{0,20}\d{10,20}(?!\d)/giu, term: "account-number" },
];

const LINK = /\bhttps?:\/\/[^\s]+|\bwww\.[^\s]+|\b[a-z0-9-]+\.(?:com|net|org|np|io|co|me|ly|xyz|info|top|site|online|link|shop|club|live|app)(?:\/[^\s]*)?/gi;
const SHORT_OR_INVITE = /\b(?:bit\.ly|tinyurl\.com|cutt\.ly|rb\.gy|is\.gd|shorturl\.at|t\.me|chat\.whatsapp\.com|wa\.me|discord\.gg)\b/gi;
const PROMO = [
  "earn (?:rs\\.? ?)?\\d[\\d,]* (?:daily|per day|a day|weekly|monthly)", "work from home", "earn from home", "double your money", "guaranteed (?:return|profit|income)",
  "dm (?:me|for)", "inbox (?:me|for)", "whats ?app (?:me|now|गर्नुहोस्)", "join (?:my |our )?(?:telegram|whats ?app)", "telegram (?:group|channel) join",
  "click (?:the|this) link", "visit my (?:channel|profile|page)", "subscribe (?:my|to my)", "follow (?:me|back)", "free (?:recharge|money|followers|likes)",
  "loan (?:available|without|in \\d)", "instant loan", "paisa kamau", "पैसा कमाउनुहोस्", "घरबाटै कमाउनुहोस्",
];
const GAMBLING = ["bitcoin", "usdt", "binance", "crypto (?:signal|signals|trading|investment|earning)", "forex signals?", "betting", "1 ?x ?bet", "bet365", "dafabet", "parimatch", "stake\\.com", "casino", "jackpot", "satta", "teen ?patti", "aviator (?:game|app)", "lottery (?:winner|prize)", "मटका", "जुवा (?:खेल|एप)"];
const PROMO_RE = new RegExp(PROMO.map(word).join("|"), "giu");
const GAMBLING_RE = new RegExp(GAMBLING.map(word).join("|"), "giu");

const norm = (s: string) => s.toLowerCase().replace(/(.)\1{2,}/gu, "$1$1").replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
function similarity(a: string, b: string): number {
  if (a === b) return 1;
  const sh = (s: string) => { const t = new Set<string>(); for (let i = 0; i + 3 <= s.length; i++) t.add(s.slice(i, i + 3)); return t; };
  const A = sh(a), B = sh(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const x of A) if (B.has(x)) n++;
  return n / (A.size + B.size - n);
}

export function check(input: CheckInput, options: CheckOptions = {}): CheckResult {
  const raw = input.text ?? "";
  const hits: CheckHit[] = [];
  const allow = new Set((options.allow ?? []).map((w) => w.toLowerCase()));
  const push = (code: Code, term: string, severity: CheckHit["severity"]) => {
    if (allow.has(term.toLowerCase())) return;
    if (!hits.some((h) => h.code === code && h.term.toLowerCase() === term.toLowerCase())) hits.push({ code, term, severity });
  };

  // abuse: on the original and on a de-leeted copy; joined spellings (m.u.j.i → muji)
  const lower = raw.toLowerCase();
  const variants = [lower, deleet(lower), lower.replace(/(?<![\p{L}\p{M}])\p{L}(?:[.\-_*\s]\p{L}){2,}(?![\p{L}\p{M}])/gu, (run) => run.replace(/[.\-_*\s]/g, ""))];
  for (const v of variants) {
    for (const [re, sev] of [[RE.enHigh, "high"], [RE.romHigh, "high"], [RE.neHigh, "high"], [RE.enMild, "mild"], [RE.romMild, "mild"], [RE.neMild, "mild"]] as const) {
      re.lastIndex = 0;
      for (const m of v.matchAll(re)) push("abuse", m[0].trim(), sev);
    }
  }
  for (const t of options.extraAbuse ?? []) {
    const re = new RegExp(/[ऀ-ॿ]/.test(t) ? devWord(t) : word(t), "iu");
    const m = re.exec(raw);
    if (m) push("abuse", m[0], "high");
  }

  // personal data
  const digits = devDigits(raw);
  for (const p of PERSONAL) {
    p.re.lastIndex = 0;
    if (p.re.test(digits)) push("personal", p.term, "high");
  }

  // spam
  const own = (options.ownDomains ?? []).map((d) => d.toLowerCase());
  const links = (raw.match(LINK) ?? []).filter((l) => !own.some((d) => l.toLowerCase().includes(d)));
  const invites = raw.match(SHORT_OR_INVITE) ?? [];
  if (invites.length) push("spam", invites[0]!, "high");
  if (links.length > (options.maxLinks ?? 1)) push("spam", `${links.length} links`, "high");
  for (const m of raw.matchAll(PROMO_RE)) push("spam", m[0], "high");
  const gamb = [...raw.matchAll(GAMBLING_RE)].map((m) => m[0]);
  // crypto/betting words are news vocabulary too; with a link, contact or promo they're spam
  const contact = hits.some((h) => h.code === "personal" && (h.term === "phone" || h.term === "email")) || links.length > 0 || invites.length > 0;
  for (const g of gamb) push("spam", g, contact || hits.some((h) => h.code === "spam") ? "high" : "mild");

  // repeats and floods
  const n = norm(raw);
  if (/(.)\1{9,}/u.test(raw.replace(/\s/g, ""))) push("repeat", "character flood", "high");
  const words = n.split(" ").filter(Boolean);
  if (words.length >= 6) {
    const counts = new Map<string, number>();
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
    const top = Math.max(...counts.values());
    if (top >= 6 && top / words.length >= 0.5) push("repeat", "word flood", "high");
  }
  const emoji = raw.match(/\p{Extended_Pictographic}/gu) ?? [];
  if (emoji.length >= 15 && emoji.length / Math.max(1, [...raw].length) > 0.5) push("repeat", "emoji flood", "high");
  const sim = options.repeatSimilarity ?? 0.9;
  if (n.length >= 8 && (input.userHistory ?? []).some((h) => similarity(n, norm(h)) >= sim)) push("repeat", "same as an earlier comment", "high");

  const blocking = hits.filter((h) => h.severity === "high" || options.strict);
  const order: Code[] = ["abuse", "personal", "spam", "repeat"];
  const code = order.find((c) => blocking.some((h) => h.code === c));
  return { ok: !code, code, review: !code && hits.length > 0, hits };
}
