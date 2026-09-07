/**
 * JSONPath ($-style) — a pragmatic, hand-written subset of Goessner JSONPath.
 * Pure, zero-dependency, browser-safe, no `eval`.
 *
 * Supported:
 *   - root `$`
 *   - child `.name`, `['name']`, `["name"]`
 *   - wildcard `.*`, `[*]`
 *   - recursive descent `..name`, `..*`, `..[...]`
 *   - array index `[0]`, negative `[-1]`, union `[0,2]`, slice `[1:3]`, `[::2]`
 *   - filter `[?(@.price < 10)]` with `< <= > >= == != =~` and `&&` / `||`,
 *     `@.field` / `@['field']` accessors, and number / string / true / false /
 *     null literals; a bare `[?(@.field)]` tests existence/truthiness.
 *
 * NOT supported (documented): script expressions `[(...)]`, functions
 * (`length()` etc.), parent/`^` navigation. `jsonPath` returns the matched
 * values in document order; use {@link jsonPathPaths} for their pointer paths.
 */
import { JsonToolError, isPlainObject, deepEqual } from "./util.js";
import type { JsonValue } from "./util.js";
import { buildPointer } from "./pointer.js";

interface Node {
  value: JsonValue;
  path: Array<string | number>;
}

type Comparator = "<" | "<=" | ">" | ">=" | "==" | "!=" | "=~";

interface Cmp { kind: "cmp"; accessor: string[]; op: Comparator; literal: JsonValue | RegExp }
interface Exists { kind: "exists"; accessor: string[] }
type Predicate =
  | Cmp
  | Exists
  | { kind: "and"; a: Predicate; b: Predicate }
  | { kind: "or"; a: Predicate; b: Predicate };

type Step =
  | { type: "child"; name: string }
  | { type: "wildcard" }
  | { type: "descendant" }
  | { type: "index"; index: number }
  | { type: "union"; indices: number[] }
  | { type: "slice"; start?: number; end?: number; step: number }
  | { type: "filter"; predicate: Predicate };

// --- parsing ---------------------------------------------------------------

function parseBracket(inner: string): Step {
  const s = inner.trim();
  if (s === "*") return { type: "wildcard" };
  if (s[0] === "?") {
    const m = /^\?\((.*)\)$/.exec(s);
    if (!m) throw new JsonToolError(`Malformed filter "[${inner}]"`);
    return { type: "filter", predicate: parsePredicate(m[1]!) };
  }
  if ((s[0] === "'" && s.endsWith("'")) || (s[0] === '"' && s.endsWith('"'))) {
    return { type: "child", name: s.slice(1, -1) };
  }
  if (s.includes(",")) {
    const indices = s.split(",").map((p) => Number(p.trim()));
    if (indices.some((n) => !Number.isInteger(n))) {
      // union of quoted names → collapse to wildcard-ish is out of scope; treat as names via child steps is impossible here.
      throw new JsonToolError(`Only numeric unions are supported in "[${inner}]"`);
    }
    return { type: "union", indices };
  }
  if (s.includes(":")) {
    const parts = s.split(":");
    const start = parts[0]!.trim() === "" ? undefined : Number(parts[0]);
    const end = parts[1]!.trim() === "" ? undefined : Number(parts[1]);
    const step = parts[2] === undefined || parts[2].trim() === "" ? 1 : Number(parts[2]);
    return { type: "slice", ...(start !== undefined ? { start } : {}), ...(end !== undefined ? { end } : {}), step };
  }
  if (/^-?\d+$/.test(s)) return { type: "index", index: Number(s) };
  return { type: "child", name: s };
}

function parseAccessor(expr: string): string[] {
  // "@.a.b" or "@['a']['b']" → ["a","b"]
  let s = expr.trim();
  if (!s.startsWith("@")) throw new JsonToolError(`Filter accessor must start with "@" (got "${expr}")`);
  s = s.slice(1);
  const out: string[] = [];
  let i = 0;
  while (i < s.length) {
    if (s[i] === ".") { i++; let name = ""; while (i < s.length && /[A-Za-z0-9_$-]/.test(s[i]!)) name += s[i++]; out.push(name); }
    else if (s[i] === "[") {
      const close = s.indexOf("]", i);
      if (close < 0) throw new JsonToolError(`Unbalanced [ in accessor "${expr}"`);
      let inner = s.slice(i + 1, close).trim();
      if ((inner[0] === "'" && inner.endsWith("'")) || (inner[0] === '"' && inner.endsWith('"'))) inner = inner.slice(1, -1);
      out.push(inner);
      i = close + 1;
    } else i++;
  }
  return out;
}

