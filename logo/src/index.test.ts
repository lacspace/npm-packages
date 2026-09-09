import { describe, it, expect } from "vitest";
import { generateLogo, generateLogoSet, suggest, generateBrandKit, generateFavicon, animateLogo, initials, PALETTES, ICONS } from "./index.js";

const valid = (svg: string) => svg.startsWith("<svg") && svg.trimEnd().endsWith("</svg>");

describe("generateLogo", () => {
  it("produces a valid, self-contained SVG", () => {
    const r = generateLogo({ name: "Kopi House", keywords: "coffee, cozy, warm" });
    expect(valid(r.svg)).toBe(true);
    expect(r.width).toBeGreaterThan(0);
    expect(r.svg).toContain("aria-label");
  });

  it("is deterministic for the same brief", () => {
    const b = { name: "Orbit Labs", keywords: "ai, network, fast" };
    expect(generateLogo(b).svg).toBe(generateLogo(b).svg);
  });

  it("changes with the seed", () => {
    const a = generateLogo({ name: "Orbit Labs", seed: 1 }).svg;
    const b = generateLogo({ name: "Orbit Labs", seed: 2 }).svg;
    expect(a).not.toBe(b);
  });

  it("maps keywords to a sensible icon", () => {
    expect(generateLogo({ name: "Bean", keywords: "coffee cafe", icon: undefined }).icon).toBe("cup");
    expect(generateLogo({ name: "Payly", keywords: "wallet money pay" }).icon).toBe("wallet");
    expect(generateLogo({ name: "Sprout", keywords: "eco plant green" }).icon).toBe("leaf");
  });

  it("honours forced palette / engine / shape / layout", () => {
    const r = generateLogo({
      name: "Acme",
      palette: "royal-gold",
      engine: "monogram",
      shape: "hexagon",
      layout: "mark-only",
    });
    expect(r.palette.id).toBe("royal-gold");
    expect(r.engine).toBe("monogram");
    expect(r.shape).toBe("hexagon");
    expect(r.layout).toBe("mark-only");
    expect(r.svg).toContain("url(#"); // gradient fill present
    expect(r.svg).toContain(PALETTES.find((p) => p.id === "royal-gold")!.from);
  });

  it("requires a name", () => {
    // @ts-expect-error intentionally missing name
    expect(() => generateLogo({})).toThrow();
    expect(() => generateLogo({ name: "  " })).toThrow();
  });

  it("all engines render valid SVG", () => {
    for (const engine of ["monogram", "wordmark", "abstract", "emblem", "lettermark"] as const) {
      const r = generateLogo({ name: "Nova Field", keywords: "tech ai", engine });
      expect(valid(r.svg), `engine ${engine}`).toBe(true);
    }
  });
});

describe("generateLogoSet", () => {
  it("returns N reproducible variations", () => {
    const set = generateLogoSet({ name: "Orbit Labs", keywords: "ai fast" }, 8);
    expect(set).toHaveLength(8);
    expect(set.every((r) => valid(r.svg))).toBe(true);
    // reproducible
    const again = generateLogoSet({ name: "Orbit Labs", keywords: "ai fast" }, 8);
    expect(set.map((s) => s.svg)).toEqual(again.map((s) => s.svg));
  });
});

describe("suggest + helpers", () => {
  it("suggest returns interpretation without throwing", () => {
    const s = suggest({ name: "Ledgerly", keywords: "fintech trust money" });
    expect(s.mood).toBeTruthy();
    expect(s.paletteId).toBeTruthy();
    expect(s.notes.length).toBeGreaterThan(2);
  });
  it("initials derive from the name", () => {
    expect(initials("Kopi House")).toBe("KH");
    expect(initials("Nova")).toBe("NO");
  });
  it("ships a non-trivial JSON brain", () => {
    expect(PALETTES.length).toBeGreaterThanOrEqual(30);
    expect(ICONS.length).toBeGreaterThanOrEqual(60);
  });
});

describe("brand kit (brand-in-a-box)", () => {
  const kit = generateBrandKit({ name: "Orbit Labs", keywords: "ai, network, fast" });
  it("produces every variant as valid SVG", () => {
    for (const k of ["primary", "stacked", "mark", "wordmark", "mono"] as const) {
      expect(valid(kit[k].svg), k).toBe(true);
    }
  });
  it("keeps one consistent palette across variants", () => {
    expect([kit.primary, kit.stacked, kit.mark, kit.wordmark].every((v) => v.palette.id === kit.palette.id)).toBe(true);
  });
  it("emits a favicon set + colours + css vars", () => {
    expect(kit.favicon.sizes.length).toBeGreaterThan(3);
    expect(kit.favicon.svg).toContain("<svg");
    expect(kit.colors.find((c) => c.role === "primary")?.hex).toBe(kit.palette.primary);
    expect(kit.css).toContain("--brand-primary");
  });
  it("is deterministic", () => {
    expect(generateBrandKit({ name: "Acme" }).primary.svg).toBe(generateBrandKit({ name: "Acme" }).primary.svg);
  });
  it("generateFavicon sizes the same mark", () => {
    const fav = generateFavicon({ name: "Nova", keywords: "tech" });
    expect(fav.sizes.find((s) => s.size === 32)?.svg).toContain('width="32"');
    expect(fav.links).toContain("apple-touch-icon");
  });
});

describe("animateLogo", () => {
  it("wraps a logo in a self-contained CSS reveal", () => {
    const svg = animateLogo({ name: "Orbit Labs", keywords: "ai, network" });
    expect(valid(svg)).toBe(true);
    expect(svg).toContain("@keyframes lac-in");
    expect(svg).toContain("lac-wipe");
    expect(svg).toContain('class="lac-root"');
    expect(svg).toContain("prefers-reduced-motion");
  });
  it("accepts a LogoResult and is deterministic", () => {
    const r = generateLogo({ name: "Acme", seed: 5 });
    expect(animateLogo(r)).toBe(animateLogo(r));
  });
  it("honours loop + shimmer:false", () => {
    expect(animateLogo({ name: "X" }, { loop: true })).toContain("infinite");
    expect(animateLogo({ name: "X" }, { shimmer: false })).not.toContain("lac-shim-g");
  });
});
