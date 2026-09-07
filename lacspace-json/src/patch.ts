/**
 * RFC 6902 JSON Patch — apply an array of `{ op, path, ... }` operations to a
 * document (`patch`), and generate a patch that turns one document into another
 * (`diffPatch`). Pure, zero-dependency, browser-safe. Prototype-pollution safe.
 *
 * Supported ops: `add`, `remove`, `replace`, `move`, `copy`, `test`.
 *
 * ```ts
 * patch({ a: 1 }, [{ op: "add", path: "/b", value: 2 }]);      // { a: 1, b: 2 }
 * diffPatch({ a: 1 }, { a: 2 });                                // [{ op: "replace", path: "/a", value: 2 }]
 * ```
 *
 * Array diffing is pragmatic: element-wise ops are emitted when two arrays share
 * a length, otherwise the whole array is `replace`d — always correct, if not
 * always minimal.
 */
import { JsonToolError, isPlainObject, deepEqual, deepClone, isForbiddenKey, safeSet } from "./util.js";
import type { JsonValue } from "./util.js";
import { parsePointer, buildPointer } from "./pointer.js";

export type PatchOp =
  | { op: "add"; path: string; value: JsonValue }
  | { op: "remove"; path: string }
  | { op: "replace"; path: string; value: JsonValue }
  | { op: "move"; from: string; path: string }
  | { op: "copy"; from: string; path: string }
  | { op: "test"; path: string; value: JsonValue };

export type JsonPatch = PatchOp[];

interface Parent {
  container: JsonValue[] | Record<string, JsonValue>;
  token: string;
}

/** Resolve the parent container + final token of a pointer, for set/remove. */
function resolveParent(root: JsonValue, ptr: string): Parent {
  const tokens = parsePointer(ptr);
  if (tokens.length === 0) throw new JsonToolError(`Operation targets the whole document ("${ptr}") — handle it before resolveParent`);
  let cur: JsonValue = root;
  for (let i = 0; i < tokens.length - 1; i++) {
    const token = tokens[i]!;
    if (Array.isArray(cur)) {
      const idx = /^\d+$/.test(token) ? Number(token) : NaN;
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) throw new JsonToolError(`Patch path "${ptr}" has no array index "${token}"`);
      cur = cur[idx]!;
    } else if (isPlainObject(cur)) {
      if (!Object.prototype.hasOwnProperty.call(cur, token)) throw new JsonToolError(`Patch path "${ptr}" has no key "${token}"`);
      cur = (cur as Record<string, JsonValue>)[token]!;
    } else {
      throw new JsonToolError(`Patch path "${ptr}" descends into a non-container at "${token}"`);
    }
  }
  if (!Array.isArray(cur) && !isPlainObject(cur)) throw new JsonToolError(`Patch path "${ptr}" has a non-container parent`);
  return { container: cur as JsonValue[] | Record<string, JsonValue>, token: tokens[tokens.length - 1]! };
}

function getValue(root: JsonValue, ptr: string): JsonValue {
  const tokens = parsePointer(ptr);
  let cur: JsonValue = root;
  for (const token of tokens) {
    if (Array.isArray(cur)) {
      const idx = /^\d+$/.test(token) ? Number(token) : NaN;
      if (!Number.isInteger(idx) || idx < 0 || idx >= cur.length) throw new JsonToolError(`Patch "from" path "${ptr}" has no index "${token}"`);
      cur = cur[idx]!;
    } else if (isPlainObject(cur)) {
      if (!Object.prototype.hasOwnProperty.call(cur, token)) throw new JsonToolError(`Patch "from" path "${ptr}" has no key "${token}"`);
      cur = (cur as Record<string, JsonValue>)[token]!;
    } else {
      throw new JsonToolError(`Patch "from" path "${ptr}" descends into a non-container at "${token}"`);
    }
  }
  return cur;
}

function addAt(root: JsonValue, ptr: string, value: JsonValue): JsonValue {
  if (ptr === "") return deepClone(value);
  const { container, token } = resolveParent(root, ptr);
  if (Array.isArray(container)) {
    if (token === "-") { container.push(deepClone(value)); return root; }
    const idx = /^\d+$/.test(token) ? Number(token) : NaN;
    if (!Number.isInteger(idx) || idx < 0 || idx > container.length) throw new JsonToolError(`Patch add index "${token}" out of range`);
    container.splice(idx, 0, deepClone(value));
  } else {
    if (isForbiddenKey(token)) throw new JsonToolError(`Refusing to add unsafe key "${token}"`);
    safeSet(container, token, deepClone(value));
  }
  return root;
}

