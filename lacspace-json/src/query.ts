/**
 * A small, safe, jq-flavoured query language. Hand-written tokenizer → parser →
 * evaluator. No `eval`, no dependencies. It intentionally covers the ~80% of jq
 * people reach for daily rather than the whole language.
 *
 * Supported:
 *   - identity `.`
 *   - paths `.a.b`, `.a["b c"]`, `.items[0]`, `.users[]` (iterate), `.users[].email`
 *   - pipes `expr | expr`
 *   - `select(<cond>)` where cond uses `> < >= <= == !=`, `and`, `or`, `not`,
 *     paths and literals, e.g. `.users[] | select(.age > 21 and .active)`
 *   - `map(<expr>)`
 *   - `keys`, `values`, `length`, `type`, `has(k)`
 *   - `sort_by(<path>)`, `group_by(<path>)`, `unique`, `reverse`
 *   - `first`, `last`, `min`, `max`, `sum`, `avg`, `add`, `flatten`
 *
 * NOT supported (documented): arithmetic on outputs, string interpolation,
 * object/array construction (`{a: .b}`, `[...]`), `//` alternative, `..` recursive
 * descent, functions/`def`, `@base64` and other builtins beyond the list above.
 */
import { JsonToolError, typeOf, deepEqual, compareValues } from "./util.js";

// ---------------------------------------------------------------------------
// Tokenizer
// ---------------------------------------------------------------------------

type Tok =
  | { t: "dot" }
  | { t: "ident"; v: string }
  | { t: "num"; v: number }
  | { t: "str"; v: string }
  | { t: "lbracket" }
  | { t: "rbracket" }
  | { t: "lparen" }
  | { t: "rparen" }
  | { t: "pipe" }
  | { t: "op"; v: string }
  | { t: "comma" };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  while (i < n) {
    const ch = src[i]!;
    if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") { i++; continue; }
    if (ch === ".") { toks.push({ t: "dot" }); i++; continue; }
    if (ch === "[") { toks.push({ t: "lbracket" }); i++; continue; }
    if (ch === "]") { toks.push({ t: "rbracket" }); i++; continue; }
    if (ch === "(") { toks.push({ t: "lparen" }); i++; continue; }
    if (ch === ")") { toks.push({ t: "rparen" }); i++; continue; }
    if (ch === "|") { toks.push({ t: "pipe" }); i++; continue; }
    if (ch === ",") { toks.push({ t: "comma" }); i++; continue; }
    if (ch === '"' || ch === "'") {
      const quote = ch;
      let j = i + 1;
      let s = "";
      while (j < n && src[j] !== quote) {
        if (src[j] === "\\" && j + 1 < n) {
          const esc = src[j + 1]!;
          s += esc === "n" ? "\n" : esc === "t" ? "\t" : esc;
          j += 2;
        } else { s += src[j]; j++; }
      }
      if (j >= n) throw new JsonToolError(`Unterminated string in query near "${src.slice(i, i + 12)}"`);
      toks.push({ t: "str", v: s });
      i = j + 1;
      continue;
    }
    if (ch === ">" || ch === "<" || ch === "=" || ch === "!") {
      if (src[i + 1] === "=") { toks.push({ t: "op", v: ch + "=" }); i += 2; }
      else if (ch === "=" || ch === "!") throw new JsonToolError(`Use "==" / "!=" for comparison near "${src.slice(i)}"`);
      else { toks.push({ t: "op", v: ch }); i++; }
      continue;
    }
    if (/[0-9]/.test(ch) || (ch === "-" && /[0-9]/.test(src[i + 1] ?? ""))) {
      let j = i + 1;
      while (j < n && /[0-9.eE+-]/.test(src[j]!)) j++;
      const raw = src.slice(i, j);
      const num = Number(raw);
      if (Number.isNaN(num)) throw new JsonToolError(`Invalid number "${raw}" in query`);
      toks.push({ t: "num", v: num });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i + 1;
      while (j < n && /[A-Za-z0-9_]/.test(src[j]!)) j++;
      toks.push({ t: "ident", v: src.slice(i, j) });
      i = j;
      continue;
    }
    throw new JsonToolError(`Unexpected character "${ch}" in query near "${src.slice(i, i + 12)}"`);
  }
  return toks;
}

