import { describe, it, expect } from "vitest";
import {
  optimize, normalizeColor, roundNumber, roundNumbersIn,
  stripTrivialTransforms, collectReferencedIds,
} from "./optimize.js";
import { parseSvg } from "./parse.js";

describe("optimize — stripping", () => {
  it("strips comments", () => {
    const { data } = optimize(`<svg><!-- editor note --><rect/></svg>`);
    expect(data).not.toContain("editor note");
  });

  it("strips the XML declaration and doctype", () => {
    const { data } = optimize(`<?xml version="1.0"?><!DOCTYPE svg><svg><rect/></svg>`);
    expect(data).not.toContain("<?xml");
    expect(data.toLowerCase()).not.toContain("doctype");
  });

  it("strips <metadata> and editor attributes", () => {
    const { data } = optimize(
      `<svg xmlns:inkscape="x"><metadata>junk</metadata><rect inkscape:label="a" sodipodi:role="b"/></svg>`,
    );
    expect(data).not.toContain("metadata");
    expect(data).not.toContain("inkscape:label");
    expect(data).not.toContain("sodipodi:role");
  });

  it("removes <title>/<desc> only when removeTitle is set", () => {
    const src = `<svg><title>Logo</title><desc>d</desc><rect/></svg>`;
    expect(optimize(src, { removeTitle: false }).data).toContain("<title>");
    expect(optimize(src, { removeTitle: true }).data).not.toContain("<title>");
  });

  it("removes empty attributes", () => {
    const { data } = optimize(`<svg><rect class="" fill="red"/></svg>`);
    expect(data).not.toContain('class=""');
    expect(data).toContain('fill="red"');
  });

  it("removes empty containers", () => {
    const { data } = optimize(`<svg><g></g><rect/></svg>`);
    expect(data).not.toContain("<g");
  });

  it("keeps a container that has an id", () => {
    const { data } = optimize(`<svg><g id="keep"></g><rect/></svg>`, { removeUnusedIds: false });
    // g is empty but referenceable via its id -> retained
    expect(data).toContain("keep");
  });
});

describe("optimize — id handling", () => {
  it("removes unused ids", () => {
    const { data } = optimize(`<svg><rect id="unused"/></svg>`);
    expect(data).not.toContain("unused");
  });

  it("keeps ids referenced by url(#id)", () => {
    const { data } = optimize(
      `<svg><linearGradient id="g"/><rect fill="url(#g)"/></svg>`,
    );
    expect(data).toContain('id="g"');
  });

  it("keeps ids referenced by href", () => {
    const { data } = optimize(`<svg><path id="p" d="M0 0"/><use href="#p"/></svg>`);
    expect(data).toContain('id="p"');
  });

  it("collectReferencedIds finds url() and href refs", () => {
    const ids = collectReferencedIds(parseSvg(
      `<svg><rect fill="url(#a)"/><use xlink:href="#b"/></svg>`,
    ));
    expect(ids.has("a")).toBe(true);
    expect(ids.has("b")).toBe(true);
  });
});

describe("optimize — numbers & precision", () => {
  it("rounds to the default precision", () => {
    expect(roundNumber(1.23456, 3)).toBe("1.235");
    expect(roundNumber(2.0, 3)).toBe("2");
  });

  it("rounds numbers inside a string", () => {
    expect(roundNumbersIn("M0.12345 0.98765", 2)).toBe("M0.12 0.99");
  });

  it("rounds path coordinates via optimize", () => {
    const { data } = optimize(`<svg><path d="M0.123456 0.987654"/></svg>`, { precision: 2 });
    expect(data).toContain("0.12");
    expect(data).not.toContain("0.123456");
  });
});

describe("optimize — colours", () => {
  it("shortens 6-hex to 3-hex", () => {
    expect(normalizeColor("#ffffff")).toBe("#fff");
    expect(normalizeColor("#FF0000")).toBe("#f00");
  });

  it("lowercases and keeps non-collapsible hex", () => {
    expect(normalizeColor("#AB12CD")).toBe("#ab12cd");
  });

  it("converts rgb() to hex", () => {
    expect(normalizeColor("rgb(255,0,0)")).toBe("#f00");
    expect(normalizeColor("rgb(17, 34, 51)")).toBe("#123");
  });

  it("normalizes colours in attributes and style", () => {
    const { data } = optimize(`<svg><rect fill="#FFFFFF" style="stroke:rgb(255,0,0)"/></svg>`);
    expect(data).toContain("#fff");
    expect(data).toContain("#f00");
  });
});

describe("optimize — transforms", () => {
  it("drops identity transforms", () => {
    expect(stripTrivialTransforms("translate(0,0)")).toBe("");
    expect(stripTrivialTransforms("scale(1)")).toBe("");
    expect(stripTrivialTransforms("matrix(1,0,0,1,0,0)")).toBe("");
    expect(stripTrivialTransforms("rotate(0)")).toBe("");
  });

  it("simplifies translate(x,0) and scale(s,s)", () => {
    expect(stripTrivialTransforms("translate(5,0)")).toBe("translate(5)");
    expect(stripTrivialTransforms("scale(2,2)")).toBe("scale(2)");
  });

  it("keeps meaningful transforms", () => {
    expect(stripTrivialTransforms("translate(5,6)")).toBe("translate(5 6)");
  });

  it("removes a no-op transform attribute", () => {
    const { data } = optimize(`<svg><g transform="translate(0,0)"><rect/></g></svg>`);
    expect(data).not.toContain("transform");
  });
});

describe("optimize — dimensions & viewBox", () => {
  it("adds a viewBox from width/height", () => {
    const { data } = optimize(`<svg width="24" height="24"><rect/></svg>`);
    expect(data).toContain('viewBox="0 0 24 24"');
  });

  it("removes dimensions when opted in", () => {
    const { data } = optimize(`<svg width="24" height="24" viewBox="0 0 24 24"><rect/></svg>`, {
      removeDimensions: true,
    });
    expect(data).not.toContain('width="24"');
    expect(data).toContain("viewBox");
  });
});

describe("optimize — reporting & multipass", () => {
  it("reports before/after bytes and percent saved", () => {
    const src = `<svg>   <!-- big comment that should vanish -->   <rect id="x"/></svg>`;
    const res = optimize(src);
    expect(res.before).toBeGreaterThan(res.after);
    expect(res.saved).toBe(res.before - res.after);
    expect(res.savedPct).toBeGreaterThan(0);
  });

  it("multipass stabilizes", () => {
    const src = `<svg><g><g><rect id="u"/></g></g></svg>`;
    const once = optimize(src).data;
    const multi = optimize(src, { multipass: true }).data;
    expect(multi.length).toBeLessThanOrEqual(once.length);
  });
});
