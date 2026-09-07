/**
 * Small pure helpers shared across the engines: prototype-pollution-safe object
 * building, identifier/name handling and TypeScript literal rendering.
 */
import type { JsonValue } from "./types.js";

/** Keys that must never be assigned as ordinary data (prototype pollution). */
export const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

/**
 * Assign a key onto an object safely, even when the key is `__proto__` or
 * another dangerous name — the value lands as a normal own property and can
 * never poison the prototype chain.
 */
export function safeSet<T>(obj: Record<string, T>, key: string, value: T): void {
  Object.defineProperty(obj, key, {
    value,
    enumerable: true,
    writable: true,
    configurable: true,
  });
}

/** Own enumerable keys of a plain object, excluding dangerous prototype keys. */
export function safeKeys(obj: object): string[] {
  const out: string[] = [];
  for (const k of Object.keys(obj)) {
    if (!DANGEROUS_KEYS.has(k)) out.push(k);
  }
  return out;
}

/** True for a plain (non-array, non-null) object. */
export function isPlainObject(v: unknown): v is Record<string, JsonValue> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/** Whether a string is a safe bare TS identifier / unquoted property key. */
export function isValidIdentifier(key: string): boolean {
  return IDENT_RE.test(key);
}

/** Render a property key: bare when it is a valid identifier, else quoted. */
export function propKey(key: string): string {
  return isValidIdentifier(key) ? key : JSON.stringify(key);
}

/** Convert an arbitrary string to a PascalCase TypeScript type name. */
export function pascalCase(input: string): string {
  const parts = input.split(/[^A-Za-z0-9]+/).filter(Boolean);
  let name = parts
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join("");
  if (!name) name = "Type";
  if (/^[0-9]/.test(name)) name = "_" + name;
  return name;
}

/** Naive English singularization for naming array-item interfaces. */
export function singularize(word: string): string {
  if (/ies$/i.test(word)) return word.slice(0, -3) + "y";
  if (/(ses|xes|zes|ches|shes)$/i.test(word)) return word.slice(0, -2);
  if (/ss$/i.test(word)) return word;
  if (/s$/i.test(word)) return word.slice(0, -1);
  return word;
}

/** Render a JSON value as a TypeScript string-literal / numeric-literal type. */
export function tsLiteral(value: JsonValue): string {
  if (value === null) return "null";
  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "number":
    case "boolean":
      return String(value);
    default:
      // objects/arrays as const literals are rare; fall back to a safe type.
      return typeof value === "object" ? "unknown" : String(value);
  }
}

/** Indent every non-empty line of `text` by `n` spaces. */
export function indentLines(text: string, n: number): string {
  const pad = " ".repeat(n);
  return text
    .split("\n")
    .map((l) => (l.length ? pad + l : l))
    .join("\n");
}
