import { describe, it, expect } from "vitest";
import { makeQr } from "./matrix.js";
import { renderToAnsi } from "./ansi.js";

const qr = makeQr("https://lacspace.com", { ecc: "M" });

describe("renderToAnsi", () => {
  it("is square: one line per module row (+margin), two chars per module", () => {
    const margin = 2;
    const out = renderToAnsi(qr, { margin });
    const lines = out.split("\n");
    const total = qr.size + margin * 2;
    expect(lines.length).toBe(total);
    for (const line of lines) expect([...line].length).toBe(total * 2);
  });

  it("defaults to a margin of 2 and uses full blocks", () => {
    const out = renderToAnsi(qr);
    const lines = out.split("\n");
    expect(lines.length).toBe(qr.size + 4);
    expect(out).toContain("██");
  });

  it("invert changes the output", () => {
    const normal = renderToAnsi(qr);
    const inverted = renderToAnsi(qr, { invert: true });
    expect(inverted).not.toBe(normal);
  });

  it("honours custom glyphs", () => {
    const out = renderToAnsi(qr, { margin: 0, dark: "XX", light: ".." });
    expect(out).toContain("XX");
    expect(out).not.toContain("██");
  });
});
