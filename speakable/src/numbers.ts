/** Nepali has a unique word for every number 0–99. */
export const NE_0_99 = [
  "शून्य", "एक", "दुई", "तीन", "चार", "पाँच", "छ", "सात", "आठ", "नौ",
  "दश", "एघार", "बाह्र", "तेह्र", "चौध", "पन्ध्र", "सोह्र", "सत्र", "अठार", "उन्नाइस",
  "बीस", "एक्काइस", "बाइस", "तेइस", "चौबिस", "पच्चिस", "छब्बिस", "सत्ताइस", "अठ्ठाइस", "उनन्तिस",
  "तीस", "एकतिस", "बत्तिस", "तेत्तिस", "चौँतिस", "पैँतिस", "छत्तिस", "सैँतिस", "अठतिस", "उनन्चालीस",
  "चालीस", "एकचालीस", "बयालीस", "त्रिचालीस", "चवालीस", "पैँतालीस", "छयालीस", "सतचालीस", "अठचालीस", "उनन्चास",
  "पचास", "एकाउन्न", "बाउन्न", "त्रिपन्न", "चवन्न", "पचपन्न", "छपन्न", "सन्ताउन्न", "अन्ठाउन्न", "उनन्साठी",
  "साठी", "एकसट्ठी", "बयसट्ठी", "त्रिसट्ठी", "चौंसट्ठी", "पैंसट्ठी", "छयसट्ठी", "सतसट्ठी", "अठसट्ठी", "उनन्सत्तरी",
  "सत्तरी", "एकहत्तर", "बहत्तर", "त्रिहत्तर", "चौरहत्तर", "पचहत्तर", "छयहत्तर", "सतहत्तर", "अठहत्तर", "उनासी",
  "असी", "एकासी", "बयासी", "त्रियासी", "चौरासी", "पचासी", "छयासी", "सतासी", "अठासी", "उनान्नब्बे",
  "नब्बे", "एकानब्बे", "बयानब्बे", "त्रियानब्बे", "चौरानब्बे", "पन्चानब्बे", "छयानब्बे", "सन्तानब्बे", "अन्ठानब्बे", "उनान्सय",
];

const EN_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** Indian-system scales shared by Nepali and (optionally) English. */
const SCALES: Array<{ value: number; ne: string; en: string }> = [
  { value: 1e11, ne: "खर्ब", en: "kharab" },
  { value: 1e9, ne: "अर्ब", en: "arab" },
  { value: 1e7, ne: "करोड", en: "crore" },
  { value: 1e5, ne: "लाख", en: "lakh" },
  { value: 1e3, ne: "हजार", en: "thousand" },
  { value: 100, ne: "सय", en: "hundred" },
];

/** Nepali fraction idioms: 1.5 → डेढ, 2.5 → अढाई, 1.25 → सवा, 0.5 → आधा, 0.75 → पौने एक … */
export function neFractionIdiom(n: number): string | undefined {
  if (n === 0.5) return "आधा";
  if (n === 1.5) return "डेढ";
  if (n === 2.5) return "अढाई";
  if (n === 1.25) return "सवा";
  if (n === 0.25) return "पाउ";
  if (n === 0.75) return "पौने एक";
  const whole = Math.floor(n), frac = Math.round((n - whole) * 100) / 100;
  if (whole >= 3 && frac === 0.5) return `साढे ${NE_0_99[whole] ?? numberToWordsNe(whole)}`;
  if (whole >= 2 && frac === 0.25) return `सवा ${NE_0_99[whole] ?? numberToWordsNe(whole)}`;
  if (whole >= 1 && frac === 0.75) return `पौने ${NE_0_99[whole + 1] ?? numberToWordsNe(whole + 1)}`;
  return undefined;
}

export function digitsNe(s: string): string {
  return [...s].map((d) => (/[0-9]/.test(d) ? NE_0_99[Number(d)]! : /[०-९]/.test(d) ? NE_0_99[d.charCodeAt(0) - 0x966]! : d)).join(" ").replace(/\s+/g, " ").trim();
}
export function digitsEn(s: string): string {
  return [...s].map((d) => (/[०-९]/.test(d) ? EN_ONES[d.charCodeAt(0) - 0x966]! : /[0-9]/.test(d) ? EN_ONES[Number(d)]! : d)).join(" ").replace(/\s+/g, " ").trim();
}

function intWordsNe(n: number): string {
  if (n < 100) return NE_0_99[n]!;
  const parts: string[] = [];
  let rest = n;
  for (const s of SCALES) {
    if (rest >= s.value) {
      const q = Math.floor(rest / s.value);
      rest -= q * s.value;
      parts.push(`${s.value === 100 || q < 100 ? NE_0_99[q] ?? intWordsNe(q) : intWordsNe(q)} ${s.ne}`);
    }
  }
  if (rest > 0) parts.push(NE_0_99[rest]!);
  return parts.join(" ");
}

