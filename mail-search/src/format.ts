import type { SearchAst, SearchClause } from "./parse";

function ymd(d: Date): string {
  const y = String(d.getUTCFullYear()).padStart(4, "0");
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function quoteIfNeeded(v: string, forText: boolean): string {
  const clean = v.replace(/"/g, "");
  const needs =
    /\s/.test(clean) ||
    clean === "" ||
    (forText && (clean === "OR" || clean.startsWith("-") || /^\w+:/.test(clean)));
  return needs ? `"${clean}"` : clean;
}

const DEFAULT_OPERATOR: Record<string, string> = {
  from: "from",
  to: "to",
  cc: "cc",
  subject: "subject",
  filename: "filename",
  label: "label",
  category: "category",
  in: "in",
  has: "has",
  is: "is",
};

/** Turn one clause back into query text, e.g. `-from:anita` or `"exact phrase"`. Unknown shapes give "". */
export function clauseToString(c: SearchClause): string {
  if (!c || typeof c !== "object") return "";
  const neg = c.negated ? "-" : "";
  if (c.field === "text") {
    const v = String(c.value ?? "");
    if (!v.trim()) return "";
    return neg + (c.phrase ? `"${v.replace(/"/g, "")}"` : quoteIfNeeded(v, true));
  }
  let key = typeof c.operator === "string" && c.operator ? c.operator : undefined;
  let value: string;
  if (c.field === "date") {
    if (!key) key = c.op === "before" ? "before" : "after";
    if (typeof c.raw === "string" && c.raw) value = c.raw;
    else {
      const d = c.value instanceof Date ? c.value : new Date(c.value as string | number);
      if (Number.isNaN(d.getTime())) return "";
      value = ymd(d);
    }
  } else if (c.field === "size") {
    if (!key) key = c.op === "lt" ? "smaller" : "larger";
    value = typeof c.raw === "string" && c.raw ? c.raw : String(c.value);
  } else {
    key = key ?? DEFAULT_OPERATOR[c.field] ?? c.field;
    value = c.value instanceof Date ? ymd(c.value) : String(c.value ?? "");
  }
  if (!/^\w+$/.test(key) || !value) return "";
  return `${neg}${key}:${quoteIfNeeded(value, false)}`;
}

/**
 * Turn an AST back into a query string. `parseSearch(toQueryString(ast))` gives the
 * same clauses (with the same `now`). Plain clauses come first, then each OR group.
 */
export function toQueryString(ast: Partial<SearchAst> | null | undefined): string {
  if (!ast || typeof ast !== "object") return "";
  const parts: string[] = [];
  for (const c of Array.isArray(ast.clauses) ? ast.clauses : []) {
    const s = clauseToString(c);
    if (s) parts.push(s);
  }
  for (const g of Array.isArray(ast.orGroups) ? ast.orGroups : []) {
    if (!Array.isArray(g)) continue;
    const terms = g.map(clauseToString).filter(Boolean);
    if (terms.length) parts.push(terms.join(" OR "));
  }
  return parts.join(" ");
}
