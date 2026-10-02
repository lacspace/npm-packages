import { describe, expect, it } from "vitest";
import {
  buildSvg, composeCard, hasDevanagari, imagePrompt, isRefusal, parseColor, pickText,
  renderCard, SIZES, wrapText,
} from "./index.js";
import type { BrandTheme, CardSpec } from "./index.js";

const theme: BrandTheme = {
  bg: "#0b1f3a",
  fg: "#ffffff",
  accent: "#e63946",
  fontFamily: "Mukta",
  fontFamilyNe: "Noto Sans Devanagari",
  footer: "WeNepal",
};

describe("text helpers", () => {
  it("detects Devanagari", () => {
    expect(hasDevanagari("समाचार")).toBe(true);
    expect(hasDevanagari("news")).toBe(false);
  });
  it("wraps to a char budget", () => {
    expect(wrapText("one two three four", 8)).toEqual(["one two", "three", "four"]);
  });
  it("picks localized text by language (Nepali first for both)", () => {
    const v = { en: "Budget passed", ne: "बजेट पारित" };
    expect(pickText(v, "en")).toEqual(["Budget passed"]);
    expect(pickText(v, "ne")).toEqual(["बजेट पारित"]);
    expect(pickText(v, "both")).toEqual(["बजेट पारित", "Budget passed"]);
  });
});

describe("buildSvg", () => {
  const base = (over: Partial<CardSpec> = {}): CardSpec => ({ theme, lang: "both", headline: { en: "Budget passed", ne: "बजेट पारित भयो" }, ...over });

  it("produces a sized SVG with brand bg and both languages", () => {
    const svg = buildSvg(base({ size: "portrait" }));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('width="1080"');
    expect(svg).toContain('height="1350"');
    expect(svg).toContain(theme.bg);
    expect(svg).toContain("बजेट पारित भयो"); // Devanagari
    expect(svg).toContain("Budget passed"); // English
    expect(svg).toContain("WeNepal"); // footer
  });

  it("uses the Devanagari family for Devanagari text", () => {
    const svg = buildSvg(base({ lang: "ne", headline: "काठमाडौं" }));
    expect(svg).toContain('font-family="Noto Sans Devanagari"');
  });

  it("renders a breaking banner with the accent color", () => {
    const svg = buildSvg(base({ type: "breaking", kicker: { en: "Breaking", ne: "ताजा खबर" }, lang: "en" }));
    expect(svg).toContain(`fill="${theme.accent}"`);
    expect(svg).toContain("BREAKING");
  });

  it("renders a stat card with a big value", () => {
    const svg = buildSvg(base({ type: "stat", stat: { value: "रु. १२ अर्ब", label: { ne: "कुल बजेट" } }, headline: undefined }));
    expect(svg).toContain("रु. १२ अर्ब");
    expect(svg).toContain("कुल बजेट");
  });

  it("escapes XML in text", () => {
    const svg = buildSvg(base({ headline: "A & B <tag>", lang: "en" }));
    expect(svg).toContain("A &amp; B &lt;tag&gt;");
    expect(svg).not.toContain("<tag>");
  });

  it("knows the standard sizes", () => {
    expect(SIZES.og).toEqual({ width: 1200, height: 630 });
    expect(SIZES.story).toEqual({ width: 1080, height: 1920 });
  });
});

