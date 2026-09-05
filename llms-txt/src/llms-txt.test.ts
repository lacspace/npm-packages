import { test, expect } from "vitest";
import { llmsTxt, llmsTxtFromSitemap, llmsTxtFromRoutes, parseLlmsTxt } from "./index";

test("llmsTxt renders expected markdown", () => {
  const out = llmsTxt({
    title: "Lacspace",
    summary: "Open-source TypeScript packages.",
    sections: [
      {
        title: "Docs",
        links: [
          { title: "Packages", url: "https://lacspace.com/packages" },
          { title: "Guide", url: "https://lacspace.com/guide", notes: "start here" },
        ],
      },
    ],
  });
  expect(out).toContain("# Lacspace");
  expect(out).toContain("> Open-source TypeScript packages.");
  expect(out).toContain("## Docs");
  expect(out).toContain("- [Packages](https://lacspace.com/packages)");
  expect(out).toContain("- [Guide](https://lacspace.com/guide): start here");
  expect(out.endsWith("\n")).toBe(true);
});

test("malformed % path segment in a URL does not throw", () => {
  expect(() =>
    llmsTxtFromSitemap([{ url: "https://x.com/%E0%A4" }], { title: "T" }),
  ).not.toThrow();
  const out = llmsTxtFromSitemap([{ url: "https://x.com/%E0%A4" }], { title: "T" });
  expect(out).toContain("# T");
});

test("parseLlmsTxt round-trips what llmsTxt produces", () => {
  const doc = {
    title: "Lacspace",
    summary: "Open-source TypeScript packages.",
    details: "Extra context line one.\nLine two.",
    sections: [
      {
        title: "Docs",
        links: [
          { title: "Packages", url: "https://lacspace.com/packages" },
          { title: "Guide", url: "https://lacspace.com/guide", notes: "start here" },
        ],
      },
      {
        title: "Products",
        links: [{ title: "SEO Kit", url: "https://lacspace.com/seo" }],
      },
    ],
  };
  const parsed = parseLlmsTxt(llmsTxt(doc));
  expect(parsed).toEqual(doc);
});

test("llmsTxt sorts links within a section when asked", () => {
  const out = llmsTxt(
    {
      title: "T",
      sections: [
        {
          title: "Docs",
          links: [
            { title: "Zebra", url: "https://x.com/z" },
            { title: "Apple", url: "https://x.com/a" },
          ],
        },
      ],
    },
    { sort: "title" },
  );
  expect(out.indexOf("Apple")).toBeLessThan(out.indexOf("Zebra"));
});

test("llmsTxtFromRoutes groups by section, preserves order, keeps notes", () => {
  const out = llmsTxtFromRoutes(
    [
      { title: "Home", url: "https://acme.com/", section: "Start" },
      { title: "API", url: "https://acme.com/api", notes: "reference", section: "Docs" },
      { title: "CLI", url: "https://acme.com/cli", section: "Docs" },
    ],
    { title: "Acme", summary: "Acme docs" },
  );
  expect(out).toContain("# Acme");
  expect(out).toContain("## Start");
  expect(out).toContain("## Docs");
  expect(out).toContain("- [API](https://acme.com/api): reference");
  expect(out.indexOf("## Start")).toBeLessThan(out.indexOf("## Docs"));
});

test("llmsTxtFromSitemap accepts a raw XML string", () => {
  const xml = `<?xml version="1.0"?>
<urlset>
  <url><loc>https://acme.com/docs/intro</loc></url>
  <url><loc>https://acme.com/blog/hello</loc></url>
  <url><loc>https://acme.com/docs/intro</loc></url>
</urlset>`;
  const out = llmsTxtFromSitemap(xml, { title: "Acme", sectionFromPath: true });
  expect(out).toContain("## Docs");
  expect(out).toContain("## Blog");
  // deduped: the repeated /docs/intro appears once
  expect(out.match(/docs\/intro/g)?.length).toBe(1);
});

test("llmsTxtFromSitemap old array signature still groups into Pages by default", () => {
  const out = llmsTxtFromSitemap([{ loc: "https://acme.com/a" }, { loc: "https://acme.com/b" }], {
    title: "Acme",
  });
  expect(out).toContain("## Pages");
});