function intWordsEn(n: number, grouping: "western" | "indian"): string {
  if (n < 20) return EN_ONES[n]!;
  if (n < 100) return EN_TENS[Math.floor(n / 10)]! + (n % 10 ? "-" + EN_ONES[n % 10] : "");
  if (grouping === "indian") {
    const parts: string[] = [];
    let rest = n;
    for (const s of SCALES) {
      if (rest >= s.value) {
        const q = Math.floor(rest / s.value);
        rest -= q * s.value;
        parts.push(`${intWordsEn(q, "indian")} ${s.en}`);
      }
    }
    if (rest > 0) parts.push((parts.length ? "and " : "") + intWordsEn(rest, "indian"));
    return parts.join(" ");
  }
  const big: Array<[number, string]> = [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"], [100, "hundred"]];
  const parts: string[] = [];
  let rest = n;
  for (const [v, name] of big) {
    if (rest >= v) {
      const q = Math.floor(rest / v);
      rest -= q * v;
      parts.push(`${intWordsEn(q, "western")} ${name}`);
    }
  }
  if (rest > 0) parts.push((parts.length ? "and " : "") + intWordsEn(rest, "western"));
  return parts.join(" ");
}

export interface NumberWordsOptions {
  /** English only: "western" (million/billion, default) or "indian" (lakh/crore). */
  grouping?: "western" | "indian";
  /** Read 4-digit years as "twenty twenty-six" (en) — Nepali always reads years as full numbers. */
  year?: boolean;
}

/** Nepali words for a number, incl. decimals ("दशमलव"), negatives and fraction idioms. */
export function numberToWordsNe(n: number, options: { idioms?: boolean } = {}): string {
  if (!Number.isFinite(n)) return "";
  if (n < 0) return "माइनस " + numberToWordsNe(-n, options);
  if (options.idioms !== false) {
    const idiom = neFractionIdiom(n);
    if (idiom) return idiom;
  }
  const whole = Math.floor(n);
  const fracStr = decimalPart(n);
  const w = whole > 999_999_999_999_999 ? digitsNe(String(whole)) : intWordsNe(whole);
  return fracStr ? `${w} दशमलव ${digitsNe(fracStr)}` : w;
}

/** English words for a number, incl. decimals ("point"), negatives and year style. */
export function numberToWordsEn(n: number, options: NumberWordsOptions = {}): string {
  if (!Number.isFinite(n)) return "";
  if (n < 0) return "minus " + numberToWordsEn(-n, options);
  const whole = Math.floor(n);
  const fracStr = decimalPart(n);
  if (options.year && !fracStr && whole >= 1100 && whole <= 2099 && whole % 1000 !== 0) {
    const hi = Math.floor(whole / 100), lo = whole % 100;
    if (whole >= 2000 && whole < 2010) return `two thousand${lo ? " and " + EN_ONES[lo] : ""}`;
    return `${intWordsEn(hi, "western")} ${lo === 0 ? "hundred" : lo < 10 ? "oh-" + EN_ONES[lo] : intWordsEn(lo, "western")}`;
  }
  const w = whole > 999_999_999_999_999 ? digitsEn(String(whole)) : intWordsEn(whole, options.grouping ?? "western");
  return fracStr ? `${w} point ${digitsEn(fracStr)}` : w;
}

function decimalPart(n: number): string {
  const s = String(n);
  const i = s.indexOf(".");
  if (i === -1) return "";
  return s.slice(i + 1).replace(/0+$/, "");
}

/** Ordinal words. ne: पहिलो/दोस्रो/तेस्रो/चौथो, then Nौँ. en: first/second/…/twenty-third. */
export function ordinalNe(n: number): string {
  const special: Record<number, string> = { 1: "पहिलो", 2: "दोस्रो", 3: "तेस्रो", 4: "चौथो", 6: "छैटौँ", 9: "नवौँ" };
  if (special[n]) return special[n]!;
  const base = numberToWordsNe(n, { idioms: false });
  // Drop a final inherent-vowel carrier before adding the ौँ suffix (सात → सातौँ, बीस → बीसौँ, तीन → तेस्रो handled above).
  return base + "ौँ";
}
export function ordinalEn(n: number): string {
  const irregular: Record<string, string> = { one: "first", two: "second", three: "third", five: "fifth", eight: "eighth", nine: "ninth", twelve: "twelfth" };
  const words = numberToWordsEn(n);
  const parts = words.split(/(\s|-)/);
  const last = parts[parts.length - 1]!;
  let ord: string;
  if (irregular[last]) ord = irregular[last]!;
  else if (last.endsWith("y")) ord = last.slice(0, -1) + "ieth";
  else ord = last + "th";
  parts[parts.length - 1] = ord;
  return parts.join("");
}

/** Parse "1,20,000" / "१२०,०००" / "1.5" (either digit script) into a number. */
export function parseNum(s: string): number {
  const latin = s.replace(/[०-९]/g, (d) => String(d.charCodeAt(0) - 0x966)).replace(/[,\s]/g, "");
  return Number(latin);
}