function parseLiteral(raw: string): JsonValue {
  const s = raw.trim();
  if ((s[0] === "'" && s.endsWith("'")) || (s[0] === '"' && s.endsWith('"'))) return s.slice(1, -1);
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  const n = Number(s);
  if (!Number.isNaN(n) && s !== "") return n;
  throw new JsonToolError(`Unsupported literal "${raw}" in filter`);
}

function parseComparison(expr: string): Predicate {
  const ops: Comparator[] = ["<=", ">=", "==", "!=", "=~", "<", ">"];
  for (const op of ops) {
    const idx = expr.indexOf(op);
    if (idx >= 0) {
      const left = expr.slice(0, idx);
      const right = expr.slice(idx + op.length).trim();
      const accessor = parseAccessor(left);
      if (op === "=~") {
        const m = /^\/(.*)\/([a-z]*)$/.exec(right);
        if (!m) throw new JsonToolError(`=~ needs a /regex/ literal (got "${right}")`);
        return { kind: "cmp", accessor, op, literal: new RegExp(m[1]!, m[2]) };
      }
      return { kind: "cmp", accessor, op, literal: parseLiteral(right) };
    }
  }
  return { kind: "exists", accessor: parseAccessor(expr) };
}

function parsePredicate(expr: string): Predicate {
  // split on top-level || then && (no parens support beyond the wrapping ?())
  const splitTop = (src: string, sep: string): string[] => {
    const parts: string[] = [];
    let depth = 0; let quote = ""; let cur = "";
    for (let i = 0; i < src.length; i++) {
      const ch = src[i]!;
      if (quote) { cur += ch; if (ch === quote) quote = ""; continue; }
      if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
      if (ch === "(" || ch === "[") depth++;
      if (ch === ")" || ch === "]") depth--;
      if (depth === 0 && src.startsWith(sep, i)) { parts.push(cur); cur = ""; i += sep.length - 1; continue; }
      cur += ch;
    }
    parts.push(cur);
    return parts;
  };
  const ors = splitTop(expr, "||");
  if (ors.length > 1) return ors.map((o) => parsePredicate(o)).reduce((a, b) => ({ kind: "or", a, b }));
  const ands = splitTop(expr, "&&");
  if (ands.length > 1) return ands.map((o) => parsePredicate(o)).reduce((a, b) => ({ kind: "and", a, b }));
  return parseComparison(expr.trim());
}

/** Tokenize a `$…` JSONPath expression into a list of steps. */
export function parseJsonPath(path: string): Step[] {
  let s = path.trim();
  if (s[0] === "$") s = s.slice(1);
  const steps: Step[] = [];
  let i = 0;
  const readName = (): void => {
    if (s[i] === "*") { steps.push({ type: "wildcard" }); i++; return; }
    let name = "";
    while (i < s.length && /[A-Za-z0-9_$-]/.test(s[i]!)) name += s[i++];
    if (name === "") throw new JsonToolError(`Empty child name in "${path}" near index ${i}`);
    steps.push({ type: "child", name });
  };
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === ".") {
      if (s[i + 1] === ".") {
        steps.push({ type: "descendant" });
        i += 2;
        // a name or wildcard may follow the descendant directly ($..author, $..*)
        if (i < s.length && s[i] !== "[" && s[i] !== ".") readName();
        continue;
      }
      i++;
      if (s[i] === "[") continue; // let bracket handler run
      readName();
      continue;
    }
    if (ch === "[") {
      let depth = 0; let quote = ""; let j = i;
      for (; j < s.length; j++) {
        const cj = s[j]!;
        if (quote) { if (cj === quote) quote = ""; continue; }
        if (cj === "'" || cj === '"') { quote = cj; continue; }
        if (cj === "[") depth++;
        if (cj === "]") { depth--; if (depth === 0) break; }
      }
      if (depth !== 0) throw new JsonToolError(`Unbalanced [ in "${path}"`);
      steps.push(parseBracket(s.slice(i + 1, j)));
      i = j + 1;
      continue;
    }
    if (ch === " ") { i++; continue; }
    throw new JsonToolError(`Unexpected "${ch}" in JSONPath "${path}" at index ${i}`);
  }
  return steps;
}

// --- evaluation ------------------------------------------------------------

function childrenOf(node: Node): Node[] {
  const out: Node[] = [];
  if (Array.isArray(node.value)) node.value.forEach((v, idx) => out.push({ value: v, path: [...node.path, idx] }));
  else if (isPlainObject(node.value)) for (const k of Object.keys(node.value)) out.push({ value: node.value[k]!, path: [...node.path, k] });
  return out;
}

function descendants(node: Node): Node[] {
  const out: Node[] = [node];
  for (const c of childrenOf(node)) out.push(...descendants(c));
  return out;
}

