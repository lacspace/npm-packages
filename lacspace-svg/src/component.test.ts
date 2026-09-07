import { describe, it, expect } from "vitest";
import { toComponent, toVue, toSvelte, toSolid } from "./component.js";

const svg = `<svg viewBox="0 0 24 24"><path d="M0 0" fill="red"/></svg>`;

describe("toVue", () => {
  it("emits a single-file component with template + script setup", () => {
    const out = toVue(svg, { name: "Logo" });
    expect(out).toContain("<template>");
    expect(out).toContain('v-bind="$attrs"');
    expect(out).toContain("<script setup>");
    expect(out).toContain('defineOptions({ name: "Logo", inheritAttrs: false });');
    expect(out).toContain("<path");
  });

  it("adds lang=\"ts\" for TypeScript", () => {
    expect(toVue(svg, { typescript: true })).toContain('<script setup lang="ts">');
  });
});

describe("toSvelte", () => {
  it("spreads $$props onto the root svg", () => {
    const out = toSvelte(svg);
    expect(out).toContain("{...$$props}");
    expect(out).toMatch(/^<svg/);
  });

  it("adds a typed script block for TypeScript", () => {
    expect(toSvelte(svg, { typescript: true })).toContain('<script lang="ts"></script>');
  });
});

describe("toSolid", () => {
  it("emits a props-spreading JSX component", () => {
    const out = toSolid(svg, { name: "Logo" });
    expect(out).toContain("const Logo = (props) => (");
    expect(out).toContain("{...props}");
    expect(out).toContain("export default Logo;");
  });

  it("types the component for TypeScript", () => {
    const out = toSolid(svg, { name: "Logo", typescript: true });
    expect(out).toContain('import type { Component, JSX } from "solid-js";');
    expect(out).toContain("Component<JSX.SvgSVGAttributes<SVGSVGElement>>");
  });
});

describe("toComponent dispatcher", () => {
  it("defaults to React", () => {
    const out = toComponent(svg, { name: "Logo" });
    expect(out).toContain('import * as React from "react";');
  });

  it("routes to vue / svelte / solid", () => {
    expect(toComponent(svg, { framework: "vue" })).toContain("<template>");
    expect(toComponent(svg, { framework: "svelte" })).toContain("{...$$props}");
    expect(toComponent(svg, { framework: "solid" })).toContain("{...props}");
  });

  it("throws on an unknown framework", () => {
    // deliberately bad framework value
    expect(() => toComponent(svg, { framework: "angular" as never })).toThrow(/unknown framework/);
  });

  it("throws when there is no <svg>", () => {
    expect(() => toVue(`<div/>`)).toThrow();
  });
});
