/**
 * A deliberately tiny mustache-ish template layer for dynamic route bodies.
 * Supported tokens:
 *   {{params.id}}        — a captured path param
 *   {{query.page}}       — a query-string value
 *   {{body.email}}       — a field from the parsed JSON request body (dot paths)
 *   {{fake.name}}        — seeded fake data ({{fake.int 1 100}}, {{fake.email}}, …)
 *   {{index}} / {{index1}} — the 0-/1-based counter inside a repeat block
 *   {{repeat n}}…{{/repeat}} — repeat the inner template n times
 * Everything else resolves to an empty string. No conditionals, no partials —
 * keep it small; that is the whole point.
 */
import type { Faker } from "./faker.js";
import { resolveFake } from "./faker.js";

/** The data available to a template. */
export interface TemplateContext {
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  faker: Faker;
}

const REPEAT_RE = /\{\{\s*repeat\s+(\d+)\s*\}\}([\s\S]*?)\{\{\s*\/repeat\s*\}\}/g;
const TOKEN_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

/** Follow a dot-path (`a.b.0.c`) into an arbitrary value. */
function dig(root: unknown, path: string): unknown {
  if (path === "") return root;
  let cur: unknown = root;
  for (const key of path.split(".")) {
    if (cur == null) return undefined;
    if (Array.isArray(cur)) cur = cur[Number(key)];
    else if (typeof cur === "object") cur = (cur as Record<string, unknown>)[key];
    else return undefined;
  }
  return cur;
}

function stringify(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Resolve a single `{{ … }}` expression to a string. */
function resolveToken(expr: string, ctx: TemplateContext, index: number): string {
  const parts = expr.trim().split(/\s+/);
  const head = parts[0] ?? "";
  const args = parts.slice(1);

  if (head === "index") return String(index);
  if (head === "index1") return String(index + 1);

  const dot = head.indexOf(".");
  const ns = dot === -1 ? head : head.slice(0, dot);
  const rest = dot === -1 ? "" : head.slice(dot + 1);

  switch (ns) {
    case "params": return stringify(ctx.params[rest]);
    case "query": return stringify(ctx.query[rest]);
    case "body": return stringify(dig(ctx.body, rest));
    case "fake": return resolveFake(ctx.faker, rest, args);
    default: return "";
  }
}

function renderTokens(src: string, ctx: TemplateContext, index: number): string {
  return src.replace(TOKEN_RE, (_m, expr: string) => resolveToken(expr, ctx, index));
}

/** Render a template string against a context. Handles `{{repeat}}` blocks. */
export function render(tpl: string, ctx: TemplateContext): string {
  const expanded = tpl.replace(REPEAT_RE, (_m, nStr: string, inner: string) => {
    const n = Number(nStr);
    let out = "";
    for (let i = 0; i < n; i++) out += renderTokens(inner, ctx, i);
    return out;
  });
  return renderTokens(expanded, ctx, 0);
}

/**
 * Deep-render an already-parsed JSON template value: every string leaf is run
 * through {@link render}, objects/arrays are walked. Use this when a route's
 * `bodyTemplate` is given as a JSON object rather than a raw string.
 */
export function renderValue(value: unknown, ctx: TemplateContext): unknown {
  if (typeof value === "string") {
    const rendered = render(value, ctx);
    return coerceScalar(rendered);
  }
  if (Array.isArray(value)) return value.map((v) => renderValue(v, ctx));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[render(k, ctx)] = renderValue(v, ctx);
    }
    return out;
  }
  return value;
}

/**
 * When a whole string leaf rendered to a clean number/boolean/null, return the
 * real scalar so the emitted JSON is typed (`"age": 42`, not `"age": "42"`).
 * A string with surrounding text stays a string.
 */
function coerceScalar(s: string): unknown {
  if (s === "true") return true;
  if (s === "false") return false;
  if (s === "null") return null;
  if (s !== "" && /^-?\d+(\.\d+)?$/.test(s) && String(Number(s)) === s) return Number(s);
  return s;
}
