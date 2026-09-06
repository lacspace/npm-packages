import { describe, it, expect } from "vitest";
import { normalizeDomain, cleanName, detectTech, socialKey, factsFromJsonLd, extractSocials } from "./detect.js";

describe("normalizeDomain", () => {
  it("handles urls, emails, www, paths", () => {
    expect(normalizeDomain("https://www.Acme.com/path?x=1")).toBe("acme.com");
    expect(normalizeDomain("hello@Acme.co.uk")).toBe("acme.co.uk");
    expect(normalizeDomain("ACME.COM")).toBe("acme.com");
  });
});

describe("cleanName", () => {
  it("picks the brand out of a title", () => {
    expect(cleanName("Home | Acme Inc", "acme.com")).toBe("Acme Inc");
    expect(cleanName("Acme — we build things", "acme.com")).toBe("Acme");
    expect(cleanName(undefined, "acme.com")).toBe("Acme");
    expect(cleanName("Welcome", "acme.com")).toBe("Acme");
  });
});

describe("detectTech", () => {
  it("detects platforms from html", () => {
    expect(detectTech('<link href="https://cdn.shopify.com/x.css">')).toContain("Shopify");
    expect(detectTech('<meta name="generator" content="WordPress 6.4">')).toContain("WordPress");
    expect(detectTech('<script src="/_next/static/x.js"></script>')).toContain("Next.js");
    expect(detectTech('<div>plain</div>')).toEqual([]);
  });
});

describe("socialKey", () => {
  it("classifies social urls", () => {
    expect(socialKey("https://linkedin.com/company/acme")).toBe("linkedin");
    expect(socialKey("https://x.com/acme")).toBe("twitter");
    expect(socialKey("https://youtu.be/abc")).toBe("youtube");
    expect(socialKey("https://example.com")).toBeUndefined();
  });
});

describe("extractSocials", () => {
  it("pulls the 8 networks", () => {
    const html = `<a href="https://facebook.com/acme">f</a><a href="https://instagram.com/acme">i</a>
      <a href="https://linkedin.com/company/acme">l</a><a href="https://t.me/acme">t</a>`;
    const s = extractSocials(html);
    expect(s).toMatchObject({ facebook: "https://facebook.com/acme", instagram: "https://instagram.com/acme", linkedin: "https://linkedin.com/company/acme", telegram: "https://t.me/acme" });
  });
});

describe("factsFromJsonLd", () => {
  it("extracts org facts incl address + sameAs", () => {
    const ld = [{
      "@type": "Organization",
      name: "Acme Inc",
      email: "mailto:hi@acme.com",
      telephone: "+1 555 1000",
      address: { "@type": "PostalAddress", streetAddress: "1 Main St", addressLocality: "Springfield", postalCode: "00001", addressCountry: "US" },
      sameAs: ["https://twitter.com/acme", "https://linkedin.com/company/acme"],
      logo: { url: "https://acme.com/logo.png" },
    }];
    const f = factsFromJsonLd(ld);
    expect(f.name).toBe("Acme Inc");
    expect(f.email).toBe("hi@acme.com");
    expect(f.phone).toBe("+1 555 1000");
    expect(f.address).toBe("1 Main St, Springfield, 00001, US");
    expect(f.logo).toBe("https://acme.com/logo.png");
    expect(f.sameAs).toContain("https://twitter.com/acme");
  });
  it("walks @graph", () => {
    const f = factsFromJsonLd([{ "@graph": [{ "@type": "LocalBusiness", name: "Cafe X" }] }]);
    expect(f.name).toBe("Cafe X");
  });
});
