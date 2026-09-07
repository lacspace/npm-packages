/**
 * Roman numerals. `toRoman(2024)` → "MMXXIV", `fromRoman("MMXXIV")` → 2024.
 * Classic subtractive notation, integers 1–3999.
 */

const ROMAN: [number, string][] = [
  [1000, "M"], [900, "CM"], [500, "D"], [400, "CD"],
  [100, "C"], [90, "XC"], [50, "L"], [40, "XL"],
  [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"],
];

const VALUES: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

/** Integer → Roman numeral (1–3999). `toRoman(4)` → "IV". */
export function toRoman(n: number): string {
  if (!Number.isInteger(n) || n < 1 || n > 3999) {
    throw new RangeError("toRoman: expects an integer between 1 and 3999");
  }
  let out = "";
  let v = n;
  for (const [num, sym] of ROMAN) {
    while (v >= num) { out += sym; v -= num; }
  }
  return out;
}

/** Roman numeral → integer. `fromRoman("IX")` → 9. Throws on malformed input. */
export function fromRoman(input: string): number {
  const str = input.trim().toUpperCase();
  if (!/^[MDCLXVI]+$/.test(str)) throw new Error(`fromRoman: invalid Roman numeral "${input}"`);
  let total = 0;
  for (let i = 0; i < str.length; i++) {
    const cur = VALUES[str[i]!]!;
    const next = i + 1 < str.length ? VALUES[str[i + 1]!]! : 0;
    total += cur < next ? -cur : cur;
  }
  // Canonical round-trip check rejects malformed spellings like "IIII" or "VX".
  if (total < 1 || total > 3999 || toRoman(total) !== str) {
    throw new Error(`fromRoman: invalid Roman numeral "${input}"`);
  }
  return total;
}
