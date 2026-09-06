/**
 * CI gate: verify that a set of environment variables (default `process.env`)
 * contains every key declared in an example file.
 */
import { parseEnv } from "./parse.js";

/** The result of {@link checkEnv}. */
export interface CheckResult {
  /** Keys required by the example that are missing/empty in the source. */
  missing: string[];
  ok: boolean;
}

/**
 * Check that `source` (default `process.env`) defines every key present in the
 * example file's text. A key set to an empty string counts as missing.
 */
export function checkEnv(
  exampleText: string,
  source: Record<string, string | undefined> = process.env,
): CheckResult {
  const keys = Object.keys(parseEnv(exampleText).map);
  const missing = keys.filter((k) => source[k] === undefined || source[k] === "");
  return { missing, ok: missing.length === 0 };
}