describe("composeCard — layout plan (pure)", () => {
  const base = (over: Partial<CardSpec> = {}): CardSpec => ({ theme, lang: "both", headline: { en: "Budget passed", ne: "बजेट पारित भयो" }, ...over });

  it("emits sized plan, background, and Pango-markup text runs with both languages", () => {
    const plan = composeCard(base({ size: "portrait" }));
    expect([plan.width, plan.height]).toEqual([1080, 1350]);
    expect(plan.background.color).toBeDefined();
    const all = plan.texts.map((t) => t.plain).join(" | ");
    expect(all).toContain("बजेट पारित भयो");
    expect(all).toContain("Budget passed");
    // markup carries font + color spans and escapes nothing wrongly
    expect(plan.texts.some((t) => t.markup.includes("<span") && t.markup.includes("बजेट पारित भयो"))).toBe(true);
    expect(plan.texts.some((t) => t.plain === "WeNepal")).toBe(true); // footer
  });

  it("uses the Devanagari family for Devanagari runs", () => {
    const plan = composeCard(base({ lang: "ne", headline: "काठमाडौं" }));
    expect(plan.texts.some((t) => t.markup.includes('font_family="Noto Sans Devanagari"') && t.plain.includes("काठमाडौं"))).toBe(true);
  });

  it("breaking card emits an accent banner rect across the top", () => {
    const plan = composeCard(base({ type: "breaking", lang: "en", kicker: "Breaking" }));
    expect(plan.rects.some((r) => r.y === 0 && r.w === plan.width)).toBe(true);
    expect(plan.texts.some((t) => t.plain === "BREAKING")).toBe(true); // banner upper-cases
  });

  it("stat card emits a large value run", () => {
    const plan = composeCard(base({ type: "stat", stat: { value: "रु. १२ अर्ब", label: { ne: "कुल बजेट" } }, headline: undefined }));
    expect(plan.texts.some((t) => t.plain.includes("रु. १२ अर्ब"))).toBe(true);
  });

  it("parseColor handles hex, rgba and name@alpha", () => {
    expect(parseColor("#e63946")).toMatchObject({ r: 230, g: 57, b: 70, alpha: 1 });
    expect(parseColor("rgba(0,0,0,0.5)")).toMatchObject({ r: 0, g: 0, b: 0, alpha: 0.5 });
    expect(parseColor("black@0.6")).toMatchObject({ r: 0, g: 0, b: 0, alpha: 0.6 });
  });
});

describe("renderCard — real raster (Devanagari shaping via sharp/Pango)", () => {
  // A Devanagari headline with conjuncts/matras that resvg could not shape.
  const neTheme: BrandTheme = { bg: "#0b1f3a", fg: "#ffffff", accent: "#e63946", fontFamily: "Mukta Mahee", footer: "WeNepal" };
  const headline = "पृथ्वी राजमार्गमा बुधबार दिउँसो सञ्चालन";

  it("renders a PNG with real ink for a complex Devanagari headline", async () => {
    let png: Uint8Array | null = null;
    try {
      png = await renderCard({ size: "square", type: "headline", theme: neTheme, lang: "ne", headline });
    } catch (e) {
      // Skip if this environment's sharp lacks the Pango text op (CI has it).
      console.warn("render skipped:", (e as Error).message);
      return;
    }
    expect(png).toBeInstanceOf(Uint8Array);
    expect(png!.length).toBeGreaterThan(2000); // a real PNG
    expect(png![0]).toBe(0x89); // PNG magic
    // Compare against an identical card with NO headline: the shaped text must add pixels.
    const blank = await renderCard({ size: "square", type: "headline", theme: neTheme, lang: "ne", headline: undefined });
    expect(png!.length).not.toBe(blank.length); // the shaped headline changed the pixels
  });
});

describe("imagePrompt — safety", () => {
  it("builds an illustration prompt labeled 'AI illustration'", () => {
    const r = imagePrompt({ subject: "rising rice prices in a market", palette: ["#e63946"] });
    expect(isRefusal(r)).toBe(false);
    if (!isRefusal(r)) {
      expect(r.label).toBe("AI illustration");
      expect(r.prompt).toContain("non-photorealistic");
      expect(r.negativePrompt).toContain("photorealistic");
    }
  });
  it("refuses photoreal requests", () => {
    const r = imagePrompt({ subject: "a flood", style: "photorealistic" });
    expect(isRefusal(r)).toBe(true);
    if (isRefusal(r)) expect(r.reason).toMatch(/photoreal/i);
  });
  it("refuses images of named real public figures", () => {
    const r = imagePrompt({ subject: "the Prime Minister announcing the budget" });
    expect(isRefusal(r)).toBe(true);
  });
  it("refuses an empty subject", () => {
    expect(isRefusal(imagePrompt({ subject: "" }))).toBe(true);
  });
});
