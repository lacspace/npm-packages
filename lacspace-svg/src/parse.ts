/**
 * A tolerant, zero-dependency XML/SVG parser and serializer.
 *
 * It parses real-world SVG (and general XML) into a small node tree and can
 * serialize that tree back to a string, either pretty-printed or minified. It
 * is deliberately NOT a validating XML processor — it aims to accept the SVG
 * files editors and design tools emit and to round-trip them faithfully.
 *
 * Handles: elements (with namespaced names like `xlink:href`), self-closing
 * tags, attributes (single/double/unquoted values), text, comments
 * (`<!-- -->`), CDATA (`<![CDATA[ ]]>`), processing instructions
 * (`<?target ?>`) including the XML declaration and `<?xml-stylesheet?>`, and
 * DOCTYPE (`<!DOCTYPE ...>`, including an internal `[ ... ]` subset). Entities
 * in text and attribute values are preserved verbatim.
 */

/** Thrown for input that cannot be parsed at all. */
export class SvgParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SvgParseError";
  }
}

/** An attribute on an element, preserving source order and quote style. */
export interface SvgAttr {
  name: string;
  value: string;
  /** `"`, `'`, or `""` when the value was unquoted / valueless. */
  quote: '"' | "'" | "";
}

export interface SvgElement {
  type: "element";
  name: string;
  attributes: SvgAttr[];
  children: SvgNode[];
  /** True when written as `<tag/>` (or an inferred void element). */
  selfClosing: boolean;
}
export interface SvgText {
  type: "text";
  value: string;
}
export interface SvgComment {
  type: "comment";
  value: string;
}
export interface SvgCData {
  type: "cdata";
  value: string;
}
/** A processing instruction, e.g. `<?xml version="1.0"?>` (target `xml`). */
export interface SvgPI {
  type: "pi";
  target: string;
  value: string;
}
export interface SvgDoctype {
  type: "doctype";
  value: string;
}

export type SvgNode =
  | SvgElement
  | SvgText
  | SvgComment
  | SvgCData
  | SvgPI
  | SvgDoctype;

/** The parsed document: a flat list of top-level nodes. */
export interface SvgRoot {
  type: "root";
  children: SvgNode[];
}

const NAME_START = /[A-Za-z_:]/;
const NAME_CHAR = /[A-Za-z0-9_:.\-]/;

/**
 * Parse an XML/SVG string into a {@link SvgRoot} tree.
 * @throws {SvgParseError} only on input that is not recoverable at all.
 */
export function parseSvg(input: string): SvgRoot {
  if (typeof input !== "string") throw new SvgParseError("input must be a string");
  const src = input;
  let i = 0;
  const len = src.length;

  const root: SvgRoot = { type: "root", children: [] };
  // A stack of open elements; the last is the current parent.
  const stack: SvgElement[] = [];
  const push = (n: SvgNode): void => {
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(n);
    else root.children.push(n);
  };

  while (i < len) {
    if (src[i] === "<") {
      const two = src.slice(i, i + 2);
      if (src.startsWith("<!--", i)) {
        // Comment
        const end = src.indexOf("-->", i + 4);
        const stop = end === -1 ? len : end;
        push({ type: "comment", value: src.slice(i + 4, stop) });
        i = end === -1 ? len : end + 3;
        continue;
      }
      if (src.startsWith("<![CDATA[", i)) {
        const end = src.indexOf("]]>", i + 9);
        const stop = end === -1 ? len : end;
        push({ type: "cdata", value: src.slice(i + 9, stop) });
        i = end === -1 ? len : end + 3;
        continue;
      }
      if (/^<!doctype/i.test(src.slice(i, i + 9))) {
        // DOCTYPE — may contain a bracketed internal subset.
        let j = i + 9;
        let depth = 0;
        while (j < len) {
          const ch = src[j];
          if (ch === "[") depth++;
          else if (ch === "]") depth--;
          else if (ch === ">" && depth <= 0) break;
          j++;
        }
        push({ type: "doctype", value: src.slice(i + 2, j).trim() }); // strip "<!"
        i = j < len ? j + 1 : len;
        continue;
      }
      if (two === "<?") {
        // Processing instruction / XML declaration.
        const end = src.indexOf("?>", i + 2);
        const stop = end === -1 ? len : end;
        const body = src.slice(i + 2, stop);
        const m = /^([^\s]+)\s*([\s\S]*)$/.exec(body);
        push({ type: "pi", target: m ? m[1]! : body.trim(), value: m ? m[2]!.trim() : "" });
        i = end === -1 ? len : end + 2;
        continue;
      }
      if (two === "</") {
        // Closing tag.
        let j = i + 2;
        while (j < len && src[j] !== ">") j++;
        const name = src.slice(i + 2, j).trim();
        // Pop back to the matching open element (tolerant of mis-nesting).
        for (let k = stack.length - 1; k >= 0; k--) {
          if (stack[k]!.name === name) {
            stack.length = k;
            break;
          }
        }
        i = j < len ? j + 1 : len;
        continue;
      }
      if (NAME_START.test(src[i + 1] ?? "")) {
        // Opening/self-closing element.
        const parsed = parseTag(src, i);
        const el: SvgElement = {
          type: "element",
          name: parsed.name,
          attributes: parsed.attrs,
          children: [],
          selfClosing: parsed.selfClosing,
        };
        push(el);
        if (!parsed.selfClosing) stack.push(el);
        i = parsed.end;
        continue;
      }
      // A stray "<" that isn't markup — treat as text.
      const nextLt = src.indexOf("<", i + 1);
      const stop = nextLt === -1 ? len : nextLt;
      push({ type: "text", value: src.slice(i, stop) });
      i = stop;
      continue;
    }
    // Text run up to the next "<".
    const next = src.indexOf("<", i);
    const stop = next === -1 ? len : next;
    const value = src.slice(i, stop);
    if (value.length) push({ type: "text", value });
    i = stop;
  }

  return root;
}

