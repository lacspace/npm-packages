import type { SerializeContext, SerializeOptions, SerializerPlugin } from "./types";
import { _globalSerializers } from "./registry";

/**
 * Deterministically serialize any JavaScript value to a stable, pretty string
 * suitable for snapshot testing.
 *
 * Guarantees:
 * - Object keys are **sorted** so property order never affects the output.
 * - `Map` and `Set` entries are sorted by their serialized key/value, so
 *   insertion order never affects the output either.
 * - Circular references are rendered as `[Circular]` instead of throwing.
 *
 * Handles primitives (including `undefined`, `NaN`, `-0`, `bigint`, `symbol`),
 * arrays, plain objects, class instances (labelled with the constructor name),
 * `Map`, `Set`, `Date`, `RegExp`, `Error`, functions and typed arrays. Custom
 * types can be handled with `options.serializers` or {@link addSerializer}.
 */
export function serialize(value: unknown, options: SerializeOptions = {}): string {
  const indentSize = options.indent ?? 2;
  const indentUnit = " ".repeat(Math.max(0, indentSize));
  const maxDepth = options.maxDepth ?? Infinity;
  const printFunctionNames = options.printFunctionNames ?? true;
  // Local plugins take priority, then globals. Both lists put highest-priority first.
  const plugins: SerializerPlugin[] = [
    ...(options.serializers ? options.serializers.slice().reverse() : []),
    ..._globalSerializers(),
  ];

  // Ancestor stack for circular-reference detection.
  const ancestors: unknown[] = [];

  function go(val: unknown, indentation: string, depth: number): string {
    // Plugins first — they may override even built-in handling.
    for (const p of plugins) {
      let matched = false;
      try {
        matched = p.test(val);
      } catch {
        matched = false;
      }
      if (matched) {
        const ctx: SerializeContext = {
          indent: indentUnit,
          indentation,
          depth,
          print: (child) => go(child, indentation + indentUnit, depth + 1),
        };
        return p.serialize(val, ctx);
      }
    }
    return builtin(val, indentation, depth);
  }

  function builtin(val: unknown, indentation: string, depth: number): string {
    if (val === null) return "null";

    const type = typeof val;
    switch (type) {
      case "undefined":
        return "undefined";
      case "boolean":
        return val ? "true" : "false";
      case "number":
        return formatNumber(val as number);
      case "bigint":
        return `${(val as bigint).toString()}n`;
      case "string":
        return JSON.stringify(val);
      case "symbol":
        return (val as symbol).toString();
      case "function":
        return formatFunction(val as (...a: unknown[]) => unknown, printFunctionNames);
      default:
        break;
    }

    // typeof === "object" from here.
    const obj = val as object;

    // Circular reference?
    if (ancestors.indexOf(obj) !== -1) return "[Circular]";

    if (obj instanceof Date) {
      const t = obj.getTime();
      return Number.isNaN(t) ? "Date { Invalid Date }" : obj.toISOString();
    }
    if (obj instanceof RegExp) return obj.toString();
    if (obj instanceof Error) {
      const name = obj.name || "Error";
      return obj.message ? `[${name}: ${obj.message}]` : `[${name}]`;
    }

    const inner = indentation + indentUnit;
    const nextDepth = depth + 1;
    const collapsed = depth > maxDepth;

    // Typed arrays (but not DataView).
    if (ArrayBuffer.isView(obj) && !(obj instanceof DataView)) {
      const ta = obj as unknown as { length: number; constructor: { name: string } } & ArrayLike<unknown>;
      const label = ta.constructor?.name || "TypedArray";
      if (collapsed) return `[${label}]`;
      ancestors.push(obj);
      const items: string[] = [];
      for (let i = 0; i < ta.length; i++) items.push(go(ta[i], inner, nextDepth));
      ancestors.pop();
      return wrap(`${label} `, "[", "]", items, indentation, indentUnit);
    }

    if (Array.isArray(obj)) {
      if (collapsed) return "[Array]";
      ancestors.push(obj);
      const items: string[] = [];
      for (let i = 0; i < obj.length; i++) items.push(go(obj[i], inner, nextDepth));
      ancestors.pop();
      return wrap("Array ", "[", "]", items, indentation, indentUnit);
    }

    if (obj instanceof Map) {
      if (collapsed) return "[Map]";
      ancestors.push(obj);
      const entries: string[] = [];
      for (const [k, v] of obj) {
        const keyStr = go(k, inner, nextDepth);
        const valStr = go(v, inner, nextDepth);
        entries.push(`${keyStr} => ${valStr}`);
      }
      ancestors.pop();
      entries.sort(compareStrings);
      return wrap("Map ", "{", "}", entries, indentation, indentUnit);
    }

    if (obj instanceof Set) {
      if (collapsed) return "[Set]";
      ancestors.push(obj);
      const items: string[] = [];
      for (const v of obj) items.push(go(v, inner, nextDepth));
      ancestors.pop();
      items.sort(compareStrings);
      return wrap("Set ", "{", "}", items, indentation, indentUnit);
    }

    // Plain object or class instance.
    const proto = Object.getPrototypeOf(obj);
    const ctorName =
      proto === null || proto === Object.prototype
        ? "Object"
        : (obj as { constructor?: { name?: string } }).constructor?.name || "Object";

    if (collapsed) return `[${ctorName}]`;

    ancestors.push(obj);
    const items: string[] = [];
    const stringKeys = Object.keys(obj).sort(compareStrings);
    for (const key of stringKeys) {
      items.push(`${JSON.stringify(key)}: ${safeGo(obj, key, inner, nextDepth)}`);
    }
    const symbolKeys = Object.getOwnPropertySymbols(obj)
      .filter((s) => Object.prototype.propertyIsEnumerable.call(obj, s))
      .sort((a, b) => compareStrings(a.toString(), b.toString()));
    for (const sym of symbolKeys) {
      items.push(`${sym.toString()}: ${safeGoSym(obj, sym, inner, nextDepth)}`);
    }
    ancestors.pop();

    return wrap(`${ctorName} `, "{", "}", items, indentation, indentUnit);
  }

  function safeGo(obj: object, key: string, indentation: string, depth: number): string {
    try {
      return go((obj as Record<string, unknown>)[key], indentation, depth);
    } catch (e) {
      return `[Thrown: ${(e as Error)?.message ?? String(e)}]`;
    }
  }

  function safeGoSym(obj: object, sym: symbol, indentation: string, depth: number): string {
    try {
      return go((obj as Record<symbol, unknown>)[sym], indentation, depth);
    } catch (e) {
      return `[Thrown: ${(e as Error)?.message ?? String(e)}]`;
    }
  }

  return go(value, "", 0);
}

function wrap(
  prefix: string,
  open: string,
  close: string,
  items: string[],
  indentation: string,
  indentUnit: string,
): string {
  if (items.length === 0) return `${prefix}${open}${close}`;
  const inner = indentation + indentUnit;
  const body = items.map((i) => inner + i).join(",\n");
  return `${prefix}${open}\n${body},\n${indentation}${close}`;
}

function formatNumber(n: number): string {
  if (Number.isNaN(n)) return "NaN";
  if (n === Infinity) return "Infinity";
  if (n === -Infinity) return "-Infinity";
  if (Object.is(n, -0)) return "-0";
  return String(n);
}

function formatFunction(fn: (...a: unknown[]) => unknown, printNames: boolean): string {
  if (!printNames) return "[Function]";
  const name = fn.name;
  return name ? `[Function ${name}]` : "[Function anonymous]";
}

function compareStrings(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