// ---------------------------------------------------------------------------
// AST
// ---------------------------------------------------------------------------

type Step =
  | { kind: "key"; name: string }
  | { kind: "index"; index: number }
  | { kind: "iterate" };

type Stage =
  | { kind: "path"; steps: Step[] }
  | { kind: "func"; name: string; arg?: Pipeline | Cond }
  | { kind: "select"; cond: Cond };

interface Pipeline { stages: Stage[]; }

type Cond =
  | { kind: "or"; l: Cond; r: Cond }
  | { kind: "and"; l: Cond; r: Cond }
  | { kind: "not"; c: Cond }
  | { kind: "cmp"; left: Pipeline; op: string; right: Literal }
  | { kind: "truthy"; expr: Pipeline };

type Literal = { lit: true; value: unknown };

const FUNCS_NO_ARG = new Set([
  "keys", "values", "length", "type", "unique", "reverse",
  "first", "last", "min", "max", "sum", "avg", "add", "flatten",
]);
const FUNCS_WITH_ARG = new Set(["map", "sort_by", "group_by", "has", "select"]);

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

class Parser {
  private toks: Tok[];
  private pos = 0;
  constructor(toks: Tok[]) { this.toks = toks; }

  private peek(): Tok | undefined { return this.toks[this.pos]; }
  private next(): Tok | undefined { return this.toks[this.pos++]; }
  private expect(t: Tok["t"]): Tok {
    const tk = this.next();
    if (!tk || tk.t !== t) throw new JsonToolError(`Query parse error: expected ${t}`);
    return tk;
  }

  parsePipeline(stopAtParen = false): Pipeline {
    const stages: Stage[] = [];
    stages.push(this.parseStage());
    while (this.peek()?.t === "pipe") {
      this.next();
      stages.push(this.parseStage());
    }
    if (stopAtParen && this.peek() && this.peek()!.t !== "rparen") {
      throw new JsonToolError("Query parse error: expected ')'");
    }
    return { stages };
  }

  private parseStage(): Stage {
    const tk = this.peek();
    if (!tk) throw new JsonToolError("Query parse error: unexpected end of expression");
    if (tk.t === "dot" || tk.t === "lbracket") return this.parsePath();
    if (tk.t === "ident") return this.parseFunc();
    throw new JsonToolError(`Query parse error: unexpected token near "${describeTok(tk)}"`);
  }

  private parsePath(): Stage {
    const steps: Step[] = [];
    while (true) {
      const tk = this.peek();
      if (tk?.t === "dot") {
        this.next();
        const after = this.peek();
        if (after?.t === "ident") { this.next(); steps.push({ kind: "key", name: after.v }); continue; }
        if (after?.t === "str") { this.next(); steps.push({ kind: "key", name: after.v }); continue; }
        if (after?.t === "lbracket") { this.parseBracket(steps); continue; }
        // lone dot = identity (or trailing before pipe/paren/end)
        continue;
      }
      if (tk?.t === "lbracket") { this.parseBracket(steps); continue; }
      break;
    }
    return { kind: "path", steps };
  }

  private parseBracket(steps: Step[]): void {
    this.expect("lbracket");
    const inner = this.peek();
    if (inner?.t === "rbracket") { this.next(); steps.push({ kind: "iterate" }); return; }
    if (inner?.t === "num") { this.next(); this.expect("rbracket"); steps.push({ kind: "index", index: inner.v }); return; }
    if (inner?.t === "str") { this.next(); this.expect("rbracket"); steps.push({ kind: "key", name: inner.v }); return; }
    if (inner?.t === "op" && inner.v === "<") {
      // no wildcard star supported; guard
    }
    throw new JsonToolError("Query parse error: expected number, string or empty in [ ]");
  }

