/**
 * The assertion + capture engine. Assertions are what make a `.http` file a CI
 * test suite: `# @assert status == 200`, `# @assert body.$.ok == true`,
 * `# @assert header.content-type contains json`, `# @assert time < 1000`.
 *
 * A left-hand side (LHS) is resolved against a {@link ResponseRecord}:
 *   status                      the numeric status code
 *   time | duration             the request time in ms
 *   body                        the raw response body text
 *   body.<json-path>            a value inside the parsed JSON body
 *   header.<name>               a response header (case-insensitive)
 *
 * The same LHS grammar is reused for `# @capture <name> = <lhs>`.
 */
import { evalPath } from "./jsonpath.js";
import type { ResponseRecord } from "./request.js";

/** The comparison operators an assertion may use. */
export type AssertOp =
  | "==" | "!=" | "<" | "<=" | ">" | ">="
  | "contains" | "matches" | "exists" | "empty";

/** A parsed assertion: an LHS, an operator, and (for binary ops) an RHS. */
export interface Assertion {
  lhs: string;
  op: AssertOp;
  rhs?: string;
  raw: string;
}

const BINARY_OPS: AssertOp[] = ["==", "!=", "<=", ">=", "<", ">", "contains", "matches"];
const UNARY_OPS: AssertOp[] = ["exists", "empty"];

/** Parse an assertion expression like `body.$.ok == true`. Throws on malformed input. */
export function parseAssertion(expr: string): Assertion {
  const raw = expr.trim();
  const tokens = raw.split(/\s+/);
  // Unary: `<lhs> exists`
  const last = tokens[tokens.length - 1] ?? "";
  if (UNARY_OPS.includes(last as AssertOp) && tokens.length === 2) {
    return { lhs: tokens[0]!, op: last as AssertOp, raw };
  }
  // Binary: find the operator token (word ops) or symbolic op.
  for (let i = 1; i < tokens.length - 1; i++) {
    const t = tokens[i]!;
    if (BINARY_OPS.includes(t as AssertOp)) {
      const lhs = tokens.slice(0, i).join(" ");
      const rhs = tokens.slice(i + 1).join(" ");
      return { lhs, op: t as AssertOp, rhs, raw };
    }
  }
  throw new Error(`Cannot parse assertion: "${raw}"`);
}

/** Resolve an LHS expression to a concrete value from the response. */
export function resolveLhs(lhs: string, rec: ResponseRecord): unknown {
  const l = lhs.trim();
  if (l === "status") return rec.status;
  if (l === "time" || l === "duration") return rec.timeMs;
  if (l === "size") return rec.size;
  if (l === "body") return rec.body;
  if (l === "url") return rec.url;
  if (l.startsWith("body.")) {
    const path = l.slice(5);
    const root = rec.json !== undefined ? rec.json : tryParse(rec.body);
    return evalPath(root, path);
  }
  if (l.startsWith("header.")) {
    return rec.headers[l.slice(7).toLowerCase()];
  }
  return undefined;
}

function tryParse(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}

/** Parse an RHS literal: number, boolean, null, quoted or bare string. */
function parseLiteral(raw: string): unknown {
  const s = raw.trim();
  if (
    (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
    (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
  ) {
    return s.slice(1, -1);
  }
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  if (s !== "" && !Number.isNaN(Number(s))) return Number(s);
  return s;
}

/** The outcome of evaluating one assertion. */
export interface AssertResult {
  ok: boolean;
  assertion: Assertion;
  actual: unknown;
  expected?: unknown;
  message: string;
}

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === "string") return v.length === 0;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}

/** Loose equality: numbers compared numerically, booleans coerced, else string. */
function looseEqual(actual: unknown, expected: unknown): boolean {
  if (typeof expected === "number") return Number(actual) === expected;
  if (typeof expected === "boolean") {
    if (typeof actual === "boolean") return actual === expected;
    return String(actual) === String(expected);
  }
  if (expected === null) return actual === null || actual === undefined;
  return String(actual) === String(expected);
}

/** Evaluate a parsed assertion against a response. */
export function evalAssertion(assertion: Assertion, rec: ResponseRecord): AssertResult {
  const actual = resolveLhs(assertion.lhs, rec);
  const expected = assertion.rhs !== undefined ? parseLiteral(assertion.rhs) : undefined;
  let ok = false;

  switch (assertion.op) {
    case "==": ok = looseEqual(actual, expected); break;
    case "!=": ok = !looseEqual(actual, expected); break;
    case "<": ok = Number(actual) < Number(expected); break;
    case "<=": ok = Number(actual) <= Number(expected); break;
    case ">": ok = Number(actual) > Number(expected); break;
    case ">=": ok = Number(actual) >= Number(expected); break;
    case "contains": {
      if (Array.isArray(actual)) ok = actual.map((x) => String(x)).includes(String(expected));
      else ok = String(actual).toLowerCase().includes(String(expected).toLowerCase());
      break;
    }
    case "matches": {
      try { ok = new RegExp(String(expected)).test(String(actual)); }
      catch { ok = false; }
      break;
    }
    case "exists": ok = actual !== undefined && actual !== null; break;
    case "empty": ok = isEmpty(actual); break;
  }

  const shownActual = typeof actual === "object" ? JSON.stringify(actual) : String(actual);
  const message = assertion.rhs !== undefined
    ? `${assertion.lhs} ${assertion.op} ${assertion.rhs} (actual: ${shownActual})`
    : `${assertion.lhs} ${assertion.op} (actual: ${shownActual})`;

  const result: AssertResult = { ok, assertion, actual, message };
  if (expected !== undefined) result.expected = expected;
  return result;
}

/** Parse + evaluate in one step. */
export function runAssertion(expr: string, rec: ResponseRecord): AssertResult {
  return evalAssertion(parseAssertion(expr), rec);
}

/** Resolve a capture source (same grammar as an LHS) to a string value. */
export function captureValue(source: string, rec: ResponseRecord): string | undefined {
  const v = resolveLhs(source, rec);
  if (v === undefined || v === null) return undefined;
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}