function accessorValue(value: JsonValue, accessor: string[]): JsonValue | undefined {
  let cur: JsonValue = value;
  for (const key of accessor) {
    if (Array.isArray(cur) && /^-?\d+$/.test(key)) { const idx = Number(key); cur = cur[idx < 0 ? cur.length + idx : idx] as JsonValue; }
    else if (isPlainObject(cur) && Object.prototype.hasOwnProperty.call(cur, key)) cur = cur[key]!;
    else return undefined;
    if (cur === undefined) return undefined;
  }
  return cur;
}

function evalPredicate(value: JsonValue, p: Predicate): boolean {
  if (p.kind === "and") return evalPredicate(value, p.a) && evalPredicate(value, p.b);
  if (p.kind === "or") return evalPredicate(value, p.a) || evalPredicate(value, p.b);
  const actual = accessorValue(value, p.accessor);
  if (p.kind === "exists") return actual !== undefined && actual !== false && actual !== null;
  if (actual === undefined) return false;
  if (p.op === "=~") return p.literal instanceof RegExp && typeof actual === "string" && p.literal.test(actual);
  const lit = p.literal as JsonValue;
  switch (p.op) {
    case "==": return deepEqual(actual, lit);
    case "!=": return !deepEqual(actual, lit);
    case "<": return typeof actual === "number" && typeof lit === "number" ? actual < lit : String(actual) < String(lit);
    case "<=": return typeof actual === "number" && typeof lit === "number" ? actual <= lit : String(actual) <= String(lit);
    case ">": return typeof actual === "number" && typeof lit === "number" ? actual > lit : String(actual) > String(lit);
    case ">=": return typeof actual === "number" && typeof lit === "number" ? actual >= lit : String(actual) >= String(lit);
    default: return false;
  }
}

function applyStep(nodes: Node[], step: Step, next: Step | undefined): Node[] {
  const out: Node[] = [];
  if (step.type === "descendant") {
    // gather self + all descendants; the following step selects from them
    const pool: Node[] = [];
    for (const n of nodes) pool.push(...descendants(n));
    return pool;
  }
  for (const node of nodes) {
    switch (step.type) {
      case "child": {
        if (isPlainObject(node.value) && Object.prototype.hasOwnProperty.call(node.value, step.name)) out.push({ value: node.value[step.name]!, path: [...node.path, step.name] });
        break;
      }
      case "wildcard": out.push(...childrenOf(node)); break;
      case "index": {
        if (Array.isArray(node.value)) { const i = step.index < 0 ? node.value.length + step.index : step.index; if (i >= 0 && i < node.value.length) out.push({ value: node.value[i]!, path: [...node.path, i] }); }
        break;
      }
      case "union": {
        if (Array.isArray(node.value)) for (const raw of step.indices) { const i = raw < 0 ? node.value.length + raw : raw; if (i >= 0 && i < node.value.length) out.push({ value: node.value[i]!, path: [...node.path, i] }); }
        break;
      }
      case "slice": {
        if (Array.isArray(node.value)) {
          const len = node.value.length;
          const step2 = step.step || 1;
          let start = step.start ?? (step2 > 0 ? 0 : len - 1);
          let end = step.end ?? (step2 > 0 ? len : -len - 1);
          if (start < 0) start += len;
          if (end < 0) end += len;
          if (step2 > 0) for (let i = Math.max(0, start); i < Math.min(len, end); i += step2) out.push({ value: node.value[i]!, path: [...node.path, i] });
          else for (let i = Math.min(len - 1, start); i > end; i += step2) if (i >= 0 && i < len) out.push({ value: node.value[i]!, path: [...node.path, i] });
        }
        break;
      }
      case "filter": {
        for (const c of childrenOf(node)) if (evalPredicate(c.value, step.predicate)) out.push(c);
        break;
      }
    }
  }
  return out;
}

function run(doc: JsonValue, steps: Step[]): Node[] {
  let nodes: Node[] = [{ value: doc, path: [] }];
  for (let s = 0; s < steps.length; s++) {
    nodes = applyStep(nodes, steps[s]!, steps[s + 1]);
  }
  return nodes;
}

/** True if `expr` looks like a JSONPath expression (starts with `$`). */
export function isJsonPath(expr: string): boolean {
  return expr.trimStart().startsWith("$");
}

/** Evaluate a JSONPath and return the matched values in document order. */
export function jsonPath(doc: JsonValue, path: string): JsonValue[] {
  return run(doc, parseJsonPath(path)).map((n) => n.value);
}

/** Evaluate a JSONPath and return the RFC 6901 pointer of each match. */
export function jsonPathPaths(doc: JsonValue, path: string): string[] {
  return run(doc, parseJsonPath(path)).map((n) => buildPointer(n.path));
}

/** True if the JSONPath is syntactically valid. */
export function isValidJsonPath(path: string): boolean {
  try { parseJsonPath(path); return true; } catch { return false; }
}
