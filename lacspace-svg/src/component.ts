/**
 * Convert an SVG into a component for one of several frameworks. React output
 * is delegated to {@link toJsx} (unchanged); Vue 3 (SFC), Svelte and Solid are
 * added here. Each cleans the SVG first, keeps the source attribute spelling
 * that the target framework expects, and forwards caller props/attrs to the
 * root `<svg>`. Zero-dependency — built on the same tiny parser/serializer.
 */

import type { SvgElement } from "./parse.js";
import { parseSvg, serialize, findRootSvg } from "./parse.js";
import type { OptimizeOptions } from "./optimize.js";
import { optimize } from "./optimize.js";
import { toJsx } from "./jsx.js";

/** Supported component targets. */
export type Framework = "react" | "vue" | "svelte" | "solid";

/** Options for {@link toComponent} and the per-framework helpers. */
export interface ComponentOptions {
  /** Target framework. Default `"react"`. */
  framework?: Framework;
  /** Component name. Default `"SvgComponent"`. */
  name?: string;
  /** Emit TypeScript. Default `false`. */
  typescript?: boolean;
  /** Clean the SVG first. Default `true`. Pass options to tune. */
  optimize?: boolean | OptimizeOptions;
}

function prep(input: string, opts: ComponentOptions): SvgElement {
  const doOpt = opts.optimize ?? true;
  let source = input;
  if (doOpt !== false) {
    const oopts: OptimizeOptions = typeof doOpt === "object" ? doOpt : {};
    source = optimize(input, oopts).data;
  }
  const svg = findRootSvg(parseSvg(source));
  if (!svg) throw new Error("no <svg> element found in input");
  return svg;
}

/** Inject an attribute/token into the root `<svg …>` opening tag. */
function injectRootAttr(markup: string, token: string): string {
  return markup.replace(/^(<svg\b[^>]*?)(\s*\/?>)/, (_m, head: string, tail: string) => `${head} ${token}${tail}`);
}

function indentBlock(markup: string, pad: string): string {
  return markup.split("\n").map((l) => (l ? pad + l : l)).join("\n");
}

/** Convert an SVG into a Vue 3 single-file component (`<template>` + `<script setup>`). */
export function toVue(input: string, opts: ComponentOptions = {}): string {
  const name = opts.name ?? "SvgComponent";
  const ts = opts.typescript ?? false;
  const svg = prep(input, opts);
  const markup = injectRootAttr(serialize(svg, { pretty: true }), 'v-bind="$attrs"');
  const scriptOpen = ts ? '<script setup lang="ts">' : "<script setup>";
  return (
    `<template>\n${indentBlock(markup, "  ")}\n</template>\n\n` +
    `${scriptOpen}\ndefineOptions({ name: "${name}", inheritAttrs: false });\n</script>\n`
  );
}

/** Convert an SVG into a Svelte component (markup that spreads `$$props`). */
export function toSvelte(input: string, opts: ComponentOptions = {}): string {
  const ts = opts.typescript ?? false;
  const svg = prep(input, opts);
  const markup = injectRootAttr(serialize(svg, { pretty: true }), "{...$$props}");
  const script = ts ? '<script lang="ts"></script>\n\n' : "";
  return `${script}${markup}\n`;
}

/** Convert an SVG into a Solid component (JSX that spreads `props`). */
export function toSolid(input: string, opts: ComponentOptions = {}): string {
  const name = opts.name ?? "SvgComponent";
  const ts = opts.typescript ?? false;
  const svg = prep(input, opts);
  const markup = injectRootAttr(serialize(svg, { pretty: true }), "{...props}");
  const body = indentBlock(markup, "  ");
  const header = ts ? 'import type { Component, JSX } from "solid-js";\n\n' : "";
  const sig = ts
    ? `const ${name}: Component<JSX.SvgSVGAttributes<SVGSVGElement>> = (props) => (`
    : `const ${name} = (props) => (`;
  return `${header}${sig}\n${body}\n);\n\nexport default ${name};\n`;
}

/** Dispatch to the right framework generator. React is delegated to {@link toJsx}. */
export function toComponent(input: string, opts: ComponentOptions = {}): string {
  const framework = opts.framework ?? "react";
  const base: ComponentOptions = { name: opts.name, typescript: opts.typescript, optimize: opts.optimize };
  switch (framework) {
    case "react":
      return toJsx(input, { name: opts.name, typescript: opts.typescript, optimize: opts.optimize });
    case "vue":
      return toVue(input, base);
    case "svelte":
      return toSvelte(input, base);
    case "solid":
      return toSolid(input, base);
    default:
      throw new Error(`unknown framework: ${String(framework)}`);
  }
}
