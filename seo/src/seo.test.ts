import { test, expect } from "vitest";
import { jsonLd, seoMetadata, breadcrumbFromPath } from "./index";

test("jsonLd escapes </script> (the '<' escape)", () => {
  const out = jsonLd({ a: "</script>" });
  expect(out).toContain("\\u003c");
  expect(out).not.toContain("</script>");
});

test("seoMetadata returns the expected shape", () => {
  const meta = seoMetadata({ title: "Pricing", description: "Our plans" }) as any;
  expect(meta.title).toBe("Pricing");
  expect(meta.description).toBe("Our plans");
  expect(meta.openGraph.type).toBe("website");
  expect(meta.twitter.card).toBe("summary");
});

test("breadcrumbFromPath with a malformed % path does not throw", () => {
  expect(() =>
    breadcrumbFromPath("/blog/%E0%A4", { baseUrl: "https://x.com" }),
  ).not.toThrow();
  const bc = breadcrumbFromPath("/blog/%E0%A4", { baseUrl: "https://x.com" }) as any;
  expect(bc["@type"]).toBe("BreadcrumbList");
  expect(bc.itemListElement.length).toBe(3); // Home + blog + segment
});