interface TagResult {
  name: string;
  attrs: SvgAttr[];
  selfClosing: boolean;
  end: number;
}

function parseTag(src: string, start: number): TagResult {
  const len = src.length;
  let i = start + 1; // skip "<"
  // Read the tag name.
  let name = "";
  while (i < len && NAME_CHAR.test(src[i]!)) name += src[i++]!;
  const attrs: SvgAttr[] = [];
  let selfClosing = false;

  while (i < len) {
    // Skip whitespace between attributes.
    while (i < len && /\s/.test(src[i]!)) i++;
    const ch = src[i];
    if (ch === undefined) break;
    if (ch === ">") {
      i++;
      break;
    }
    if (ch === "/" && src[i + 1] === ">") {
      selfClosing = true;
      i += 2;
      break;
    }
    if (ch === "/") {
      // stray slash
      i++;
      continue;
    }
    // Attribute name.
    let aname = "";
    while (i < len && !/[\s=/>]/.test(src[i]!)) aname += src[i++]!;
    if (!aname) {
      i++;
      continue;
    }
    // Optional value.
    while (i < len && /\s/.test(src[i]!)) i++;
    if (src[i] === "=") {
      i++;
      while (i < len && /\s/.test(src[i]!)) i++;
      const q = src[i];
      if (q === '"' || q === "'") {
        i++;
        let val = "";
        while (i < len && src[i] !== q) val += src[i++]!;
        i++; // closing quote
        attrs.push({ name: aname, value: val, quote: q });
      } else {
        // Unquoted value.
        let val = "";
        while (i < len && !/[\s>]/.test(src[i]!)) val += src[i++]!;
        attrs.push({ name: aname, value: val, quote: "" });
      }
    } else {
      // Valueless attribute.
      attrs.push({ name: aname, value: "", quote: "" });
    }
  }

  return { name, attrs, selfClosing, end: i };
}

/** Void SVG/HTML elements that never have children (used when serializing). */
const VOID_ELEMENTS = new Set([
  "path", "rect", "circle", "ellipse", "line", "polyline", "polygon",
  "use", "image", "stop", "feColorMatrix", "feGaussianBlur", "feOffset",
  "feBlend", "feFlood", "feImage", "feMergeNode", "feFuncR", "feFuncG",
  "feFuncB", "feFuncA", "animate", "animateTransform", "animateMotion",
  "set", "mpath",
]);

/** Options for {@link serialize}. */
export interface SerializeOptions {
  /** Pretty-print with indentation. Default: minified (`false`). */
  pretty?: boolean;
  /** Indent unit for pretty printing. Default two spaces. */
  indent?: string;
}

