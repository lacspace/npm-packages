import { describe, it, expect } from "vitest";
import { detectTechDetailed, groupTechByCategory } from "./tech.js";

describe("detectTechDetailed", () => {
  it("categorizes detections with confidence + source", () => {
    const html = `<link href="https://cdn.shopify.com/x.css"><script src="https://js.stripe.com/v3"></script>
      <link href="https://fonts.googleapis.com/css?family=Inter">`;
    const items = detectTechDetailed(html);
    const byName = Object.fromEntries(items.map((i) => [i.name, i]));
    expect(byName["Shopify"]).toMatchObject({ category: "ecommerce" });
    expect(byName["Stripe"]).toMatchObject({ category: "payment" });
    expect(byName["Google Fonts"]).toMatchObject({ category: "fonts" });
    for (const it of items) { expect(it.confidence).toBeGreaterThan(0); expect(it.source).toBeTruthy(); }
  });

  it("extracts a version from a generator meta and from ng-version", () => {
    const wp = detectTechDetailed('<meta name="generator" content="WordPress 6.4.2">');
    expect(wp.find((i) => i.name === "WordPress")?.version).toBe("6.4.2");
    const ng = detectTechDetailed('<app-root ng-version="17.0.1"></app-root>');
    expect(ng.find((i) => i.name === "Angular")?.version).toBe("17.0.1");
  });

  it("detects analytics, ads and CDN and returns nothing for plain html", () => {
    const html = `<script async src="https://www.googletagmanager.com/gtm.js?id=GTM-ABC"></script>
      <script>fbq('init','1')</script><script src="https://cdn-cgi/x"></script>`;
    const items = detectTechDetailed(html);
    const names = items.map((i) => i.name);
    expect(names).toContain("Google Tag Manager");
    expect(names).toContain("Meta Pixel");
    expect(detectTechDetailed("<div>hello</div>")).toEqual([]);
  });
});

describe("groupTechByCategory", () => {
  it("groups items by their category", () => {
    const items = detectTechDetailed('<script src="https://js.stripe.com/v3"></script><link href="https://fonts.googleapis.com/x">');
    const groups = groupTechByCategory(items);
    expect(groups["payment"]?.[0]?.name).toBe("Stripe");
    expect(groups["fonts"]?.[0]?.name).toBe("Google Fonts");
  });
});
