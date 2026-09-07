import { describe, it, expect } from "vitest";
import { buildSprite, sanitizeId } from "./sprite.js";
import { parseSvg, findRootSvg, getAttr } from "./parse.js";
import type { SvgElement } from "./parse.js";

describe("sanitizeId", () => {
  it("strips .svg and non-id chars", () => {
    expect(sanitizeId("home icon.svg")).toBe("home-icon");
  });

  it("prefixes ids that start with a digit", () => {
    expect(sanitizeId("2fa.svg")).toBe("icon-2fa");
  });

  it("dedupes against a taken set", () => {
    const taken = new Set<string>();
    expect(sanitizeId("a.svg", taken)).toBe("a");
    expect(sanitizeId("a.svg", taken)).toBe("a-2");
  });
});

describe("buildSprite", () => {
  const home = `<svg viewBox="0 0 24 24"><path d="M1 1"/></svg>`;
  const user = `<svg width="16" height="16"><circle cx="8" cy="8" r="4"/></svg>`;

  it("wraps each SVG in a <symbol> with an id", () => {
    const { data, symbols } = buildSprite([
      { id: "home.svg", svg: home },
      { id: "user.svg", svg: user },
    ]);
    expect(symbols.map((s) => s.id)).toEqual(["home", "user"]);
    expect(data).toContain('<symbol id="home"');
    expect(data).toContain('<symbol id="user"');
  });

  it("carries the source viewBox onto the symbol", () => {
    const { data } = buildSprite([{ id: "home", svg: home }]);
    const root = parseSvg(data);
    const outer = findRootSvg(root)!;
    const symbol = outer.children.find((c): c is SvgElement => c.type === "element" && c.name === "symbol")!;
    expect(getAttr(symbol, "viewBox")).toBe("0 0 24 24");
  });

  it("derives a viewBox from width/height when missing", () => {
    const { symbols } = buildSprite([{ id: "user", svg: user }]);
    expect(symbols[0]!.viewBox).toBe("0 0 16 16");
  });

  it("moves the drawing children into the symbol", () => {
    const { data } = buildSprite([{ id: "home", svg: home }]);
    expect(data).toContain("<path");
    // the inner path lives inside the symbol, not a nested <svg>
    expect(data).not.toMatch(/<symbol[^>]*>\s*<svg/);
  });

  it("prints a usage snippet with <use href>", () => {
    const { usage } = buildSprite([{ id: "home", svg: home }]);
    expect(usage).toContain('<use href="#home">');
  });

  it("optimizes each symbol first (unused id dropped)", () => {
    const { data } = buildSprite([
      { id: "a", svg: `<svg viewBox="0 0 1 1"><rect id="unused"/></svg>` },
    ]);
    expect(data).not.toContain("unused");
  });
});
