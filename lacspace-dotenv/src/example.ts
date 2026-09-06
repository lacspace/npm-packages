/**
 * Derive a shareable file from a real `.env`:
 *
 *   - {@link toExample} blanks every value → a `.env.example` you can commit and
 *     hand to teammates (keys and comments kept, secrets gone), and
 *   - {@link redactEnv} masks every value → a copy safe to paste into a chat or
 *     an issue when you need to show the *shape* of the file without leaking it.
 *
 * Both preserve comments, blank lines and ordering, and rewrite a multiline
 * value in place on a single line (using the {@link EnvEntry.endLine} span) so
 * the surrounding structure is left intact.
 */
import { parseEnv } from "./parse.js";
import { maskSecret } from "./secrets.js";

/** Rewrite each assignment's value with `render(entry)`, keeping everything else. */
function transformValues(
  text: string,
  render: (key: string, value: string) => string,
): string {
  const { entries } = parseEnv(text);
  const lines = text.split(/\r?\n/);
  const starts = new Map<number, { key: string; value: string }>();
  const consumed = new Set<number>();
  for (const e of entries) {
    starts.set(e.line - 1, { key: e.key, value: e.value });
    for (let l = e.line; l < e.endLine; l++) consumed.add(l); // continuation lines
  }

  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (consumed.has(i)) continue;
    const start = starts.get(i);
    if (start) out.push(render(start.key, start.value));
    else out.push(lines[i]!);
  }
  // `split` produced a trailing "" for a file ending in "\n"; join restores it.
  return out.join("\n");
}

/** Options for {@link toExample}. */
export interface ToExampleOptions {
  /**
   * Text to place after `=` for each key. A string is used verbatim; a function
   * receives the key. Default is an empty placeholder (`KEY=`).
   */
  placeholder?: string | ((key: string) => string);
}

/**
 * Turn a real `.env` into a `.env.example`: every value is blanked (or replaced
 * with `placeholder`), while keys, comments and layout are preserved. Never
 * emits a real value.
 */
export function toExample(text: string, opts: ToExampleOptions = {}): string {
  const ph = opts.placeholder ?? "";
  const value = typeof ph === "function" ? ph : (): string => ph;
  return transformValues(text, (key) => `${key}=${value(key)}`);
}

/** Options for {@link redactEnv}. */
export interface RedactEnvOptions {
  /** Custom masker for a value. Default: {@link maskSecret} (a short hint, never the middle). */
  mask?: (value: string) => string;
}

/**
 * Return the file with every value masked — safe to paste. Empty values stay
 * empty; everything else is replaced by a hint that reveals neither the length
 * precisely nor the middle of the value.
 */
export function redactEnv(text: string, opts: RedactEnvOptions = {}): string {
  const mask = opts.mask ?? maskSecret;
  return transformValues(text, (key, value) => `${key}=${value === "" ? "" : mask(value)}`);
}
