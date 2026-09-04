import { test, expect } from "vitest";
import { llmsTxt, llmsTxtFromSitemap } from "./index";

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