function removeAt(root: JsonValue, ptr: string): JsonValue {
  if (ptr === "") return null;
  const { container, token } = resolveParent(root, ptr);
  if (Array.isArray(container)) {
    const idx = /^\d+$/.test(token) ? Number(token) : NaN;
    if (!Number.isInteger(idx) || idx < 0 || idx >= container.length) throw new JsonToolError(`Patch remove index "${token}" out of range`);
    container.splice(idx, 1);
  } else {
    if (!Object.prototype.hasOwnProperty.call(container, token)) throw new JsonToolError(`Patch remove key "${token}" does not exist`);
    delete (container as Record<string, JsonValue>)[token];
  }
  return root;
}

function replaceAt(root: JsonValue, ptr: string, value: JsonValue): JsonValue {
  if (ptr === "") return deepClone(value);
  const { container, token } = resolveParent(root, ptr);
  if (Array.isArray(container)) {
    const idx = /^\d+$/.test(token) ? Number(token) : NaN;
    if (!Number.isInteger(idx) || idx < 0 || idx >= container.length) throw new JsonToolError(`Patch replace index "${token}" out of range`);
    container[idx] = deepClone(value);
  } else {
    if (!Object.prototype.hasOwnProperty.call(container, token)) throw new JsonToolError(`Patch replace key "${token}" does not exist`);
    if (isForbiddenKey(token)) throw new JsonToolError(`Refusing to replace unsafe key "${token}"`);
    safeSet(container, token, deepClone(value));
  }
  return root;
}

/**
 * Apply an RFC 6902 patch to `doc`, returning a new document (the input is never
 * mutated). Throws {@link JsonToolError} on any failed operation (out-of-range
 * index, missing key, failed `test`).
 */
export function patch(doc: JsonValue, ops: JsonPatch): JsonValue {
  if (!Array.isArray(ops)) throw new JsonToolError("JSON Patch must be an array of operations");
  let root: JsonValue = deepClone(doc);
  ops.forEach((op, i) => {
    if (!isPlainObject(op) || typeof (op as Record<string, unknown>)["op"] !== "string") {
      throw new JsonToolError(`Patch op #${i} is not a valid operation object`);
    }
    switch (op.op) {
      case "add": root = addAt(root, op.path, op.value); break;
      case "remove": root = removeAt(root, op.path); break;
      case "replace": root = replaceAt(root, op.path, op.value); break;
      case "test": {
        const actual = getValue(root, op.path);
        if (!deepEqual(actual, op.value)) throw new JsonToolError(`Patch test failed at "${op.path}"`);
        break;
      }
      case "move": {
        if (op.path === op.from) break;
        if (op.path.startsWith(op.from + "/")) throw new JsonToolError(`Cannot move "${op.from}" into its own child "${op.path}"`);
        const moved = getValue(root, op.from);
        root = removeAt(root, op.from);
        root = addAt(root, op.path, moved);
        break;
      }
      case "copy": {
        const copied = getValue(root, op.from);
        root = addAt(root, op.path, copied);
        break;
      }
      default: throw new JsonToolError(`Unknown patch op "${(op as { op: string }).op}"`);
    }
  });
  return root;
}

function walkDiff(a: JsonValue, b: JsonValue, base: Array<string | number>, out: PatchOp[]): void {
  if (deepEqual(a, b)) return;
  if (isPlainObject(a) && isPlainObject(b)) {
    for (const k of Object.keys(a)) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) out.push({ op: "remove", path: buildPointer([...base, k]) });
    }
    for (const k of Object.keys(b)) {
      if (!Object.prototype.hasOwnProperty.call(a, k)) out.push({ op: "add", path: buildPointer([...base, k]), value: deepClone(b[k]!) });
      else walkDiff(a[k]!, b[k]!, [...base, k], out);
    }
    return;
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    for (let i = 0; i < a.length; i++) walkDiff(a[i]!, b[i]!, [...base, i], out);
    return;
  }
  out.push({ op: "replace", path: buildPointer(base), value: deepClone(b) });
}

/**
 * Generate an RFC 6902 patch that transforms `a` into `b`. Applying the result
 * with {@link patch} reproduces `b` exactly. Arrays that differ in length are
 * replaced wholesale (pragmatic, always correct).
 */
export function diffPatch(a: JsonValue, b: JsonValue): JsonPatch {
  const out: PatchOp[] = [];
  walkDiff(a, b, [], out);
  return out;
}