  private parseFunc(): Stage {
    const nameTok = this.expect("ident") as { t: "ident"; v: string };
    const name = nameTok.v;
    if (name === "select") {
      this.expect("lparen");
      const cond = this.parseCond();
      this.expect("rparen");
      return { kind: "select", cond };
    }
    if (FUNCS_WITH_ARG.has(name)) {
      this.expect("lparen");
      if (name === "has") {
        const arg = this.next();
        let key: unknown;
        if (arg?.t === "str") key = arg.v;
        else if (arg?.t === "num") key = arg.v;
        else if (arg?.t === "ident") key = arg.v;
        else throw new JsonToolError("has() needs a key, e.g. has(\"id\")");
        this.expect("rparen");
        return { kind: "func", name, litKey: key } as unknown as Stage;
      }
      const inner = this.parsePipeline(true);
      this.expect("rparen");
      return { kind: "func", name, arg: inner };
    }
    if (FUNCS_NO_ARG.has(name)) return { kind: "func", name };
    throw new JsonToolError(`Unknown query function "${name}"`);
  }

  // --- conditions (inside select) ---
  private parseCond(): Cond { return this.parseOr(); }
  private parseOr(): Cond {
    let left = this.parseAnd();
    while (this.peek()?.t === "ident" && (this.peek() as { v: string }).v === "or") {
      this.next();
      const right = this.parseAnd();
      left = { kind: "or", l: left, r: right };
    }
    return left;
  }
  private parseAnd(): Cond {
    let left = this.parseCondAtom();
    while (this.peek()?.t === "ident" && (this.peek() as { v: string }).v === "and") {
      this.next();
      const right = this.parseCondAtom();
      left = { kind: "and", l: left, r: right };
    }
    return left;
  }
  private parseCondAtom(): Cond {
    const tk = this.peek();
    if (tk?.t === "ident" && tk.v === "not") { this.next(); return { kind: "not", c: this.parseCondAtom() }; }
    if (tk?.t === "lparen") { this.next(); const c = this.parseCond(); this.expect("rparen"); return c; }
    // left side is a pipeline (path or func chain), stop at op/and/or/rparen
    const left = this.parseCondPipeline();
    const opTok = this.peek();
    if (opTok?.t === "op") {
      this.next();
      const right = this.parseLiteral();
      return { kind: "cmp", left, op: opTok.v, right };
    }
    return { kind: "truthy", expr: left };
  }
  private parseCondPipeline(): Pipeline {
    const stages: Stage[] = [this.parseStage()];
    while (this.peek()?.t === "pipe") { this.next(); stages.push(this.parseStage()); }
    return { stages };
  }
  private parseLiteral(): Literal {
    const tk = this.next();
    if (!tk) throw new JsonToolError("Query parse error: expected a value after operator");
    if (tk.t === "num") return { lit: true, value: tk.v };
    if (tk.t === "str") return { lit: true, value: tk.v };
    if (tk.t === "ident") {
      if (tk.v === "true") return { lit: true, value: true };
      if (tk.v === "false") return { lit: true, value: false };
      if (tk.v === "null") return { lit: true, value: null };
      return { lit: true, value: tk.v };
    }
    throw new JsonToolError("Query parse error: expected a literal (number, string, true/false/null)");
  }
}

function describeTok(t: Tok): string {
  if (t.t === "ident" || t.t === "str") return t.v;
  if (t.t === "num") return String(t.v);
  if (t.t === "op") return t.v;
  return t.t;
}

// ---------------------------------------------------------------------------
// Evaluator
// ---------------------------------------------------------------------------

function getKey(v: unknown, key: string): unknown {
  if (v === null || v === undefined) return undefined;
  if (Array.isArray(v)) return undefined;
  if (typeof v !== "object") return undefined;
  if (!Object.prototype.hasOwnProperty.call(v, key)) return undefined;
  return (v as Record<string, unknown>)[key];
}

function evalPath(steps: Step[], inputs: unknown[]): unknown[] {
  let cur = inputs;
  for (const step of steps) {
    if (step.kind === "key") {
      cur = cur.map((v) => getKey(v, step.name));
    } else if (step.kind === "index") {
      cur = cur.map((v) => {
        if (!Array.isArray(v)) return undefined;
        const idx = step.index < 0 ? v.length + step.index : step.index;
        return v[idx];
      });
    } else {
      const out: unknown[] = [];
      for (const v of cur) {
        if (Array.isArray(v)) out.push(...v);
        else if (v && typeof v === "object") out.push(...Object.values(v));
        // scalars/undefined contribute nothing when iterated
      }
      cur = out;
    }
  }
  return cur;
}

