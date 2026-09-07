/**
 * Convert an SVG string into a React/JSX component.
 *
 * Renames attributes to their JSX/DOM spelling (`class` → `className`,
 * `stroke-width` → `strokeWidth`, `xlink:href` → `xlinkHref`), converts a
 * `style="…"` string into a style object, self-closes void elements, and wraps
 * the markup in a component — optionally TypeScript, optionally forwarding
 * props and a `ref`.
 */

import type { SvgElement, SvgNode, SvgRoot } from "./parse.js";
import { parseSvg, findRootSvg } from "./parse.js";
import type { OptimizeOptions } from "./optimize.js";
import { optimize } from "./optimize.js";

/** Options for {@link toJsx}. */
export interface JsxOptions {
  /** Component name. Default `"SvgComponent"`. */
  name?: string;
  /** Clean the SVG (strip comments/metadata/editor cruft) first. Default `true`. */
  optimize?: boolean | OptimizeOptions;
  /** Emit TypeScript (typed props/ref). Default `false` (plain JSX). */
  typescript?: boolean;
  /** Spread caller props onto the root `<svg>`. Default `true`. */
  spreadProps?: boolean;
  /** Wrap in `React.forwardRef` and forward a ref to the root `<svg>`. */
  ref?: boolean;
  /** Wrap the export in `React.memo`. Default `false`. */
  memo?: boolean;
  /** Indent unit. Default two spaces. */
  indent?: string;
}

/** Exact attribute-name replacements (not derivable by camelCasing). */
const ATTR_MAP: Record<string, string> = {
  class: "className",
  for: "htmlFor",
  "xml:space": "xmlSpace",
  "xml:lang": "xmlLang",
  "xmlns:xlink": "xmlnsXlink",
  tabindex: "tabIndex",
};

const camel = (s: string): string => s.replace(/-([a-z])/g, (_m, c: string) => c.toUpperCase());

/** Map an SVG attribute name to its JSX/React spelling. */
export function jsxAttrName(name: string): string {
  if (ATTR_MAP[name]) return ATTR_MAP[name]!;
  if (name.startsWith("data-") || name.startsWith("aria-")) return name;
  if (name.startsWith("on")) return name; // event-like; left as-is (rare in static svg)
  if (name.includes(":")) {
    // Namespaced, e.g. xlink:href -> xlinkHref
    const [ns, local] = name.split(":");
    return camel(ns!) + (local ? local.charAt(0).toUpperCase() + camel(local).slice(1) : "");
  }
  if (name.includes("-")) return camel(name);
  return name;
}

/** Convert a CSS `style="a:b;c:d"` string into a JSX style-object literal. */
export function styleToObject(style: string): string {
  const entries: string[] = [];
  for (const decl of style.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim();
    const value = decl.slice(idx + 1).trim();
    if (!prop) continue;
    const key = prop.startsWith("--") ? `'${prop}'` : camel(prop);
    entries.push(`${key}: '${value.replace(/'/g, "\\'")}'`);
  }
  return `{ ${entries.join(", ")} }`;
}

/** Convert an SVG string into a React component source string. */
export function toJsx(input: string, opts: JsxOptions = {}): string {
  const name = opts.name ?? "SvgComponent";
  const ts = opts.typescript ?? false;
  const spread = opts.spreadProps ?? true;
  const useRef = opts.ref ?? false;
  const indent = opts.indent ?? "  ";

  const doOpt = opts.optimize ?? true;
  let source = input;
  if (doOpt !== false) {
    const oopts: OptimizeOptions = typeof doOpt === "object" ? doOpt : {};
    source = optimize(input, oopts).data;
  }

  const root = parseSvg(source);
  const svg = findRootSvg(root);
  if (!svg) throw new Error("no <svg> element found in input");

  const jsx = serializeJsxElement(svg, indent, 2, { spread, ref: useRef });
  const body = `${indent}return (\n${jsx}\n${indent});`;

  const propsType = ts ? ": React.SVGProps<SVGSVGElement>" : "";
  const refType = ts ? ", ref: React.Ref<SVGSVGElement>" : "";

  let component: string;
  if (useRef) {
    const sig = ts
      ? `React.forwardRef<SVGSVGElement, React.SVGProps<SVGSVGElement>>(function ${name}(props, ref) {`
      : `React.forwardRef(function ${name}(props, ref) {`;
    component = `const ${name} = ${sig}\n${body}\n})`;
  } else {
    component = `function ${name}(props${propsType}${useRef ? refType : ""}) {\n${body}\n}`;
  }

  const exported = opts.memo
    ? `${component};\n\nexport default React.memo(${name});`
    : useRef
      ? `${component};\n\nexport default ${name};`
      : `export default ${component}`;

  return `import * as React from "react";\n\n${exported}\n`;
}

interface JsxCtx {
  spread: boolean;
  ref: boolean;
}

function serializeJsxElement(el: SvgElement, indent: string, depth: number, ctxRoot?: JsxCtx): string {
  const pad = indent.repeat(depth);
  const attrs: string[] = [];
  for (const a of el.attributes) {
    if (a.name === "style") {
      attrs.push(`style={${styleToObject(a.value)}}`);
      continue;
    }
    const jn = jsxAttrName(a.name);
    if (a.quote === "" && a.value === "") {
      attrs.push(jn);
      continue;
    }
    const q = a.value.includes('"') ? "'" : '"';
    attrs.push(`${jn}=${q}${a.value}${q}`);
  }
  if (ctxRoot?.ref) attrs.push("ref={ref}");
  if (ctxRoot?.spread) attrs.push("{...props}");

  const attrStr = attrs.length ? " " + attrs.join(" ") : "";
  const kids = el.children.filter(
    (c) => !(c.type === "text" && c.value.trim() === ""),
  );

  if (kids.length === 0) {
    return `${pad}<${el.name}${attrStr} />`;
  }
  if (kids.length === 1 && kids[0]!.type === "text") {
    return `${pad}<${el.name}${attrStr}>${(kids[0] as { value: string }).value.trim()}</${el.name}>`;
  }
  const inner = kids.map((c) => serializeJsxChild(c, indent, depth + 1)).join("\n");
  return `${pad}<${el.name}${attrStr}>\n${inner}\n${pad}</${el.name}>`;
}

function serializeJsxChild(node: SvgNode, indent: string, depth: number): string {
  const pad = indent.repeat(depth);
  switch (node.type) {
    case "element":
      return serializeJsxElement(node, indent, depth);
    case "text":
      return `${pad}${node.value.trim()}`;
    case "comment":
      return `${pad}{/*${node.value.replace(/\*\//g, "*\\/")}*/}`;
    case "cdata":
      return `${pad}{\`${node.value.replace(/`/g, "\\`")}\`}`;
    default:
      return "";
  }
}

/** Convenience: the tree used by {@link toJsx}, exposed for callers who need it. */
export function parseForJsx(input: string): SvgRoot {
  return parseSvg(input);
}
