/**
 * Compare two `.env` files by key and (optionally) synthesise the missing keys
 * as placeholder lines for an example file.
 */
import { parseEnv } from "./parse.js";

/** The result of {@link diffEnvs}. */
export interface EnvDiff {
  /** Keys present in `b` but missing from `a`. */
  missingInA: string[];
  /** Keys present in `a` but missing from `b`. */
  missingInB: string[];
}

/** Diff two `.env` files by key. Takes file *contents*, not paths. */
export function diffEnvs(a: string, b: string): EnvDiff {
  const ka = Object.keys(parseEnv(a).map);
  const kb = Object.keys(parseEnv(b).map);
  const setA = new Set(ka);
  const setB = new Set(kb);
  return {
    missingInA: kb.filter((k) => !setA.has(k)),
    missingInB: ka.filter((k) => !setB.has(k)),
  };
}

/**
 * Append placeholder lines (`KEY=`) for `keys` to the end of `text`. Only ever
 * writes empty placeholders — never a real value. Returns the new text.
 */
export function appendKeys(text: string, keys: string[]): string {
  if (keys.length === 0) return text;
  const block = keys.map((k) => `${k}=`).join("\n");
  const sep = text.length === 0 || text.endsWith("\n") ? "" : "\n";
  return `${text}${sep}${block}\n`;
}