function asNumbers(arr: unknown[], fn: string): number[] {
  const out: number[] = [];
  for (const v of arr) {
    if (typeof v !== "number") throw new JsonToolError(`${fn}: expected an array of numbers, found ${typeOf(v)}`);
    out.push(v);
  }
  return out;
}

function evalFunc(stage: Stage & { kind: "func" }, inputs: unknown[]): unknown[] {
  const name = stage.name;
  const litKey = (stage as unknown as { litKey?: unknown }).litKey;

  const perValue = (fn: (v: unknown) => unknown): unknown[] => inputs.map(fn);

  switch (name) {
    case "keys":
      return perValue((v) => {
        if (Array.isArray(v)) return v.map((_, i) => i);
        if (v && typeof v === "object") return Object.keys(v).sort();
        throw new JsonToolError(`keys: expected object or array, found ${typeOf(v)}`);
      });
    case "values":
      return perValue((v) => {
        if (Array.isArray(v)) return v;
        if (v && typeof v === "object") return Object.values(v);
        throw new JsonToolError(`values: expected object or array, found ${typeOf(v)}`);
      });
    case "length":
      return perValue((v) => {
        if (v === null || v === undefined) return 0;
        if (typeof v === "string") return v.length;
        if (Array.isArray(v)) return v.length;
        if (typeof v === "number") return Math.abs(v);
        if (typeof v === "object") return Object.keys(v).length;
        throw new JsonToolError(`length: unsupported type ${typeOf(v)}`);
      });
    case "type":
      return perValue((v) => typeOf(v));
    case "has":
      return perValue((v) => {
        if (Array.isArray(v)) return typeof litKey === "number" && litKey >= 0 && litKey < v.length;
        if (v && typeof v === "object") return Object.prototype.hasOwnProperty.call(v, String(litKey));
        throw new JsonToolError(`has: expected object or array, found ${typeOf(v)}`);
      });
    case "unique":
      return perValue((v) => {
        if (!Array.isArray(v)) throw new JsonToolError(`unique: expected array, found ${typeOf(v)}`);
        const sorted = [...v].sort(compareValues);
        const out: unknown[] = [];
        for (const x of sorted) if (out.length === 0 || !deepEqual(out[out.length - 1], x)) out.push(x);
        return out;
      });
    case "reverse":
      return perValue((v) => {
        if (Array.isArray(v)) return [...v].reverse();
        if (typeof v === "string") return [...v].reverse().join("");
        throw new JsonToolError(`reverse: expected array or string, found ${typeOf(v)}`);
      });
    case "flatten":
      return perValue((v) => {
        if (!Array.isArray(v)) throw new JsonToolError(`flatten: expected array, found ${typeOf(v)}`);
        const out: unknown[] = [];
        const walk = (a: unknown[]): void => { for (const x of a) Array.isArray(x) ? walk(x) : out.push(x); };
        walk(v);
        return out;
      });
    case "first":
      return perValue((v) => { if (!Array.isArray(v)) throw new JsonToolError(`first: expected array`); return v.length ? v[0] : null; });
    case "last":
      return perValue((v) => { if (!Array.isArray(v)) throw new JsonToolError(`last: expected array`); return v.length ? v[v.length - 1] : null; });
    case "min":
      return perValue((v) => { if (!Array.isArray(v)) throw new JsonToolError(`min: expected array`); if (!v.length) return null; return [...v].sort(compareValues)[0]; });
    case "max":
      return perValue((v) => { if (!Array.isArray(v)) throw new JsonToolError(`max: expected array`); if (!v.length) return null; return [...v].sort(compareValues)[v.length - 1]; });
    case "sum":
      return perValue((v) => { if (!Array.isArray(v)) throw new JsonToolError(`sum: expected array`); return asNumbers(v, "sum").reduce((a, b) => a + b, 0); });
    case "avg":
      return perValue((v) => { if (!Array.isArray(v)) throw new JsonToolError(`avg: expected array`); const nums = asNumbers(v, "avg"); return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : null; });
    case "add":
      return perValue((v) => {
        if (!Array.isArray(v)) throw new JsonToolError(`add: expected array`);
        if (!v.length) return null;
        if (v.every((x) => typeof x === "number")) return (v as number[]).reduce((a, b) => a + b, 0);
        if (v.every((x) => typeof x === "string")) return (v as string[]).join("");
        if (v.every((x) => Array.isArray(x))) return ([] as unknown[]).concat(...(v as unknown[][]));
        throw new JsonToolError("add: array must be all numbers, all strings, or all arrays");
      });
    case "map": {
      const inner = stage.arg as Pipeline;
      return perValue((v) => {
        if (!Array.isArray(v)) throw new JsonToolError(`map: expected array, found ${typeOf(v)}`);
        return v.map((el) => firstOf(evalPipeline(inner, [el])));
      });
    }
    case "sort_by": {
      const inner = stage.arg as Pipeline;
      return perValue((v) => {
        if (!Array.isArray(v)) throw new JsonToolError(`sort_by: expected array, found ${typeOf(v)}`);
        return [...v].sort((a, b) => compareValues(firstOf(evalPipeline(inner, [a])), firstOf(evalPipeline(inner, [b]))));
      });
    }
    case "group_by": {
      const inner = stage.arg as Pipeline;
      return perValue((v) => {
        if (!Array.isArray(v)) throw new JsonToolError(`group_by: expected array, found ${typeOf(v)}`);
        const withKey = v.map((el) => ({ el, key: firstOf(evalPipeline(inner, [el])) }));
        withKey.sort((a, b) => compareValues(a.key, b.key));
        const groups: unknown[][] = [];
        let curKey: unknown = Symbol();
        for (const { el, key } of withKey) {
          if (groups.length === 0 || !deepEqual(curKey, key)) { groups.push([]); curKey = key; }
          groups[groups.length - 1]!.push(el);
        }
        return groups;
      });
    }
    default:
      throw new JsonToolError(`Unknown query function "${name}"`);
  }
}

