/**
 * A practical CSS-selector engine over the {@link ./html.ts} tree. Supports the
 * selectors you actually reach for when scraping: type/`*`, `#id`, `.class`,
 * attribute selectors (`[a]`, `[a=v]`, `~= ^= $= *= |=`), descendant (space) and
 * child (`>`) combinators, selector lists (`,`), and the `:first-child` /
 * `:last-child` / `:nth-child(n)` pseudos. Zero-dependency and evaluated
 * left-to-right, so it stays fast on big documents.
 */
import { type ElNode, descendants, childElements } from "./html.js";

interface AttrSel {
  name: string;
  op?: "=" | "~=" | "^=" | "$=" | "*=" | "|=";
  val?: string;
}
interface Compound {
  tag?: string;
  id?: string;
  classes: string[];
  attrs: AttrSel[];
  pseudos: string[];
}
interface Step {
  combinator: " " | ">";
  compound: Compound;
}

/** Split `s` on `sep` at the top level (ignoring `[...]` brackets and quotes). */
function splitTop(s: string, sep: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let quote = "";
  let buf = "";
  for (const ch of s) {
    if (quote) {
      buf += ch;
      if (ch === quote) quote = "";
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; buf += ch; continue; }
    if (ch === "[") depth++;
    else if (ch === "]") depth = Math.max(0, depth - 1);
    if (ch === sep && depth === 0) {
      out.push(buf);
      buf = "";
    } else buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

function parseAttr(body: string): AttrSel {
  const m = /^\s*([\w:-]+)\s*(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]]*?))\s*)?$/.exec(body);
  if (!m) return { name: body.trim() };
  const sel: AttrSel = { name: m[1]!.toLowerCase() };
  if (m[2]) {
    sel.op = m[2] as AttrSel["op"];
    sel.val = m[3] ?? m[4] ?? m[5] ?? "";
  }
  return sel;
}

function parseCompound(s: string): Compound {
  const c: Compound = { classes: [], attrs: [], pseudos: [] };
  let i = 0;
  while (i < s.length) {
    const rest = s.slice(i);
    const ch = s[i]!;
    if (ch === "*") { c.tag = "*"; i++; continue; }
    if (ch === "#") {
      const m = /^#([\w-]+)/.exec(rest);
      if (m) { c.id = m[1]!; i += m[0].length; continue; }
    } else if (ch === ".") {
      const m = /^\.([\w-]+)/.exec(rest);
      if (m) { c.classes.push(m[1]!); i += m[0].length; continue; }
    } else if (ch === "[") {
      const end = s.indexOf("]", i);
      c.attrs.push(parseAttr(s.slice(i + 1, end < 0 ? undefined : end)));
      i = end < 0 ? s.length : end + 1;
      continue;
    } else if (ch === ":") {
      const m = /^:{1,2}([\w-]+)(?:\(([^)]*)\))?/.exec(rest);
      if (m) { c.pseudos.push(m[1]! + (m[2] ? `(${m[2]})` : "")); i += m[0].length; continue; }
    } else {
      const m = /^[\w-]+/.exec(rest);
      if (m) { c.tag = m[0].toLowerCase(); i += m[0].length; continue; }
    }
    i++;
  }
  return c;
}

function parseSelector(group: string): Step[] {
  const steps: Step[] = [];
  let buf = "";
  let combinator: " " | ">" = " ";
  const flush = (): void => {
    const c = buf.trim();
    if (c) steps.push({ combinator, compound: parseCompound(c) });
    buf = "";
    combinator = " ";
  };
  let i = 0;
  while (i < group.length) {
    const ch = group[i]!;
    if (ch === "[") {
      const end = group.indexOf("]", i);
      buf += group.slice(i, end < 0 ? group.length : end + 1);
      i = end < 0 ? group.length : end + 1;
      continue;
    }
    if (ch === ">") { flush(); combinator = ">"; i++; continue; }
    if (/\s/.test(ch)) {
      if (buf.trim()) {
        let j = i;
        while (j < group.length && /\s/.test(group[j]!)) j++;
        if (group[j] === ">") { i = j; continue; }
        flush();
      }
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return steps;
}

function attrMatches(el: ElNode, a: AttrSel): boolean {
  const v = el.attrs[a.name];
  if (v === undefined) return false;
  if (!a.op) return true;
  const val = a.val ?? "";
  switch (a.op) {
    case "=": return v === val;
    case "~=": return v.split(/\s+/).includes(val);
    case "^=": return val !== "" && v.startsWith(val);
    case "$=": return val !== "" && v.endsWith(val);
    case "*=": return val !== "" && v.includes(val);
    case "|=": return v === val || v.startsWith(val + "-");
    default: return false;
  }
}

function pseudoMatches(el: ElNode, pseudo: string): boolean {
  const parent = el.parent;
  if (!parent) return false;
  const sibs = childElements(parent);
  const idx = sibs.indexOf(el); // 0-based
  if (pseudo === "first-child") return idx === 0;
  if (pseudo === "last-child") return idx === sibs.length - 1;
  const nth = /^nth-child\((\d+|odd|even)\)$/.exec(pseudo);
  if (nth) {
    const arg = nth[1]!;
    if (arg === "odd") return idx % 2 === 0;
    if (arg === "even") return idx % 2 === 1;
    return idx + 1 === parseInt(arg, 10);
  }
  return true; // unknown pseudo → don't exclude
}

function matchCompound(el: ElNode, c: Compound): boolean {
  if (c.tag && c.tag !== "*" && el.tag !== c.tag) return false;
  if (c.id !== undefined && el.attrs.id !== c.id) return false;
  if (c.classes.length) {
    const cls = (el.attrs.class ?? "").split(/\s+/);
    for (const need of c.classes) if (!cls.includes(need)) return false;
  }
  for (const a of c.attrs) if (!attrMatches(el, a)) return false;
  for (const p of c.pseudos) if (!pseudoMatches(el, p)) return false;
  return true;
}

/** Every element under `root` matching the CSS `selector`, in document order. */
export function queryAll(root: ElNode, selector: string): ElNode[] {
  const all = descendants(root);
  const order = new Map<ElNode, number>();
  all.forEach((el, idx) => order.set(el, idx));

  const seen = new Set<ElNode>();
  const out: ElNode[] = [];
  for (const group of splitTop(selector, ",")) {
    const steps = parseSelector(group);
    if (!steps.length) continue;
    let matches = all.filter((el) => matchCompound(el, steps[0]!.compound));
    for (let k = 1; k < steps.length; k++) {
      const step = steps[k]!;
      const next: ElNode[] = [];
      const seenN = new Set<ElNode>();
      for (const m of matches) {
        const cands = step.combinator === ">" ? childElements(m) : descendants(m);
        for (const cand of cands) {
          if (!seenN.has(cand) && matchCompound(cand, step.compound)) {
            seenN.add(cand);
            next.push(cand);
          }
        }
      }
      matches = next;
    }
    for (const m of matches) if (!seen.has(m)) { seen.add(m); out.push(m); }
  }
  return out.sort((a, b) => (order.get(a) ?? 0) - (order.get(b) ?? 0));
}

/** The first element under `root` matching `selector`, or `undefined`. */
export function queryOne(root: ElNode, selector: string): ElNode | undefined {
  return queryAll(root, selector)[0];
}
