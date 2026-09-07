/**
 * Acronym registry + shared options for the case converters.
 *
 * A converter can be told to preserve known acronyms verbatim (e.g. keep "API",
 * "URL", "ID" upper-cased) either per-call via {@link CaseOptions.acronyms} or
 * globally via {@link registerAcronyms}. The registry starts EMPTY, so default
 * conversion output is unchanged unless a consumer opts in.
 */

/** Options accepted by the acronym-aware case converters. */
export interface CaseOptions {
  /**
   * Acronyms to preserve verbatim in the output, matched case-insensitively.
   * e.g. `pascalCase("apiResponse", { acronyms: ["API"] })` → "APIResponse".
   * Merged with any globally-registered acronyms (see {@link registerAcronyms}).
   * No-op for the fixed-case forms (snake, kebab, constant, dot, path).
   */
  acronyms?: string[];
}

const registry = new Set<string>();

/** Register acronyms to preserve globally in every acronym-aware conversion. */
export function registerAcronyms(...names: string[]): void {
  for (const n of names) if (n) registry.add(n);
}

/** The acronyms currently registered globally. */
export function getAcronyms(): string[] {
  return [...registry];
}

/** Remove every globally-registered acronym (resets to the default empty state). */
export function clearAcronyms(): void {
  registry.clear();
}

/**
 * Build a `lowercase → canonical` lookup from the global registry plus an
 * optional per-call list. Per-call entries win on collision.
 */
export function acronymMap(extra?: string[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const a of registry) m.set(a.toLowerCase(), a);
  if (extra) for (const a of extra) if (a) m.set(a.toLowerCase(), a);
  return m;
}
