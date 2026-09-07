import { test, expect } from "vitest";
import { llmsTxt, parseLlmsTxt } from "./index";

test("existing llmsTxt output is byte-for-byte unchanged", () => {
  const out = llmsTxt({
    title: "Lacspace",
    summary: "Open-source TypeScript packages and products.",
    details: "Zero-dependency, isomorphic, Lacspace-Free-Licensed.",
    sections: [
      {
        title: "Docs",
        links: [
          { title: "npm Packages", url: "https://lacspace.com/packages", notes: "20 packages" },
          { title: "SDK", url: "https://www.npmjs.com/package/@lacspace/sdk" },
        ],
      },
    ],
  });
  expect(out).toBe(
    "# Lacspace\n\n" +
      "> Open-source TypeScript packages and products.\n\n" +
      "Zero-dependency, isomorphic, Lacspace-Free-Licensed.\n\n" +
      "## Docs\n\n" +
      "- [npm Packages](https://lacspace.com/packages): 20 packages\n" +
      "- [SDK](https://www.npmjs.com/package/@lacspace/sdk)\n",
  );
});

test("llmsTxt renders the ## Optional block last", () => {
  const out = llmsTxt({
    title: "T",
    sections: [{ title: "Docs", links: [{ title: "API", url: "https://x.com/api" }] }],
    optional: [{ title: "Changelog", url: "https://x.com/changelog", notes: "history" }],
  });
  expect(out).toContain("## Optional");
  expect(out).toContain("- [Changelog](https://x.com/changelog): history");
  expect(out.indexOf("## Docs")).toBeLessThan(out.indexOf("## Optional"));
});

test("empty optional array renders nothing", () => {
  const out = llmsTxt({ title: "T", sections: [], optional: [] });
  expect(out).not.toContain("## Optional");
});

test("parseLlmsTxt round-trips a doc with an Optional block", () => {
  const doc = {
    title: "Acme",
    summary: "Acme docs.",
    sections: [{ title: "Docs", links: [{ title: "API", url: "https://acme.com/api" }] }],
    optional: [{ title: "Legacy", url: "https://acme.com/legacy" }],
  };
  const parsed = parseLlmsTxt(llmsTxt(doc));
  expect(parsed).toEqual(doc);
});
