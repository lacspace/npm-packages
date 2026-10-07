import { buildLookup, DEFAULT_GROUPS, normalizeKey, resolveKey, type AliasGroup } from "./aliases";

export const FILTERS = ["upper", "lower", "title", "capitalize", "trim", "first"] as const;
export type FilterName = (typeof FILTERS)[number];

type Node =
  | { t: "text"; v: string }
  | { t: "var"; name: string; filters: FilterName[]; fallback: string | undefined; raw: string }
  | { t: "if"; name: string; negate: boolean; yes: Node[]; no: Node[] };

export interface RenderOptions {
  /** true or "html" escapes values for HTML. false/"none" (default) leaves them as-is. */
  escape?: boolean | "html" | "none";
  /** What to print for an empty value with no fallback: "" (default) or the original tag. */
  missing?: "empty" | "keep";
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC[c]!);
}

function splitPipes(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;
  for (const c of s) {
    if (c === '"') inQ = !inQ;
    if (c === "|" && !inQ) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function parseVar(inner: string): Node | undefined {
  const segs = splitPipes(inner);
  const name = segs[0]!.trim();
  if (!name || /[{}"]/.test(name)) return undefined;
  const filters: FilterName[] = [];
  const fallback: string[] = [];
  for (const seg of segs.slice(1)) {
    const t = seg.trim();
    const q = /^"([\s\S]*)"$/.exec(t);
    if (q) fallback.push(q[1]!);
    else if ((FILTERS as readonly string[]).includes(t.toLowerCase())) filters.push(t.toLowerCase() as FilterName);
    else fallback.push(t);
  }
  return { t: "var", name, filters, fallback: fallback.length ? fallback.join("|") : undefined, raw: inner };
}

interface Frame {
  node: Extract<Node, { t: "if" }>;
  kind: "if" | "unless";
  inElse: boolean;
}

function parse(src: string): Node[] {
  const root: Node[] = [];
  const stack: Frame[] = [];
  const target = (): Node[] => {
    const top = stack[stack.length - 1];
    return top ? (top.inElse ? top.node.no : top.node.yes) : root;
  };
  const text = (v: string): void => {
    if (!v) return;
    const t = target();
    const last = t[t.length - 1];
    if (last && last.t === "text") last.v += v;
    else t.push({ t: "text", v });
  };
  let i = 0;
  while (i < src.length) {
    const open = src.indexOf("{{", i);
    if (open < 0) {
      text(src.slice(i));
      break;
    }
    const close = src.indexOf("}}", open + 2);
    if (close < 0) {
      text(src.slice(i));
      break;
    }
    text(src.slice(i, open));
    const inner = src.slice(open + 2, close);
    const whole = src.slice(open, close + 2);
    i = close + 2;
    const tr = inner.trim();
    const block = /^#(if|unless)\s+([\s\S]+)$/.exec(tr);
    if (block) {
      const name = block[2]!.trim();
      const node: Extract<Node, { t: "if" }> = { t: "if", name, negate: block[1] === "unless", yes: [], no: [] };
      target().push(node);
      stack.push({ node, kind: block[1] as "if" | "unless", inElse: false });
      continue;
    }
    const top = stack[stack.length - 1];
    if (tr === "else" && top && !top.inElse) {
      top.inElse = true;
      continue;
    }
    const end = /^\/(if|unless)$/.exec(tr);
    if (end && top && top.kind === end[1]) {
      stack.pop();
      continue;
    }
    if (tr.startsWith("#") || tr.startsWith("/") || tr === "else") {
      text(whole);
      continue;
    }
    const v = parseVar(inner);
    if (v) target().push(v);
    else text(whole);
  }
  return root;
}

function applyFilter(v: string, f: FilterName): string {
  switch (f) {
    case "upper":
      return v.toUpperCase();
    case "lower":
      return v.toLowerCase();
    case "trim":
      return v.trim();
    case "first":
      return v.trim().split(/\s+/)[0] ?? "";
    case "capitalize": {
      const s = v.trim();
      return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
    }
    case "title":
      return v.toLowerCase().replace(/(^|[\s\-'(])(\p{L})/gu, (_m, p: string, c: string) => p + c.toUpperCase());
  }
}

function walkVars(nodes: Node[], out: string[], seen: Set<string>): void {
  for (const n of nodes) {
    if (n.t === "text") continue;
    const k = normalizeKey(n.name);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(n.name);
    }
    if (n.t === "if") {
      walkVars(n.yes, out, seen);
      walkVars(n.no, out, seen);
    }
  }
}

function renderNodes(
  nodes: Node[],
  lookup: Map<string, string>,
  opts: RenderOptions,
  missing: string[],
  groups: AliasGroup[] = DEFAULT_GROUPS,
): string {
  const esc = opts.escape === true || opts.escape === "html";
  let out = "";
  for (const n of nodes) {
    if (n.t === "text") out += n.v;
    else if (n.t === "if") {
      const v = resolveKey(lookup, n.name, groups) ?? "";
      const truthy = v.trim() !== "";
      out += renderNodes(truthy !== n.negate ? n.yes : n.no, lookup, opts, missing, groups);
    } else {
      const raw = resolveKey(lookup, n.name, groups) ?? "";
      if (raw.trim() === "") {
        if (n.fallback !== undefined) out += n.fallback;
        else {
          missing.push(n.name);
          if (opts.missing === "keep") out += `{{${n.raw}}}`;
        }
        continue;
      }
      let v = raw;
      for (const f of n.filters) v = applyFilter(v, f);
      out += esc ? escapeHtml(v) : v;
    }
  }
  return out;
}

export interface CompiledTemplate {
  /** Variable names used (in order, de-duplicated ignoring case/spaces/underscores/hyphens). */
  vars: string[];
  render(vars: Record<string, unknown>, opts?: RenderOptions): string;
}

const NODES = new WeakMap<CompiledTemplate, Node[]>();

/** @internal Render a compiled template with a pre-built lookup, collecting missing variables. */
export function renderCompiled(
  t: CompiledTemplate,
  lookup: Map<string, string>,
  opts: RenderOptions,
  missing: string[],
): string {
  const nodes = NODES.get(t);
  return nodes ? renderNodes(nodes, lookup, opts, missing) : "";
}

/** Parse a template once and render it many times. No code is ever executed. */
export function compileTemplate(src: string): CompiledTemplate {
  const nodes = parse(String(src ?? ""));
  const vars: string[] = [];
  walkVars(nodes, vars, new Set());
  const compiled: CompiledTemplate = {
    vars,
    render(v: Record<string, unknown>, opts: RenderOptions = {}): string {
      return renderNodes(nodes, buildLookup(v), opts, []);
    },
  };
  NODES.set(compiled, nodes);
  return compiled;
}

/** List the variable names a template uses, including those in {{#if}} / {{#unless}}. */
export function findVariables(template: string): string[] {
  return compileTemplate(template).vars;
}

/** Render a template against one set of values. */
export function render(template: string, vars: Record<string, unknown>, opts: RenderOptions = {}): string {
  return compileTemplate(template).render(vars, opts);
}
