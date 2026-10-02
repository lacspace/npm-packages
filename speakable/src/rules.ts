import { AD_MONTHS, BS_MONTHS, monthIndex, Spoken, UNITS, WEEKDAYS } from "./lexicon.js";
import { digitsEn, digitsNe, neFractionIdiom, numberToWordsEn, numberToWordsNe, ordinalEn, ordinalNe, parseNum } from "./numbers.js";

export type Lang = "ne" | "en";

export interface RuleContext {
  lang: Lang;
  /** "auto" infers BS vs AD: Nepali month names / ISO year ≥ 2050 → BS. */
  dateSystem: "auto" | "bs" | "ad";
  /** English number grouping. "auto" = indian when the text itself uses lakh/crore/रु, else western. */
  grouping: "auto" | "indian" | "western";
  /** English date style. */
  dateStyle: "british" | "american";
  /** Set by the scanner when the surrounding text uses Indian scales. */
  indianContext: boolean;
}

export interface Rule {
  name: string;
  re: RegExp; // must use the sticky flag
  /** Return the spoken form, or null to decline the match. */
  say(m: RegExpExecArray, ctx: RuleContext): string | null;
  /** Mark the output as "numeric" so the segmenter slows the rate. Default true for number rules. */
  numeric?: boolean;
}

const D = "[0-9०-९]";
const MONTH_WORD = "[A-Za-z\\u0900-\\u097F]+\\.?";

function num(ctx: RuleContext, n: number, opts: { year?: boolean; idioms?: boolean } = {}): string {
  if (ctx.lang === "ne") return numberToWordsNe(n, { idioms: opts.idioms });
  return numberToWordsEn(n, { year: opts.year, grouping: ctx.grouping === "auto" ? (ctx.indianContext ? "indian" : "western") : ctx.grouping });
}
function pick(ctx: RuleContext, s: Spoken): string {
  return ctx.lang === "ne" ? s.ne : s.en;
}
function isBsYear(y: number, ctx: RuleContext): boolean {
  if (ctx.dateSystem !== "auto") return ctx.dateSystem === "bs";
  return y >= 2050 && y <= 2200;
}

function sayBsDate(ctx: RuleContext, y: number | undefined, mi: number, d: number): string {
  const m = BS_MONTHS[mi]!;
  if (ctx.lang === "ne") return `${y ? num(ctx, y) + " साल " : ""}${m.ne} ${numberToWordsNe(d, { idioms: false })} गते`;
  return `${ordinalEn(d)} of ${m.en}${y ? ", " + numberToWordsEn(y) : ""}`;
}
function sayAdDate(ctx: RuleContext, y: number | undefined, mi: number, d: number | undefined): string {
  const m = AD_MONTHS[mi]!;
  if (ctx.lang === "ne") return `${d !== undefined ? numberToWordsNe(d, { idioms: false }) + " " : ""}${m.ne}${y ? " " + numberToWordsNe(y) : ""}`;
  const year = y ? ", " + numberToWordsEn(y, { year: true }) : "";
  if (d === undefined) return `${m.en}${year}`;
  return ctx.dateStyle === "american" ? `${m.en} ${ordinalEn(d)}${year}` : `the ${ordinalEn(d)} of ${m.en}${year}`;
}

function sayTime(ctx: RuleContext, h: number, min: number, ampm?: string): string {
  let h24 = h;
  const ap = (ampm ?? "").toLowerCase().replace(/\./g, "");
  if (ap === "pm" && h < 12) h24 = h + 12;
  if (ap === "am" && h === 12) h24 = 0;
  if (ctx.lang === "ne") {
    const period = h24 < 4 ? "राति" : h24 < 12 ? "बिहान" : h24 < 16 ? "दिउँसो" : h24 < 19 ? "साँझ" : h24 < 21 ? "बेलुका" : "राति";
    const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
    return min === 0 ? `${period} ${numberToWordsNe(h12, { idioms: false })} बजे` : `${period} ${numberToWordsNe(h12, { idioms: false })} बजेर ${numberToWordsNe(min, { idioms: false })} मिनेट`;
  }
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  const suffix = ampm ? (h24 < 12 ? " a m" : " p m") : h24 >= 12 && h < 13 && h !== h24 ? " p m" : h > 12 ? " p m" : "";
  const mins = min === 0 ? (ampm || h > 12 ? "" : " o'clock") : min < 10 ? ` oh ${numberToWordsEn(min)}` : ` ${numberToWordsEn(min)}`;
  return `${numberToWordsEn(h > 12 || ampm ? h12 : h)}${mins}${suffix}`;
}

