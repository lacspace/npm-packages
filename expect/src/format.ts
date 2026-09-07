/**
 * Value formatting for error messages: a compact, circular-safe pretty-printer
 * plus a tiny expected/received diff block and a matcher hint line.
 */

import { isAsymmetric } from "./equals";

const MAX_DEPTH = 6;
const MAX_ITEMS = 100;
const MAX_STRING = 10000;

/** Pretty-print any value into a readable, deterministic string. */
export function format(value: unknown): string {
  return print(value, 0, new Set());
}

function quote(s: string): string {
  const truncated = s.length > MAX_STRING ? s.slice(0, MAX_STRING) + "…" : s;
  return JSON.stringify(truncated);
}

function print(value: unknown, depth: number, seen: Set<object>): string {
  switch (typeof value) {
    case "string":
      return quote(value);
    case "number":
      return Object.is(value, -0) ? "-0" : String(value);
    case "bigint":
      return `${value}n`;
    case "boolean":
    case "undefined":
      return String(value);
    case "symbol":
      return value.toString();
    case "function": {
      const name = (value as { name?: string }).name;
      return name ? `[Function ${name}]` : "[Function (anonymous)]";
    }
  }

  if (value === null) return "null";

  // Asymmetric matchers describe themselves.
  if (isAsymmetric(value)) {
    const m = value as { toAsymmetricMatcher?: () => string; toString(): string };
    return typeof m.toAsymmetricMatcher === "function"
      ? m.toAsymmetricMatcher()
      : m.toString();
  }

  const obj = value as object;

  if (seen.has(obj)) return "[Circular *]";
  if (depth >= MAX_DEPTH) return "[…]";

  if (value instanceof Date) {
    const t = value.getTime();
    return Number.isNaN(t) ? "Date(Invalid)" : `Date(${value.toISOString()})`;
  }
  if (value instanceof RegExp) return value.toString();
  if (value instanceof Error) return `[${value.name}: ${value.message}]`;

  seen.add(obj);
  try {
    if (Array.isArray(value)) {
      const items = value
        .slice(0, MAX_ITEMS)
        .map((v) => print(v, depth + 1, seen));
      if (value.length > MAX_ITEMS) items.push(`… ${value.length - MAX_ITEMS} more`);
      return `[${items.join(", ")}]`;
    }

    if (value instanceof Map) {
      const items: string[] = [];
      let i = 0;
      for (const [k, v] of value) {
        if (i++ >= MAX_ITEMS) {
          items.push("…");
          break;
        }
        items.push(`${print(k, depth + 1, seen)} => ${print(v, depth + 1, seen)}`);
      }
      return `Map(${value.size}) {${items.length ? " " + items.join(", ") + " " : ""}}`;
    }

    if (value instanceof Set) {
      const items: string[] = [];
      let i = 0;
      for (const v of value) {
        if (i++ >= MAX_ITEMS) {
          items.push("…");
          break;
        }
        items.push(print(v, depth + 1, seen));
      }
      return `Set(${value.size}) {${items.length ? " " + items.join(", ") + " " : ""}}`;
    }

    if (ArrayBuffer.isView(value) && !(value instanceof DataView)) {
      const arr = value as unknown as ArrayLike<number> & { constructor: { name: string } };
      const nums: string[] = [];
      for (let i = 0; i < Math.min(arr.length, MAX_ITEMS); i++) nums.push(String(arr[i]));
      return `${arr.constructor.name}(${arr.length}) [${nums.join(", ")}]`;
    }

    // Plain / class object.
    const ctor = (obj as { constructor?: { name?: string } }).constructor;
    const prefix = ctor && ctor.name && ctor.name !== "Object" ? `${ctor.name} ` : "";
    const entries: string[] = [];
    const keys = Object.keys(obj);
    for (let i = 0; i < keys.length && i < MAX_ITEMS; i++) {
      const k = keys[i] as string;
      entries.push(`${/^[A-Za-z_$][\w$]*$/.test(k) ? k : quote(k)}: ${print((obj as Record<string, unknown>)[k], depth + 1, seen)}`);
    }
    if (keys.length > MAX_ITEMS) entries.push(`… ${keys.length - MAX_ITEMS} more`);
    return `${prefix}{${entries.length ? " " + entries.join(", ") + " " : ""}}`;
  } finally {
    seen.delete(obj);
  }
}

/** A short "Expected / Received" block for failure messages. */
export function diff(expected: unknown, received: unknown): string {
  return `Expected: ${format(expected)}\nReceived: ${format(received)}`;
}

/** Builds an `expect(received).matcher(expected)` hint line. */
export function matcherHint(
  name: string,
  options: { isNot?: boolean; comment?: string } = {},
): string {
  const not = options.isNot ? ".not" : "";
  const comment = options.comment ? ` // ${options.comment}` : "";
  return `expect(received)${not}.${name}(expected)${comment}`;
}

/** A short label for the runtime type of a value. */
export function typeName(v: unknown): string {
  if (v === null) return "null";
  if (Array.isArray(v)) return "array";
  return typeof v;
}