function truthy(v: unknown): boolean {
  return v !== null && v !== undefined && v !== false;
}

function evalCond(cond: Cond, value: unknown): boolean {
  switch (cond.kind) {
    case "or": return evalCond(cond.l, value) || evalCond(cond.r, value);
    case "and": return evalCond(cond.l, value) && evalCond(cond.r, value);
    case "not": return !evalCond(cond.c, value);
    case "truthy": return truthy(firstOf(evalPipeline(cond.expr, [value])));
    case "cmp": {
      const left = firstOf(evalPipeline(cond.left, [value]));
      const right = cond.right.value;
      switch (cond.op) {
        case "==": return deepEqual(left, right);
        case "!=": return !deepEqual(left, right);
        case ">": return compareValues(left, right) > 0;
        case "<": return compareValues(left, right) < 0;
        case ">=": return compareValues(left, right) >= 0;
        case "<=": return compareValues(left, right) <= 0;
        default: throw new JsonToolError(`Unknown operator "${cond.op}"`);
      }
    }
  }
}

function evalPipeline(pipe: Pipeline, inputs: unknown[]): unknown[] {
  let cur = inputs;
  for (const stage of pipe.stages) {
    if (stage.kind === "path") cur = evalPath(stage.steps, cur);
    else if (stage.kind === "select") cur = cur.filter((v) => evalCond(stage.cond, v));
    else cur = evalFunc(stage, cur);
  }
  return cur;
}

function firstOf(arr: unknown[]): unknown {
  return arr.length ? arr[0] : null;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Compile a query string into a reusable evaluator (throws on parse error). */
export function compileQuery(expr: string): (data: unknown) => unknown[] {
  const toks = tokenize(expr);
  if (toks.length === 0) return (d) => [d];
  const ast = new Parser(toks).parsePipeline();
  return (data: unknown) => evalPipeline(ast, [data]);
}

/**
 * Run `expr` against `data`. Returns the single result when the query yields
 * exactly one value, otherwise an array of all results (jq's stream semantics).
 */
export function query(data: unknown, expr: string): unknown {
  const results = compileQuery(expr)(data);
  const clean = results.map((v) => (v === undefined ? null : v));
  return clean.length === 1 ? clean[0] : clean;
}

/** Run `expr` and always return the full result stream as an array. */
export function queryAll(data: unknown, expr: string): unknown[] {
  return compileQuery(expr)(data).map((v) => (v === undefined ? null : v));
}

/** True if `expr` parses. */
export function isValidQuery(expr: string): boolean {
  try { compileQuery(expr); return true; } catch { return false; }
}
