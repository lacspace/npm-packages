import { describe, it, expect } from "vitest";
import { toJsx, jsxAttrName, styleToObject } from "./jsx.js";

describe("jsxAttrName", () => {
  it("maps known attributes", () => {
    expect(jsxAttrName("class")).toBe("className");
    expect(jsxAttrName("for")).toBe("htmlFor");
    expect(jsxAttrName("tabindex")).toBe("tabIndex");
  });

  it("camelCases hyphenated attributes", () => {
    expect(jsxAttrName("stroke-width")).toBe("strokeWidth");
    expect(jsxAttrName("fill-opacity")).toBe("fillOpacity");
    expect(jsxAttrName("clip-path")).toBe("clipPath");
  });

  it("handles namespaced attributes", () => {
    expect(jsxAttrName("xlink:href")).toBe("xlinkHref");
    expect(jsxAttrName("xml:space")).toBe("xmlSpace");
    expect(jsxAttrName("xmlns:xlink")).toBe("xmlnsXlink");
  });

  it("leaves data-/aria- attributes alone", () => {
    expect(jsxAttrName("data-icon")).toBe("data-icon");
    expect(jsxAttrName("aria-hidden")).toBe("aria-hidden");
  });
});

describe("styleToObject", () => {
  it("converts a style string into an object literal", () => {
    expect(styleToObject("fill:red;stroke-width:2")).toBe("{ fill: 'red', strokeWidth: '2' }");
  });

  it("preserves custom properties quoted", () => {
    expect(styleToObject("--x:1")).toBe("{ '--x': '1' }");
  });
});

describe("toJsx", () => {
  const svg = `<svg width="24" height="24" class="ic"><path stroke-width="2" d="M0 0"/></svg>`;

  it("renames attributes and spreads props by default", () => {
    const out = toJsx(svg, { name: "Icon" });
    expect(out).toContain("className=\"ic\"");
    expect(out).toContain("strokeWidth=\"2\"");
    expect(out).toContain("{...props}");
    expect(out).toContain("function Icon(props)");
    expect(out).toContain("export default");
  });

  it("emits TypeScript typed props", () => {
    const out = toJsx(svg, { name: "Icon", typescript: true });
    expect(out).toContain("React.SVGProps<SVGSVGElement>");
  });

  it("forwards a ref when asked", () => {
    const out = toJsx(svg, { name: "Icon", ref: true, typescript: true });
    expect(out).toContain("React.forwardRef");
    expect(out).toContain("ref={ref}");
  });

  it("converts a style string to a style object", () => {
    const out = toJsx(`<svg style="fill:red"><rect/></svg>`, { name: "S" });
    expect(out).toContain("style={{ fill: 'red' }}");
  });

  it("self-closes void elements", () => {
    const out = toJsx(svg, { name: "Icon" });
    expect(out).toMatch(/<path[^>]*\/>/);
  });

  it("throws when there is no <svg>", () => {
    expect(() => toJsx(`<div/>`, {})).toThrow();
  });
});
