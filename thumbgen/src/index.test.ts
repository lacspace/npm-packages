import { describe, expect, it } from "vitest";
import { composeThumbs, describe as describeApi, fitHeadline, gradientUri, wrapHeadline, THUMB_SIZES } from "./index.js";
import type { BrandTheme } from "@lacspace/newscard";

const theme: BrandTheme = { bg: "#0b1f3a", fg: "#ffffff", accent: "#c8102e", fontFamily: "Mukta", footer: "WeNepal", logo: "data:image/png;base64,iVBORw0KGgo=" };
const IMG = "data:image/png;base64,iVBORw0KGgo=";

describe("headline fitting", () => {
  it("wraps by words only and finds the largest size that fits ≤ N lines", () => {
    expect(wrapHeadline("नेपाल क्रिकेट संघले १५ सदस्यीय टोली सार्वजनिक गर्‍यो", 60, 600, 3)!.length).toBeLessThanOrEqual(3);
    expect(wrapHeadline("अन्तर्राष्ट्रियकरणप्रक्रिया", 100, 200, 2)).toBeNull(); // single word too wide
    const f = fitHeadline("Budget passed after a marathon session in parliament", 500, 100, 40, 3);
    expect(f.size).toBeLessThan(100);
    expect(f.lines.length).toBeLessThanOrEqual(3);
    const tiny = fitHeadline("x ".repeat(80), 300, 100, 40, 2);
    expect(tiny.lines.length).toBeLessThanOrEqual(2);
    expect(tiny.size).toBe(40);
  });
});

describe("composeThumbs", () => {
  it("produces the layouts that have what they need, with correct canvas and headline", () => {
    const vs = composeThumbs({ theme, headline: { en: "NEPSE closes at record high", ne: "नेप्से रेकर्ड उचाइमा बन्द" }, kicker: { en: "Economy", ne: "अर्थतन्त्र" }, image: IMG, credit: "Photo: Pexels", stat: "+12.5%", attribution: "NRB", lang: "ne" });
    expect(vs.map((v) => v.layout)).toEqual(["split", "fullbleed", "band", "badge", "quote"]);
    for (const v of vs) {
      expect([v.plan.width, v.plan.height]).toEqual([1280, 720]);
      expect(v.plan.texts.some((t) => t.plain.includes("नेप्से"))).toBe(true);
      expect(v.rationale.length).toBeGreaterThan(10);
      expect(v.fontSize).toBeGreaterThanOrEqual(Math.round(1280 * 0.045));
    }
    const split = vs[0]!;
    const photo = split.plan.images.find((i) => i.src === IMG)!;
    expect(photo.fit).toBe("cover");
    expect(photo.x).toBe(704); // 55% of 1280
    expect(split.plan.texts.some((t) => t.plain === "अर्थतन्त्र")).toBe(true);
    expect(split.plan.texts.some((t) => t.plain === "Photo: Pexels")).toBe(true);
    const full = vs[1]!;
    expect(full.plan.background.image).toBe(IMG);
    expect(full.plan.images.some((i) => i.src.startsWith("data:image/svg+xml"))).toBe(true); // scrim
    const badge = vs[3]!;
    expect(badge.plan.texts.some((t) => t.plain === "+12.5%")).toBe(true);
    const band = vs[2]!;
    expect(band.plan.images.find((i) => i.src === IMG)!.radius).toBeGreaterThan(0);
  });
  it("breaking urgency adds a banner on fullbleed and a default kicker; sizes switch by name", () => {
    const vs = composeThumbs({ theme, headline: "Major earthquake hits western Nepal", image: IMG, urgency: "breaking", layouts: ["fullbleed", "band"], size: "og" });
    const full = vs[0]!;
    expect([full.plan.width, full.plan.height]).toEqual([1200, 630]);
    expect(full.plan.rects.some((r) => r.y === 0 && r.w === 1200)).toBe(true);
    expect(full.plan.texts.some((t) => t.plain === "BREAKING")).toBe(true);
    const band = vs[1]!;
    expect(band.plan.rects.some((r) => r.h === Math.round(630 * 0.16))).toBe(true);
  });
  it("skips layouts missing inputs and keeps text inside the canvas", () => {
    const vs = composeThumbs({ theme, headline: "Short", size: "story" });
    expect(vs.map((v) => v.layout)).toEqual(["band"]);
    for (const t of vs[0]!.plan.texts) expect(t.x + t.width).toBeLessThanOrEqual(THUMB_SIZES.story.width);
    expect(gradientUri(10, 10, "#000@0", "#000@1")).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(describeApi().layouts).toContain("badge");
  });
});