function sayDigits(ctx: RuleContext, s: string, groupEvery = 0): string {
  const words = [...s.replace(/[^0-9०-९]/g, "")].map((d) => (ctx.lang === "ne" ? digitsNe(d) : digitsEn(d)));
  if (!groupEvery) return words.join(" ");
  const out: string[] = [];
  for (let i = 0; i < words.length; i += groupEvery) out.push(words.slice(i, i + groupEvery).join(" "));
  return out.join(", ");
}

const SCALE_WORDS: Record<string, number> = {
  हजार: 1e3, लाख: 1e5, करोड: 1e7, अर्ब: 1e9, खर्ब: 1e11,
  thousand: 1e3, lakh: 1e5, lakhs: 1e5, crore: 1e7, crores: 1e7, arab: 1e9, kharab: 1e11,
  million: 1e6, billion: 1e9, trillion: 1e12, k: 1e3, K: 1e3, M: 1e6, bn: 1e9, mn: 1e6, B: 1e9,
};
const SCALE_RE = "(हजार|लाख|करोड|अरब|खर्ब|thousand|lakhs?|crores?|million|billion|trillion|bn|mn|[kKMB])";
const CURRENCY_PREFIX = "(रु\\.?|रू\\.?|ने\\.?रु\\.?|NPR|Rs\\.?|₹|\\$|USD|US\\$|INR|EUR|€|GBP|£|AUD|AED)";
const CURRENCY_SUFFIX = "(रुपैयाँ|रुपैया|रुपियाँ|rupees|dollars|डलर|euros|pounds)";

function currencyName(prefix: string, ctx: RuleContext): string {
  const p = prefix.replace(/\./g, "").toUpperCase();
  const map: Record<string, Spoken> = {
    "रु": { ne: "रुपैयाँ", en: "rupees" }, "रू": { ne: "रुपैयाँ", en: "rupees" }, "नेरु": { ne: "रुपैयाँ", en: "rupees" }, NPR: { ne: "रुपैयाँ", en: "rupees" }, RS: { ne: "रुपैयाँ", en: "rupees" },
    "₹": { ne: "भारतीय रुपैयाँ", en: "Indian rupees" }, INR: { ne: "भारतीय रुपैयाँ", en: "Indian rupees" },
    "$": { ne: "डलर", en: "dollars" }, USD: { ne: "अमेरिकी डलर", en: "US dollars" }, "US$": { ne: "अमेरिकी डलर", en: "US dollars" },
    EUR: { ne: "युरो", en: "euros" }, "€": { ne: "युरो", en: "euros" }, GBP: { ne: "पाउन्ड", en: "pounds" }, "£": { ne: "पाउन्ड", en: "pounds" },
    AUD: { ne: "अस्ट्रेलियन डलर", en: "Australian dollars" }, AED: { ne: "दिरहाम", en: "dirhams" },
  };
  return pick(ctx, map[p] ?? map[prefix] ?? { ne: "रुपैयाँ", en: "rupees" });
}

/** "1 लाख 50 हजार" / "2.5 करोड" / "120 million" → words (expands exact scaled decimals: 1.3 लाख → एक लाख तीस हजार). */
function sayScaled(ctx: RuleContext, chain: Array<{ n: number; scale: number }>, forceIdiom = true): string {
  if (chain.length === 1 && ctx.lang === "ne" && forceIdiom) {
    const { n, scale } = chain[0]!;
    const idiom = neFractionIdiom(n);
    if (idiom) return `${idiom} ${scaleWord(scale, ctx)}`;
  }
  const total = chain.reduce((a, c) => a + c.n * c.scale, 0);
  if (Number.isInteger(total) && total < 1e15) {
    // Western scales in English stay western ("hundred and twenty million"), Indian stay Indian.
    const indian = chain.some((c) => [1e5, 1e7, 1e11].includes(c.scale));
    if (ctx.lang === "en") return numberToWordsEn(total, { grouping: indian ? "indian" : ctx.grouping === "indian" ? "indian" : "western" });
    return numberToWordsNe(total, { idioms: false });
  }
  return chain.map((c) => `${num(ctx, c.n, { idioms: false })} ${scaleWord(c.scale, ctx)}`).join(" ");
}
function scaleWord(scale: number, ctx: RuleContext): string {
  const m: Record<number, Spoken> = { 1e3: { ne: "हजार", en: "thousand" }, 1e5: { ne: "लाख", en: "lakh" }, 1e6: { ne: "मिलियन", en: "million" }, 1e7: { ne: "करोड", en: "crore" }, 1e9: { ne: "अर्ब", en: "billion" }, 1e11: { ne: "खर्ब", en: "kharab" }, 1e12: { ne: "ट्रिलियन", en: "trillion" } };
  return pick(ctx, m[scale] ?? { ne: "", en: "" });
}

