import { describe, it, expect } from "vitest";
import { makeQr } from "./matrix.js";
import { renderToSvg, isFinderModule, logoClearing } from "./svg.js";

const qrM = makeQr("https://lacspace.com", { ecc: "M" });
const qrH = makeQr("https://lacspace.com", { ecc: "H" });

describe("styled module shapes", () => {
  it("dots renders <circle> elements", () => {
    const svg = renderToSvg(qrM, { shape: "dots" });
    expect(svg).toContain("<circle");
    expect(svg).not.toContain("<path");
  });

  it("rounded renders rects with a corner radius", () => {
    const svg = renderToSvg(qrM, { shape: "rounded" });
    expect(svg).toContain("<rect x=");
    expect(svg).toMatch(/rx="0\.35"/);
  });

  it("square renders plain rects (no path, no rx)", () => {
    const svg = renderToSvg(qrM, { shape: "square" });
    expect(svg).toContain("<rect x=");
    expect(svg).not.toContain("<path");
    // the module rects carry no rx (only the bg rect, which has no rx either)
    expect(svg).not.toContain('rx="');
  });

  it("no shape keeps the legacy single <path>", () => {
    const svg = renderToSvg(qrM);
    expect(svg).toContain("<path");
    expect(svg).not.toContain("<circle");
  });

  it("a distinct eye shape mixes finder rects with data dots", () => {
    const svg = renderToSvg(qrM, { shape: "dots", eye: "square" });
    expect(svg).toContain("<circle"); // data modules
    expect(svg).toContain("<rect x="); // finder-eye modules
  });
});

describe("isFinderModule", () => {
  it("is true inside the three finder corners", () => {
    const s = qrM.size;
    expect(isFinderModule(qrM, 0, 0)).toBe(true);
    expect(isFinderModule(qrM, 6, 6)).toBe(true);
    expect(isFinderModule(qrM, s - 1, 0)).toBe(true);
    expect(isFinderModule(qrM, 0, s - 1)).toBe(true);
  });

  it("is false in the centre and the fourth corner", () => {
    const s = qrM.size;
    expect(isFinderModule(qrM, Math.floor(s / 2), Math.floor(s / 2))).toBe(false);
    expect(isFinderModule(qrM, s - 1, s - 1)).toBe(false);
    expect(isFinderModule(qrM, 8, 8)).toBe(false);
  });
});

describe("gradient foreground", () => {
  it("emits a <linearGradient> and references it", () => {
    const svg = renderToSvg(qrM, { fg: { from: "#4d9fff", to: "#a855f7" } });
    expect(svg).toContain("<linearGradient");
    expect(svg).toContain('id="lqr-fg"');
    expect(svg).toContain("url(#lqr-fg)");
    expect(svg).toContain('stop-color="#4d9fff"');
    expect(svg).toContain('stop-color="#a855f7"');
  });

  it("maps angle 0 to a horizontal vector", () => {
    const svg = renderToSvg(qrM, { fg: { from: "#000", to: "#fff", angle: 0 } });
    expect(svg).toContain('x1="0"');
    expect(svg).toContain('x2="1"');
    expect(svg).toContain('y1="0.5"');
  });

  it("maps angle 90 to a vertical vector", () => {
    const svg = renderToSvg(qrM, { fg: { from: "#000", to: "#fff", angle: 90 } });
    expect(svg).toContain('y1="0"');
    expect(svg).toContain('y2="1"');
  });

  it("combines with a shape (dots filled by the gradient)", () => {
    const svg = renderToSvg(qrM, { shape: "dots", fg: { from: "#000", to: "#fff" } });
    expect(svg).toContain("<circle");
    expect(svg).toContain('fill="url(#lqr-fg)"');
  });
});

describe("logoClearing (pure)", () => {
  it("rejects a low ECC symbol with a reason mentioning ECC", () => {
    const c = logoClearing(qrM, { src: "LS" });
    expect(c.allowed).toBe(false);
    expect(c.reason).toMatch(/ECC/);
  });

  it("allows an H symbol and centres the boxes", () => {
    const c = logoClearing(qrH, { src: "LS", size: 0.2, padding: 1 });
    expect(c.allowed).toBe(true);
    expect(c.clear).toBeDefined();
    expect(c.inner).toBeDefined();
    // the inner art box sits inside the cleared band
    expect(c.inner!.x).toBeGreaterThanOrEqual(c.clear!.x);
    expect(c.inner!.w).toBeLessThanOrEqual(c.clear!.w);
    // roughly centred
    const mid = qrH.size / 2;
    const innerMid = c.inner!.x + c.inner!.w / 2;
    expect(Math.abs(innerMid - mid)).toBeLessThanOrEqual(1.5);
  });
});

describe("logo embed in renderToSvg", () => {
  it("draws initials with a clearing band on an H symbol", () => {
    const warnings: string[] = [];
    const svg = renderToSvg(qrH, { logo: "LS", onWarn: (m) => warnings.push(m) });
    expect(svg).toContain("<text");
    expect(svg).toContain(">LS<");
    expect(warnings).toHaveLength(0);
  });

  it("warns and skips the logo on a low-ECC symbol", () => {
    const warnings: string[] = [];
    const svg = renderToSvg(qrM, { logo: "LS", onWarn: (m) => warnings.push(m) });
    expect(svg).not.toContain("<text");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/ECC/);
  });

  it("embeds a data URI as an <image>", () => {
    const svg = renderToSvg(qrH, { logo: "data:image/png;base64,AAAA" });
    expect(svg).toContain("<image");
    expect(svg).toContain('href="data:image/png;base64,AAAA"');
  });

  it("nests raw SVG markup", () => {
    const svg = renderToSvg(qrH, { logo: "<circle cx='1'/>" });
    expect(svg).toContain('overflow="visible"');
    expect(svg).toContain("<circle cx='1'/>");
  });

  it("escapes special characters in initials", () => {
    const svg = renderToSvg(qrH, { logo: "A&B" });
    expect(svg).toContain("A&amp;B");
  });
});
