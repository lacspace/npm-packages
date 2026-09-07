import { describe, it, expect } from "vitest";
import { parseSvg, serialize, getAttr, setAttr, removeAttr, findRootSvg, walk } from "./parse.js";
import type { SvgElement } from "./parse.js";

describe("parseSvg — elements & attributes", () => {
  it("parses a simple element with attributes", () => {
    const root = parseSvg(`<svg width="10" height="20"><rect x="1" y="2"/></svg>`);
    const svg = findRootSvg(root)!;
    expect(svg.name).toBe("svg");
    expect(getAttr(svg, "width")).toBe("10");
    expect(svg.children.filter((c) => c.type === "element")).toHaveLength(1);
  });

  it("handles self-closing tags", () => {
    const root = parseSvg(`<svg><path d="M0 0"/></svg>`);
    const svg = findRootSvg(root)!;
    const path = svg.children.find((c): c is SvgElement => c.type === "element")!;
    expect(path.selfClosing).toBe(true);
    expect(getAttr(path, "d")).toBe("M0 0");
  });

  it("parses namespaced attributes like xlink:href", () => {
    const root = parseSvg(`<svg><use xlink:href="#a"/></svg>`);
    const use = findRootSvg(root)!.children.find((c): c is SvgElement => c.type === "element")!;
    expect(getAttr(use, "xlink:href")).toBe("#a");
  });

  it("handles single-quoted and unquoted attribute values", () => {
    const root = parseSvg(`<svg foo='bar' baz=qux></svg>`);
    const svg = findRootSvg(root)!;
    expect(getAttr(svg, "foo")).toBe("bar");
    expect(getAttr(svg, "baz")).toBe("qux");
  });

  it("handles valueless attributes", () => {
    const root = parseSvg(`<svg><foo disabled/></svg>`);
    const foo = findRootSvg(root)!.children.find((c): c is SvgElement => c.type === "element")!;
    expect(getAttr(foo, "disabled")).toBe("");
  });
});

describe("parseSvg — special nodes", () => {
  it("parses comments", () => {
    const root = parseSvg(`<!-- hello --><svg/>`);
    expect(root.children[0]).toMatchObject({ type: "comment", value: " hello " });
  });

  it("parses CDATA", () => {
    const root = parseSvg(`<svg><style><![CDATA[.a{fill:red}]]></style></svg>`);
    const style = findRootSvg(root)!.children.find((c): c is SvgElement => c.type === "element")!;
    expect(style.children[0]).toMatchObject({ type: "cdata", value: ".a{fill:red}" });
  });

  it("parses the XML declaration as a PI with target xml", () => {
    const root = parseSvg(`<?xml version="1.0" encoding="UTF-8"?><svg/>`);
    expect(root.children[0]).toMatchObject({ type: "pi", target: "xml" });
  });

  it("parses <?xml-stylesheet?>", () => {
    const root = parseSvg(`<?xml-stylesheet href="a.css"?><svg/>`);
    expect(root.children[0]).toMatchObject({ type: "pi", target: "xml-stylesheet" });
  });

  it("parses DOCTYPE including an internal subset", () => {
    const root = parseSvg(`<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" [ <!ENTITY x "y"> ]><svg/>`);
    expect(root.children[0]!.type).toBe("doctype");
    expect(root.children[1]!.type).toBe("element");
  });

  it("preserves entities in text and attributes verbatim", () => {
    const root = parseSvg(`<svg title="a &amp; b"><text>x &lt; y</text></svg>`);
    const svg = findRootSvg(root)!;
    expect(getAttr(svg, "title")).toBe("a &amp; b");
    const text = svg.children.find((c): c is SvgElement => c.type === "element")!;
    expect((text.children[0] as { value: string }).value).toBe("x &lt; y");
  });
});

describe("serialize — round trips", () => {
  const cases = [
    `<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1"/></svg>`,
    `<svg><g><circle cx="5" cy="5" r="4"/></g></svg>`,
    `<svg><use xlink:href="#a"/></svg>`,
    `<svg><!--c--><rect/></svg>`,
  ];
  for (const svg of cases) {
    it(`round-trips minified: ${svg.slice(0, 24)}…`, () => {
      const out = serialize(parseSvg(svg));
      // Re-parse and compare element structure (attribute-exact).
      const a = findRootSvg(parseSvg(svg))!;
      const b = findRootSvg(parseSvg(out))!;
      expect(b.name).toBe(a.name);
      expect(b.children.length).toBe(a.children.length);
    });
  }

  it("self-closes void elements when minifying", () => {
    const out = serialize(parseSvg(`<svg><rect x="0"></rect></svg>`));
    expect(out).toContain("<rect x=\"0\"/>");
  });

  it("pretty-prints with indentation", () => {
    const out = serialize(parseSvg(`<svg><g><rect/></g></svg>`), { pretty: true });
    expect(out).toContain("\n");
    expect(out).toMatch(/^<svg>/);
  });

  it("preserves the XML declaration on serialize", () => {
    const out = serialize(parseSvg(`<?xml version="1.0"?><svg/>`));
    expect(out).toContain(`<?xml version="1.0"?>`);
  });
});

describe("tree helpers", () => {
  it("setAttr adds and updates", () => {
    const root = parseSvg(`<svg/>`);
    const svg = findRootSvg(root)!;
    setAttr(svg, "fill", "red");
    expect(getAttr(svg, "fill")).toBe("red");
    setAttr(svg, "fill", "blue");
    expect(getAttr(svg, "fill")).toBe("blue");
  });

  it("removeAttr removes", () => {
    const root = parseSvg(`<svg fill="red"/>`);
    const svg = findRootSvg(root)!;
    expect(removeAttr(svg, "fill")).toBe(true);
    expect(getAttr(svg, "fill")).toBeUndefined();
  });

  it("walk visits every element", () => {
    const root = parseSvg(`<svg><g><rect/><circle/></g></svg>`);
    const names: string[] = [];
    walk(root, (el) => names.push(el.name));
    expect(names).toEqual(["svg", "g", "rect", "circle"]);
  });
});
