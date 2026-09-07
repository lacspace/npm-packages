/**
 * Number → English words (cardinal + ordinal).
 *
 * `numberToWords(1234)`        → "one thousand two hundred thirty-four"
 * `numberToOrdinalWords(21)`   → "twenty-first"
 *
 * Cardinals are built from the number's decimal string, so magnitudes are only
 * limited by the scale table below (up to just under 10^36 / "decillions").
 * Integers beyond `Number.MAX_SAFE_INTEGER` (~9e15) may already be imprecise as
 * JS numbers, so pass those with care. Fractions are read digit-by-digit after
 * "point" (`0.25` → "zero point two five"). Non-finite values pass through.
 */

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const SCALES = [
  "", "thousand", "million", "billion", "trillion", "quadrillion",
  "quintillion", "sextillion", "septillion", "octillion", "nonillion", "decillion",
];

/** Words for a 0–999 chunk (no leading/trailing spaces). */
function chunkToWords(n: number): string {
  let s = "";
  if (n >= 100) {
    s += `${ONES[Math.floor(n / 100)]} hundred`;
    n %= 100;
    if (n) s += " ";
  }
  if (n >= 20) {
    s += TENS[Math.floor(n / 10)]!;
    if (n % 10) s += `-${ONES[n % 10]}`;
  } else if (n > 0) {
    s += ONES[n]!;
  }
  return s;
}

/** Words for a non-negative integer given as a decimal digit string. */
function intStringToWords(digits: string): string {
  const clean = digits.replace(/^0+(?=\d)/, "");
  if (clean === "0") return "zero";
  const groups: number[] = [];
  for (let i = clean.length; i > 0; i -= 3) {
    groups.push(Number(clean.slice(Math.max(0, i - 3), i)));
  }
  if (groups.length > SCALES.length) {
    throw new RangeError("numberToWords: value is too large to name (max ~10^36)");
  }
  const parts: string[] = [];
  for (let g = groups.length - 1; g >= 0; g--) {
    const val = groups[g]!;
    if (val === 0) continue;
    parts.push(chunkToWords(val) + (SCALES[g] ? ` ${SCALES[g]}` : ""));
  }
  return parts.join(" ");
}

/** Spell a number in English words. `numberToWords(1234)` → "one thousand two hundred thirty-four". */
export function numberToWords(n: number): string {
  if (!Number.isFinite(n)) return String(n);
  if (n === 0) return "zero";
  const neg = n < 0;
  let s = Math.abs(n).toString();
  if (s.includes("e") || s.includes("E")) {
    // Expand exponential notation to a plain decimal string first.
    s = Math.abs(n).toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 20 });
  }
  const [intStr, fracStr] = s.split(".");
  let words = intStringToWords(intStr!);
  if (fracStr && /[^0]/.test(fracStr)) {
    words += ` point ${fracStr.split("").map((d) => ONES[Number(d)]).join(" ")}`;
  }
  return neg ? `negative ${words}` : words;
}

const ORDINAL_WORD: Record<string, string> = {
  one: "first", two: "second", three: "third", five: "fifth",
  eight: "eighth", nine: "ninth", twelve: "twelfth",
};

function ordinalizeWord(w: string): string {
  if (ORDINAL_WORD[w]) return ORDINAL_WORD[w]!;
  if (w.endsWith("y")) return `${w.slice(0, -1)}ieth`;
  return `${w}th`;
}

/** Spell an ordinal in English words. `numberToOrdinalWords(21)` → "twenty-first". */
export function numberToOrdinalWords(n: number): string {
  const words = numberToWords(Math.trunc(n));
  const spaceIdx = words.lastIndexOf(" ");
  const head = spaceIdx === -1 ? "" : words.slice(0, spaceIdx + 1);
  let tail = spaceIdx === -1 ? words : words.slice(spaceIdx + 1);
  const hyphenIdx = tail.lastIndexOf("-");
  if (hyphenIdx === -1) {
    tail = ordinalizeWord(tail);
  } else {
    tail = tail.slice(0, hyphenIdx + 1) + ordinalizeWord(tail.slice(hyphenIdx + 1));
  }
  return head + tail;
}
