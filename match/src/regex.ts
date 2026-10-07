export interface SafeRegexOptions {
  /** Longest pattern accepted, in characters. Default 256. */
  maxPatternLength?: number;
  /** Only this many characters of the input are tested. Default 10 000. */
  maxInputLength?: number;
}

export const DEFAULT_MAX_PATTERN_LENGTH = 256;
export const DEFAULT_MAX_INPUT_LENGTH = 10_000;

/**
 * Check a pattern for the shapes that cause catastrophic backtracking or are
 * otherwise disallowed. Returns an error message, or null when it is acceptable.
 * Rejects: patterns over the length limit; backreferences (\1–\9, \k<name>);
 * a group that contains a quantifier (*, + or {…}) and is itself quantified with
 * *, + or {…}, at any nesting depth (e.g. (a+)+, (a*)*, ((ab)+){2,}, (?:x+y)*).
 */
export function checkPattern(pattern: string, maxLength = DEFAULT_MAX_PATTERN_LENGTH): string | null {
  if (typeof pattern !== "string") return "pattern must be a string";
  if (pattern.length > maxLength) return `pattern is longer than ${maxLength} characters`;
  const stack: Array<{ quant: boolean }> = [{ quant: false }];
  const n = pattern.length;
  let i = 0;
  const isQuantStart = (at: number): number => {
    // returns the length of a *, + or {n,m} quantifier starting at `at`, else 0
    const c = pattern[at];
    if (c === "*" || c === "+") return 1;
    if (c === "{") {
      const m = /^\{\d+(,\d*)?\}/.exec(pattern.slice(at, at + 24));
      return m ? m[0].length : 0;
    }
    return 0;
  };
  while (i < n) {
    const c = pattern[i];
    if (c === "\\") {
      const d = pattern[i + 1];
      if (d !== undefined && /[1-9]/.test(d)) return "backreferences are not allowed";
      if (d === "k" && pattern[i + 2] === "<") return "backreferences are not allowed";
      i += 2;
      continue;
    }
    if (c === "[") {
      i++;
      if (pattern[i] === "^") i++;
      if (pattern[i] === "]") i++;
      while (i < n && pattern[i] !== "]") i += pattern[i] === "\\" ? 2 : 1;
      i++;
      continue;
    }
    if (c === "(") {
      stack.push({ quant: false });
      i++;
      if (pattern[i] === "?") {
        i++;
        if (pattern[i] === "<" && pattern[i + 1] !== "=" && pattern[i + 1] !== "!") {
          const close = pattern.indexOf(">", i);
          i = close === -1 ? n : close + 1; // named group (?<name>…)
        } else if (pattern[i] === "<") i += 2; // (?<= / (?<!
        else i++; // (?: (?= (?!
      }
      continue;
    }
    if (c === ")") {
      const g = stack.length > 1 ? stack.pop()! : { quant: false };
      i++;
      const q = isQuantStart(i);
      if (q && g.quant) return "nested quantifiers like (a+)+ are not allowed";
      const parent = stack[stack.length - 1]!;
      if (q || g.quant) parent.quant = true;
      if (q) i += q;
      continue;
    }
    const q = isQuantStart(i);
    if (q) {
      stack[stack.length - 1]!.quant = true;
      i += q;
      continue;
    }
    i++;
  }
  return null;
}

const CACHE_MAX = 500;
const cache = new Map<string, RegExp | string>();

/**
 * Compile a pattern after `checkPattern`. Accepts "pattern", "/pattern/flags" or a
 * RegExp. Only the i, m, s and u flags are kept (g and y are dropped so .test() has
 * no state). `caseSensitive: false` adds i. Returns a RegExp or an error string. Never throws.
 */
export function compileSafe(value: unknown, caseSensitive = false, opts: SafeRegexOptions = {}): RegExp | string {
  let source: string;
  let flags = "";
  if (value instanceof RegExp) {
    source = value.source;
    flags = value.flags;
  } else if (typeof value === "string") {
    const m = /^\/([\s\S]*)\/([a-z]*)$/.exec(value);
    if (m && m[1] !== undefined && value.length > 2) {
      source = m[1];
      flags = m[2] ?? "";
    } else source = value;
  } else return "regex value must be a string or RegExp";
  const keep = new Set([...flags].filter((f) => "imsu".includes(f)));
  if (!caseSensitive) keep.add("i");
  const f = [...keep].sort().join("");
  const maxLen = typeof opts.maxPatternLength === "number" && opts.maxPatternLength > 0 ? opts.maxPatternLength : DEFAULT_MAX_PATTERN_LENGTH;
  const key = `${maxLen}\u0000${f}\u0000${source}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let out: RegExp | string;
  const err = checkPattern(source, maxLen);
  if (err) out = err;
  else {
    try {
      out = new RegExp(source, f);
    } catch (e) {
      out = `invalid regex: ${(e as Error).message}`;
    }
  }
  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, out);
  return out;
}

/** Test a compiled regex against at most `maxInputLength` characters of `input`. */
export function testCapped(re: RegExp, input: string, maxInputLength = DEFAULT_MAX_INPUT_LENGTH): boolean {
  re.lastIndex = 0;
  return re.test(input.length > maxInputLength ? input.slice(0, maxInputLength) : input);
}
