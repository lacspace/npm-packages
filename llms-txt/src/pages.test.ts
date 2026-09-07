import { test, expect } from "vitest";
import {
  llmsFromPages,
  llmsFullTxtFromPages,
  llmsTxtFromPages,
  llmsFullTxt,
  type LlmsPage,
} from "./index";

const pages: LlmsPage[] = [
  { title: "Home", url: "https://acme.com/", content: "# Home\n\nWelcome.", section: "Start" },
  {
    title: "API",
    url: "https://acme.com/api",
    content: "# API\n\nThe reference.",
    notes: "reference",
    section: "Docs",
  },
  { title: "CLI", url: "https://acme.com/cli", content: "# CLI\n\nCommands.", section: "Docs" },
  { title: "Legacy", url: "https://acme.com/legacy", content: "# Legacy", optional: true },
];

test("llmsTxtFromPages groups by section and keeps notes", () => {
  const txt = llmsTxtFromPages(pages, { title: "Acme", summary: "Acme docs" });
  expect(txt).toContain("# Acme");
  expect(txt).toContain("## Start");
  expect(txt).toContain("## Docs");
  expect(txt).toContain("- [API](https://acme.com/api): reference");
  expect(txt.indexOf("## Start")).toBeLessThan(txt.indexOf("## Docs"));
});

test("llmsTxtFromPages routes optional pages into an ## Optional block, last", () => {
  const txt = llmsTxtFromPages(pages, { title: "Acme" });
  expect(txt).toContain("## Optional");
  expect(txt).toContain("- [Legacy](https://acme.com/legacy)");
  expect(txt.indexOf("## Docs")).toBeLessThan(txt.indexOf("## Optional"));
});

test("llmsFullTxtFromPages inlines every page's content with a Source line", () => {
  const full = llmsFullTxtFromPages(pages, { title: "Acme", summary: "All docs" });
  expect(full).toContain("# Acme");
  expect(full).toContain("> All docs");
  expect(full).toContain("## API");
  expect(full).toContain("Source: https://acme.com/api");
  expect(full).toContain("The reference.");
  // matches the underlying llmsFullTxt output for the same sections
  expect(full).toBe(
    llmsFullTxt({
      title: "Acme",
      summary: "All docs",
      sections: pages.map((p) => ({ title: p.title, content: p.content, url: p.url })),
    }),
  );
});

test("llmsFromPages returns both txt and full", () => {
  const { txt, full } = llmsFromPages(pages, { title: "Acme", summary: "Acme docs" });
  expect(txt).toContain("# Acme");
  expect(txt).toContain("## Docs");
  expect(full).toContain("## CLI");
  expect(full).toContain("Commands.");
});

test("pages without a url are inlined into full but not linked in txt", () => {
  const p: LlmsPage[] = [
    { title: "Inline only", content: "# Inline\n\nNo url." },
    { title: "Linked", url: "https://x.com/a", content: "# Linked" },
  ];
  const { txt, full } = llmsFromPages(p, { title: "T" });
  expect(txt).not.toContain("Inline only");
  expect(txt).toContain("- [Linked](https://x.com/a)");
  expect(full).toContain("## Inline only");
});

test("llmsFromPages honours sort within sections", () => {
  const p: LlmsPage[] = [
    { title: "Zebra", url: "https://x.com/z", content: "z", section: "Docs" },
    { title: "Apple", url: "https://x.com/a", content: "a", section: "Docs" },
  ];
  const { txt } = llmsFromPages(p, { title: "T", sort: "title" });
  expect(txt.indexOf("Apple")).toBeLessThan(txt.indexOf("Zebra"));
});
