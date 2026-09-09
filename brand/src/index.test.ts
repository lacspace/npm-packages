import { describe, it, expect } from "vitest";
import {
  mark,
  iconTile,
  craftMark,
  pulseMark,
  floatMark,
  revealMark,
  shimmerMark,
  animatedMark,
  COLORS,
  HEX,
  brandCss,
  brandScss,
  installable,
  faviconDataUri,
  webManifest,
  headLinks,
  ASSETS,
  assetUrl,
  GUIDELINES,
  MARK_PATH,
  NODES,
  EDGES,
} from "./index.js";

const valid = (svg: string) => svg.startsWith("<svg") && svg.trimEnd().endsWith("</svg>");

describe("mark", () => {
  it("renders a valid self-contained SVG (the real artwork by default)", () => {
    const svg = mark();
    expect(valid(svg)).toBe(true);
    expect(svg).toContain("aria-label=\"Lacspace\"");
    // default full-colour mark is the real detailed artwork (namespaced ids)
    expect(svg).toContain("lacm-");
    expect(svg).toContain("linearGradient");
  });

  it("the geometric styles use the network silhouette", () => {
    expect(mark({ style: "network" })).toContain(MARK_PATH.slice(0, 24));
    expect(mark({ variant: "white" })).toContain(MARK_PATH.slice(0, 24));
  });

  it("is deterministic", () => {
    expect(mark({ variant: "cyan", size: 128 })).toBe(mark({ variant: "cyan", size: 128 }));
    expect(mark()).toBe(mark());
  });

  it("solid variants use a flat fill, not the real artwork", () => {
    const white = mark({ variant: "white" });
    expect(white).not.toContain("lacm-");
    expect(white).toContain("#FFFFFF");
  });

  it("honours size, style and background", () => {
    expect(mark({ size: 64 })).toContain('width="64"');
    expect(mark({ style: "line" })).toContain("fill=\"none\"");
    expect(mark({ style: "glyph", network: true })).not.toContain("<line x");
    expect(mark({ background: "ink" })).toContain(HEX.ink);
  });

  it("iconTile is a rounded ink app-icon", () => {
    const t = iconTile(512);
    expect(valid(t)).toBe(true);
    expect(t).toContain("rx=");
    expect(t).toContain(HEX.ink);
  });
});

describe("animations", () => {
  it("craftMark is a valid self-contained animated SVG", () => {
    const svg = craftMark({ size: 320 });
    expect(valid(svg)).toBe(true);
    expect(svg).toContain("@keyframes lac-c-draw");
    expect(svg).toContain("prefers-reduced-motion");
    // builds the network then blooms the final mark
    expect(svg).toContain("lac-c-outline");
    expect(svg).toContain("lac-c-final");
  });

  it("craftMark is deterministic and loop adds an infinite breathe", () => {
    expect(craftMark({ uid: "x" })).toBe(craftMark({ uid: "x" }));
    expect(craftMark({ loop: true })).toContain("infinite");
  });

  it("every animation renders valid SVG and respects reduced motion", () => {
    for (const fn of [pulseMark, floatMark, revealMark, shimmerMark]) {
      const svg = fn();
      expect(valid(svg)).toBe(true);
      expect(svg).toContain("prefers-reduced-motion");
    }
    expect(valid(animatedMark("craft"))).toBe(true);
  });

  it("uid keeps two inline animations from colliding", () => {
    expect(pulseMark({ uid: "a" })).toContain("lac-a-b");
    expect(pulseMark({ uid: "b" })).toContain("lac-b-b");
  });
});

describe("colours", () => {
  it("ships the six brand tokens", () => {
    expect(COLORS).toHaveLength(6);
    expect(COLORS.find((c) => c.role === "primary")?.hex).toBe("#F97316");
    expect(HEX.cyan).toBe("#0BB9D9");
  });
  it("emits CSS vars and SCSS", () => {
    expect(brandCss()).toContain("--brand-lacspace-orange: #F97316");
    expect(brandCss()).toContain("--brand-gradient");
    expect(brandScss()).toContain("$lacspace-violet: #7C3AED");
  });
});

describe("installable", () => {
  it("produces an inline favicon, links and a manifest", () => {
    const kit = installable({ base: "/brand/", name: "Lacspace" });
    expect(valid(kit.svg)).toBe(true);
    expect(kit.headLinks).toContain('rel="apple-touch-icon"');
    expect(kit.headLinks).toContain('rel="manifest"');
    expect(kit.manifest.name).toBe("Lacspace");
    expect(Array.isArray((kit.manifest as any).icons)).toBe(true);
  });
  it("faviconDataUri is an inline svg data uri", () => {
    expect(faviconDataUri()).toMatch(/^data:image\/svg\+xml/);
  });
  it("webManifest + headLinks respect the base", () => {
    expect(headLinks({ base: "/x" })).toContain("/x/favicon.svg");
    expect((webManifest({ base: "/x/" }).icons as any[])[0].src).toBe("/x/favicon.svg");
  });
});

describe("assets + guidelines + geometry", () => {
  it("asset manifest points at bundled files", () => {
    expect(ASSETS.markFullColor.path).toBe("assets/svg/mark.svg");
    expect(ASSETS.lottieReveal.kind).toBe("lottie");
    expect(assetUrl("https://cdn.example.com", "faviconSvg")).toBe("https://cdn.example.com/favicon/favicon.svg");
  });
  it("guidelines carry do / don't rules", () => {
    expect(GUIDELINES.DO.length).toBeGreaterThan(3);
    expect(GUIDELINES.DONT.some((d) => /endorsement/i.test(d.detail))).toBe(true);
    expect(GUIDELINES.MIN_SIZE.favicon).toBe(48);
  });
  it("geometry is the 12-node / 15-edge network", () => {
    expect(NODES).toHaveLength(12);
    expect(EDGES).toHaveLength(15);
  });
});
