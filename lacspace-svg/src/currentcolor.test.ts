import { describe, it, expect } from "vitest";
import { currentColorize, currentColorizeElement } from "./currentcolor.js";
import { parseSvg, findRootSvg } from "./parse.js";

describe("currentColorize", () => {
  it("replaces literal fill and stroke with currentColor", () => {
    const { data, replaced } = currentColorize(`<svg><path fill="#f00" stroke="blue"/></svg>`);
    expect(data).toContain('fill="currentColor"');
    expect(data).toContain('stroke="currentColor"');
    expect(replaced).toBe(2);
  });

  it("leaves none / transparent / url() references untouched", () => {
    const { data, replaced } = currentColorize(
      `<svg><rect fill="none" stroke="transparent"/><rect fill="url(#g)"/></svg>`,
    );
    expect(data).toContain('fill="none"');
    expect(data).toContain('stroke="transparent"');
    expect(data).toContain('fill="url(#g)"');
    expect(replaced).toBe(0);
  });

  it("respects a keep-list", () => {
    const { data } = currentColorize(`<svg><path fill="#fff" stroke="#000"/></svg>`, {
      keep: ["#fff"],
    });
    expect(data).toContain('fill="#fff"');
    expect(data).toContain('stroke="currentColor"');
  });

  it("rewrites colours inside a style attribute", () => {
    const { data, replaced } = currentColorize(`<svg><rect style="fill:red;opacity:0.5"/></svg>`);
    expect(data).toContain("fill:currentColor");
    expect(data).toContain("opacity:0.5");
    expect(replaced).toBe(1);
  });

  it("can restrict which attributes are converted", () => {
    const { data } = currentColorize(`<svg><path fill="red" stroke="blue"/></svg>`, {
      attrs: ["fill"],
    });
    expect(data).toContain('fill="currentColor"');
    expect(data).toContain('stroke="blue"');
  });

  it("currentColorizeElement returns the replacement count", () => {
    const svg = findRootSvg(parseSvg(`<svg><path fill="#123456"/></svg>`))!;
    const path = svg.children.find((c) => c.type === "element")!;
    const n = currentColorizeElement(path as never, {});
    expect(n).toBe(1);
  });

  it("does not double-convert an existing currentColor", () => {
    const { replaced } = currentColorize(`<svg><path fill="currentColor"/></svg>`);
    expect(replaced).toBe(0);
  });
});
