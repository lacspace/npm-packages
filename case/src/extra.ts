/**
 * Additional case forms and `is<Case>` detectors, layered on top of the core
 * converters. All are acronym-aware where meaningful and share the same
 * {@link words} splitter, so results stay consistent with the rest of the API.
 */

import {
  words,
  camelCase,
  pascalCase,
  snakeCase,
  kebabCase,
  constantCase,
  dotCase,
  pathCase,
  titleCase,
  sentenceCase,
} from "./index";
import { type CaseOptions, acronymMap } from "./acronyms";

const cap = (w: string): string => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
const lower = (w: string): string => w.toLowerCase();

/** Header-Case / Train-Case. `headerCase("foo bar")` → "Foo-Bar". */
export function headerCase(input: string, options?: CaseOptions): string {
  const m = acronymMap(options?.acronyms);
  return words(input).map((w) => m.get(w.toLowerCase()) ?? cap(w)).join("-");
}

/** Alias of {@link headerCase} — Train-Case. `trainCase("foo bar")` → "Foo-Bar". */
export const trainCase = headerCase;

/** Capital Case — every word capitalised, space-separated. `capitalCase("foo_bar")` → "Foo Bar". */
export function capitalCase(input: string, options?: CaseOptions): string {
  const m = acronymMap(options?.acronyms);
  return words(input).map((w) => m.get(w.toLowerCase()) ?? cap(w)).join(" ");
}

/** no case — space-separated all-lowercase. `noCase("fooBar")` → "foo bar". */
export function noCase(input: string): string {
  return words(input).map(lower).join(" ");
}

/** `true` if `input` is already valid camelCase (converting it is a no-op). */
export function isCamelCase(input: string): boolean {
  return input.length > 0 && camelCase(input) === input;
}

/** `true` if `input` is already valid PascalCase. */
export function isPascalCase(input: string): boolean {
  return input.length > 0 && pascalCase(input) === input;
}

/** `true` if `input` is already valid snake_case. */
export function isSnakeCase(input: string): boolean {
  return input.length > 0 && snakeCase(input) === input;
}

/** `true` if `input` is already valid kebab-case. */
export function isKebabCase(input: string): boolean {
  return input.length > 0 && kebabCase(input) === input;
}

/** `true` if `input` is already valid CONSTANT_CASE. */
export function isConstantCase(input: string): boolean {
  return input.length > 0 && constantCase(input) === input;
}

/** `true` if `input` is already valid dot.case. */
export function isDotCase(input: string): boolean {
  return input.length > 0 && dotCase(input) === input;
}

/** `true` if `input` is already valid path/case. */
export function isPathCase(input: string): boolean {
  return input.length > 0 && pathCase(input) === input;
}

/** `true` if `input` is already Title Case. */
export function isTitleCase(input: string): boolean {
  return input.length > 0 && titleCase(input) === input;
}

/** `true` if `input` is already Sentence case. */
export function isSentenceCase(input: string): boolean {
  return input.length > 0 && sentenceCase(input) === input;
}

/** `true` if `input` is already Header-Case / Train-Case. */
export function isHeaderCase(input: string): boolean {
  return input.length > 0 && headerCase(input) === input;
}

/** `true` if `input` is already "no case" (space-separated lowercase). */
export function isNoCase(input: string): boolean {
  return input.length > 0 && noCase(input) === input;
}
