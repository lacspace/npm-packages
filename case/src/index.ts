/**
 * @lacspace/case
 *
 * Convert strings between cases — camelCase, PascalCase, snake_case,
 * kebab-case, CONSTANT_CASE, Title Case, Sentence case. Handles acronyms,
 * numbers, and mixed input. Zero-dependency, isomorphic.
 */

/**
 * Split any string into its constituent words — the basis for every case
 * conversion. Handles spaces, underscores, hyphens, dots, camelCase and
 * ACRONYMBoundaries.
 *
 * @example words("XMLHttpRequest_v2") // ["XML", "Http", "Request", "v2"]
 */
export function words(input: string): string[] {
  return (
    String(input)
      // split camelCase / PascalCase and acronym boundaries
      .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
      .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
      // split letter/number boundaries
      .replace(/([a-zA-Z])([0-9])/g, "$1 $2")
      .replace(/([0-9])([a-zA-Z])/g, "$1 $2")
      // separators → space
      .replace(/[_\-.\s/\\]+/g, " ")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
  );
}

const cap = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
const lower = (w: string): string => w.toLowerCase();

/** camelCase. `camelCase("foo_bar")` → "fooBar". */
export function camelCase(input: string): string {
  return words(input).map((w, i) => (i === 0 ? lower(w) : cap(w))).join("");
}

/** PascalCase. `pascalCase("foo_bar")` → "FooBar". */
export function pascalCase(input: string): string {
  return words(input).map(cap).join("");
}

/** snake_case. `snakeCase("fooBar")` → "foo_bar". */
export function snakeCase(input: string): string {
  return words(input).map(lower).join("_");
}

/** kebab-case. `kebabCase("fooBar")` → "foo-bar". */
export function kebabCase(input: string): string {
  return words(input).map(lower).join("-");
}

/** CONSTANT_CASE. `constantCase("fooBar")` → "FOO_BAR". */
export function constantCase(input: string): string {
  return words(input).map((w) => w.toUpperCase()).join("_");
}

/** dot.case. `dotCase("fooBar")` → "foo.bar". */
export function dotCase(input: string): string {
  return words(input).map(lower).join(".");
}

/** path/case. `pathCase("fooBar")` → "foo/bar". */
export function pathCase(input: string): string {
  return words(input).map(lower).join("/");
}

/** Title Case. `titleCase("foo bar")` → "Foo Bar". */
export function titleCase(input: string): string {
  return words(input).map(cap).join(" ");
}

/** Sentence case. `sentenceCase("foo_bar")` → "Foo bar". */
export function sentenceCase(input: string): string {
  const w = words(input).map(lower);
  if (w.length === 0) return "";
  w[0] = cap(w[0]!);
  return w.join(" ");
}

/** Capitalize the first character only. */
export function capitalize(input: string): string {
  return input.charAt(0).toUpperCase() + input.slice(1);
}

export type CaseName =
  | "camel" | "pascal" | "snake" | "kebab" | "constant"
  | "dot" | "path" | "title" | "sentence";

const CONVERTERS: Record<CaseName, (s: string) => string> = {
  camel: camelCase, pascal: pascalCase, snake: snakeCase, kebab: kebabCase,
  constant: constantCase, dot: dotCase, path: pathCase, title: titleCase, sentence: sentenceCase,
};

/** Convert to a named case at runtime. `changeCase("fooBar", "kebab")` → "foo-bar". */
export function changeCase(input: string, to: CaseName): string {
  return CONVERTERS[to](input);
}