/** Ordered rules. Earlier wins at a given position. All regexes are sticky. */
export const RULES: Rule[] = [
  // --- phone numbers: +977-98XXXXXXXX, 98XXXXXXXX, 01-4XXXXXX ---------------------------
  {
    name: "phone",
    re: new RegExp(`(\\+977[-\\s]?)?([9९][6-9६-९]${D}{8})(?!${D})|([0०]${D}[-\\s]?${D}{6,7})(?!${D})`, "y"),
    say: (m, ctx) => {
      const mobile = m[2], land = m[3];
      const plus = m[1] ? (ctx.lang === "ne" ? "प्लस नौ सात सात, " : "plus nine seven seven, ") : "";
      if (mobile) return plus + sayDigits(ctx, mobile, 2).replace(/^(\S+ \S+), /, "$1 ") ;
      return sayDigits(ctx, land!, 3);
    },
  },
  // --- vehicle plates: बा १२ प ३४५६ / Ba 12 Pa 3456 -----------------------------------
  {
    name: "plate",
    re: new RegExp(`([क-ह][\\u093E-\\u094D]?(?:[क-ह][\\u093E-\\u094D]?)?|[A-Z][a-z]?)\\s*(${D}{1,2})\\s*([क-ह][\\u093E-\\u094D]?|[A-Z][a-z]?)\\s*(${D}{4})(?!${D})`, "y"),
    say: (m, ctx) => `${m[1]} ${num(ctx, parseNum(m[2]!), { idioms: false })} ${m[3]} ${sayDigits(ctx, m[4]!)}`,
  },
  // --- ISO / numeric dates: 2083-06-16, 2083/06/16, 2026-10-02, 02/10/2026 ---------------
  {
    name: "date-numeric",
    re: new RegExp(`(${D}{4})[-/.](${D}{1,2})[-/.](${D}{1,2})(?!${D})|(${D}{1,2})[-/.](${D}{1,2})[-/.](${D}{4})(?!${D})`, "y"),
    say: (m, ctx) => {
      let y: number, mo: number, d: number;
      if (m[1]) { y = parseNum(m[1]); mo = parseNum(m[2]!); d = parseNum(m[3]!); }
      else { d = parseNum(m[4]!); mo = parseNum(m[5]!); y = parseNum(m[6]!); if (ctx.dateStyle === "american" && mo > 12) [d, mo] = [mo, d]; }
      if (mo < 1 || mo > 12 || d < 1 || d > 32) return null;
      return isBsYear(y, ctx) ? sayBsDate(ctx, y, mo - 1, d) : sayAdDate(ctx, y, mo - 1, d);
    },
  },
  // --- "२०८३ असोज १६" / "२०८३ साल असोज १६ गते" / "16 Asoj 2083" / "असोज १६" ----------------
  {
    name: "date-bs-ymd",
    re: new RegExp(`(${D}{4})\\s*(?:साल\\s*)?(${MONTH_WORD})\\s+(${D}{1,2})(?:\\s*गते)?(?![${D.slice(1, -1)}\\u0900-\\u097Fa-z])`, "y"),
    say: (m, ctx) => { const mi = monthIndex(m[2]!, BS_MONTHS); return mi === -1 ? null : sayBsDate(ctx, parseNum(m[1]!), mi, parseNum(m[3]!)); },
  },
  {
    name: "date-bs-dmy",
    re: new RegExp(`(${D}{1,2})\\s+(${MONTH_WORD})(?:\\s*,?\\s*(${D}{4}))?(?:\\s*गते)?(?![${D.slice(1, -1)}])`, "y"),
    say: (m, ctx) => {
      const bs = monthIndex(m[2]!, BS_MONTHS), ad = monthIndex(m[2]!, AD_MONTHS);
      const d = parseNum(m[1]!), y = m[3] ? parseNum(m[3]) : undefined;
      if (bs !== -1) return sayBsDate(ctx, y, bs, d);
      if (ad !== -1) return sayAdDate(ctx, y, ad, d);
      return null;
    },
  },
  {
    name: "date-month-first",
    re: new RegExp(`(${MONTH_WORD})\\s+(${D}{1,2})(?:st|nd|rd|th)?(?:\\s*,?\\s*(${D}{4}))?(?:\\s*गते(?:देखि|बाट|सम्म)?)?(?![${D.slice(1, -1)}])`, "y"),
    say: (m, ctx) => {
      const bs = monthIndex(m[1]!, BS_MONTHS), ad = monthIndex(m[1]!, AD_MONTHS);
      const d = parseNum(m[2]!), y = m[3] ? parseNum(m[3]) : undefined;
      if (d < 1 || d > 32) return null;
      const tail = m[0].match(/गते(देखि|बाट|सम्म)?$/)?.[1] ?? "";
      if (bs !== -1) return sayBsDate(ctx, y, bs, d) + tail;
      if (ad !== -1) return sayAdDate(ctx, y, ad, d);
      return null;
    },
  },
  // --- times: 13:38, १३:३८, 6:00 PM, ८ बजे ----------------------------------------------
  {
    name: "time",
    re: new RegExp(`(${D}{1,2}):(${D}{2})(?::${D}{2})?(?:\\s*([AaPp]\\.?[Mm])(?:\\.(?=\\s*[a-z\\u0900-\\u097F]))?)?(?!${D})`, "y"),
    say: (m, ctx) => { const h = parseNum(m[1]!), mi = parseNum(m[2]!); return h > 24 || mi > 59 ? null : sayTime(ctx, h, mi, m[3]); },
  },
  {
    name: "time-ampm",
    re: new RegExp(`(${D}{1,2})\\s*([AaPp]\\.?[Mm])(?:\\.(?=\\s*[a-z\\u0900-\\u097F]))?(?![A-Za-z])`, "y"),
    say: (m, ctx) => { const h = parseNum(m[1]!); return h > 12 ? null : sayTime(ctx, h, 0, m[2]); },
  },
  // --- currency: रु. १ लाख ५० हजार / NPR 1,20,000 / Rs 197.5 / $120 million ----------------
  {
    name: "currency-prefix",
    re: new RegExp(`${CURRENCY_PREFIX}\\s*(${D}[${D.slice(1, -1)},]*(?:\\.${D}+)?)((?:\\s*${SCALE_RE}(?:\\s*${D}[${D.slice(1, -1)},]*(?:\\.${D}+)?)?)*)(?:\\s*${CURRENCY_SUFFIX})?`, "y"),
    say: (m, ctx) => {
      const name = currencyName(m[1]!, ctx);
      const chain = parseChain(m[2]!, m[3] ?? "");
      if (chain.length === 1 && chain[0]!.scale === 1) {
        const n = chain[0]!.n;
        const whole = Math.floor(n), paisa = Math.round((n - whole) * 100);
        const w = num(ctx, whole, { idioms: false });
        if (paisa) return ctx.lang === "ne" ? `${w} ${name} ${numberToWordsNe(paisa, { idioms: false })} पैसा` : `${w} ${name} ${numberToWordsEn(paisa)} paisa`;
        return `${w} ${name}`;
      }
      return `${sayScaled(ctx, chain)} ${name}`;
    },
  },
  {
    name: "currency-suffix",
    re: new RegExp(`(${D}[${D.slice(1, -1)},]*(?:\\.${D}+)?)((?:\\s*${SCALE_RE}(?:\\s*${D}[${D.slice(1, -1)},]*(?:\\.${D}+)?)?)*)\\s*${CURRENCY_SUFFIX}`, "y"),
    say: (m, ctx) => `${sayScaled(ctx, parseChain(m[1]!, m[2] ?? ""))} ${pick(ctx, /dollar|डलर/.test(m[4]!) ? { ne: "डलर", en: "dollars" } : /euro/.test(m[4]!) ? { ne: "युरो", en: "euros" } : /pound/.test(m[4]!) ? { ne: "पाउन्ड", en: "pounds" } : { ne: "रुपैयाँ", en: "rupees" })}`,
  },
  // --- percent ------------------------------------------------------------------------
  {
    name: "percent",
    re: new RegExp(`(${D}[${D.slice(1, -1)},]*(?:\\.${D}+)?)\\s*(%|प्रतिशत|percent|per cent)`, "y"),
    say: (m, ctx) => `${num(ctx, parseNum(m[1]!), { idioms: false })} ${pick(ctx, { ne: "प्रतिशत", en: "percent" })}`,
  },
  // --- scaled numbers without currency: १.५ लाख, 2.3 करोड, 120 million ---------------------
  {
    name: "scaled",
    re: new RegExp(`(${D}[${D.slice(1, -1)},]*(?:\\.${D}+)?)((?:\\s*${SCALE_RE}(?:\\s+${D}[${D.slice(1, -1)},]*(?:\\.${D}+)?)?)+)(?![A-Za-z\\u0900-\\u097F])`, "y"),
    say: (m, ctx) => sayScaled(ctx, parseChain(m[1]!, m[2]!)),
  },
  // --- ordinals: १६औँ / 16th -------------------------------------------------------------
  {
    name: "ordinal",
    re: new RegExp(`(${D}{1,4})\\s*(औँ|औं|ौँ|ौं|st|nd|rd|th)(?![A-Za-z])`, "y"),
    say: (m, ctx) => (ctx.lang === "ne" ? ordinalNe(parseNum(m[1]!)) : ordinalEn(parseNum(m[1]!))),
  },
  // --- ranges: 10-15, १०–१५ (not dates/phones, which matched earlier) ----------------------
  {
    name: "range",
    re: new RegExp(`(${D}{1,3}(?:\\.${D}+)?)\\s*[-–]\\s*(${D}{1,3}(?:\\.${D}+)?)(?![${D.slice(1, -1)}-])`, "y"),
    say: (m, ctx) => `${num(ctx, parseNum(m[1]!), { idioms: false })} ${pick(ctx, { ne: "देखि", en: "to" })} ${num(ctx, parseNum(m[2]!), { idioms: false })}`,
  },
  // --- number + unit: 20 मिलिमिटर handled as plain number + word; 25°C, 5 km, 200 MW -----------
  {
    name: "unit",
    re: new RegExp(`(${D}[${D.slice(1, -1)},]*(?:\\.${D}+)?)\\s*(${Object.keys(UNITS).sort((a, b) => b.length - a.length).map(escapeRe).join("|")})(?![A-Za-z])`, "y"),
    say: (m, ctx) => `${num(ctx, parseNum(m[1]!), { idioms: false })} ${pick(ctx, UNITS[m[2]!]!)}`,
  },
  // --- plain numbers (years read as years in English) --------------------------------------
  {
    name: "number",
    re: new RegExp(`-?${D}[${D.slice(1, -1)},]*(?:\\.${D}+)?(?![${D.slice(1, -1)}])`, "y"),
    say: (m, ctx) => {
      const raw = m[0];
      const n = parseNum(raw);
      if (!Number.isFinite(n)) return null;
      const yearish = /^[0-9०-९]{4}$/.test(raw) && n >= 1500 && n <= 2199;
      return num(ctx, n, { year: yearish, idioms: false });
    },
  },
  // --- weekday words appear in both scripts; pass through but normalise spelling --------------
  {
    name: "weekday-xscript",
    re: /(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|आइतबार|सोमबार|मंगलबार|मङ्गलबार|बुधबार|बिहीबार|बिहिबार|शुक्रबार|शनिबार)(?![A-Za-zऀ-ॿ])/y,
    numeric: false,
    say: (m, ctx) => {
      const i = WEEKDAYS.findIndex((w) => w.en === m[1] || w.ne === m[1] || (m[1] === "मङ्गलबार" && w.ne === "मंगलबार") || (m[1] === "बिहिबार" && w.ne === "बिहीबार"));
      return i === -1 ? null : pick(ctx, WEEKDAYS[i]!);
    },
  },
];

function parseChain(first: string, rest: string): Array<{ n: number; scale: number }> {
  const chain: Array<{ n: number; scale: number }> = [];
  let n = parseNum(first);
  const re = new RegExp(`\\s*(${SCALE_RE.slice(1, -1)})(?:\\s*(${D}[${D.slice(1, -1)},]*(?:\\.${D}+)?))?`, "g");
  let m: RegExpExecArray | null;
  let any = false;
  while ((m = re.exec(rest))) {
    any = true;
    chain.push({ n, scale: SCALE_WORDS[m[1]!] ?? 1 });
    if (m[2]) n = parseNum(m[2]);
    else { n = NaN; }
  }
  if (!any) return [{ n, scale: 1 }];
  if (Number.isFinite(n)) chain.push({ n, scale: 1 }); // trailing bare number: "1 लाख 500"
  return chain;
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
}