/** Serialize a {@link SvgRoot} (or single node) back to a string. */
export function serialize(node: SvgRoot | SvgNode, opts: SerializeOptions = {}): string {
  const pretty = opts.pretty ?? false;
  const indent = opts.indent ?? "  ";
  const children = node.type === "root" || node.type === "element" ? node.children : [];
  if (node.type === "root") {
    return children.map((c) => serializeNode(c, pretty, indent, 0)).join(pretty ? "\n" : "").replace(/^\n+/, "");
  }
  return serializeNode(node as SvgNode, pretty, indent, 0);
}

function serializeNode(node: SvgNode, pretty: boolean, indent: string, depth: number): string {
  const pad = pretty ? indent.repeat(depth) : "";
  switch (node.type) {
    case "text":
      return pretty ? node.value.trim() : node.value;
    case "comment":
      return `${pad}<!--${node.value}-->`;
    case "cdata":
      return `${pad}<![CDATA[${node.value}]]>`;
    case "pi":
      return `${pad}<?${node.target}${node.value ? " " + node.value : ""}?>`;
    case "doctype":
      return `${pad}<${node.value}>`;
    case "element":
      return serializeElement(node, pretty, indent, depth);
  }
}

function serializeElement(el: SvgElement, pretty: boolean, indent: string, depth: number): string {
  const pad = pretty ? indent.repeat(depth) : "";
  const attrs = el.attributes.map(serializeAttr).join("");
  const open = `<${el.name}${attrs}`;
  const realChildren = el.children.filter((c) => !(c.type === "text" && c.value.trim() === ""));

  if (el.selfClosing || (realChildren.length === 0 && (VOID_ELEMENTS.has(el.name) || el.children.length === 0))) {
    return `${pad}${open}/>`;
  }
  if (!pretty) {
    const inner = el.children.map((c) => serializeNode(c, false, indent, depth + 1)).join("");
    return `${open}>${inner}</${el.name}>`;
  }
  // Pretty: single text child stays inline.
  if (realChildren.length === 1 && realChildren[0]!.type === "text") {
    return `${pad}${open}>${(realChildren[0] as SvgText).value.trim()}</${el.name}>`;
  }
  const inner = realChildren
    .map((c) => serializeNode(c, true, indent, depth + 1))
    .join("\n");
  return `${pad}${open}>\n${inner}\n${pad}</${el.name}>`;
}

function serializeAttr(a: SvgAttr): string {
  if (a.quote === "" && a.value === "") return ` ${a.name}`;
  const q = a.quote === "'" ? "'" : '"';
  return ` ${a.name}=${q}${a.value}${q}`;
}

// ------------------------------ tree helpers -------------------------------

/** Read an attribute value by name (first match), or `undefined`. */
export function getAttr(el: SvgElement, name: string): string | undefined {
  return el.attributes.find((a) => a.name === name)?.value;
}

/** Set (or add) an attribute value, preserving order. */
export function setAttr(el: SvgElement, name: string, value: string): void {
  const existing = el.attributes.find((a) => a.name === name);
  if (existing) existing.value = value;
  else el.attributes.push({ name, value, quote: '"' });
}

/** Remove an attribute by name; returns true if one was removed. */
export function removeAttr(el: SvgElement, name: string): boolean {
  const before = el.attributes.length;
  el.attributes = el.attributes.filter((a) => a.name !== name);
  return el.attributes.length !== before;
}

/** Depth-first walk over every element in a tree. */
export function walk(node: SvgRoot | SvgNode, fn: (el: SvgElement, parent: SvgElement | SvgRoot) => void): void {
  const visit = (n: SvgNode, parent: SvgElement | SvgRoot): void => {
    if (n.type === "element") {
      fn(n, parent);
      for (const child of [...n.children]) visit(child, n);
    }
  };
  const parent = node as SvgElement | SvgRoot;
  const kids = node.type === "root" || node.type === "element" ? node.children : [];
  for (const child of [...kids]) visit(child, parent);
}

/** Find the first `<svg>` element in a parsed tree, if any. */
export function findRootSvg(root: SvgRoot): SvgElement | undefined {
  return root.children.find((c): c is SvgElement => c.type === "element" && c.name === "svg");
}
