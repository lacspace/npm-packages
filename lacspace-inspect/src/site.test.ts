import { describe, it, expect } from "vitest";
import { auditPage, analyzeSite, normUrl } from "./site.js";
import type { PageAudit } from "./types.js";

const home = auditPage(
  `<html lang="en"><head><title>Same Title</title>
    <meta name="description" content="A shared description used on two pages.">
    <meta name="viewport" content="width=device-width">
   </head><body><h1>Home</h1>
    <a href="/about">about</a><a href="/broken">dead</a>
    <a href="https://other.com/x">ext</a></body></html>`,
  { url: "https://example.com/", status: 200 },
);
const about = auditPage(
  `<html lang="en"><head><title>Same Title</title>
    <meta name="description" content="A shared description used on two pages.">
   </head><body><h1>About</h1><a href="/">home</a></body></html>`,
  { url: "https://example.com/about", status: 200 },
);
const broken = auditPage(
  `<html><head><title>Gone</title></head><body><h1>404</h1></body></html>`,
  { url: "https://example.com/broken", status: 404 },
);

describe("auditPage", () => {
  it("splits internal vs external links (normalized) and captures title/desc", () => {
    expect(home.title).toBe("Same Title");
    expect(home.metaDescription).toContain("shared description");
    expect(home.internalLinks).toContain("https://example.com/about");
    expect(home.internalLinks).toContain("https://example.com/broken");
    expect(home.externalLinks).toContain("https://other.com/x");
    expect(home.httpStatus).toBe(200);
  });
});

describe("analyzeSite", () => {
  const pages: PageAudit[] = [home, about, broken];
  const site = analyzeSite("https://example.com/", pages);

  it("builds a leaderboard and a site average", () => {
    expect(site.pageCount).toBe(3);
    expect(site.leaderboard).toHaveLength(3);
    // Sorted best score first.
    const scores = site.leaderboard.map((e) => e.score);
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
    expect(site.averageScore).toBeGreaterThanOrEqual(0);
    expect(["A", "B", "C", "D", "F"]).toContain(site.averageGrade);
  });

  it("detects duplicate titles and descriptions across pages", () => {
    const dupTitle = site.duplicateTitles.find((d) => d.value === "Same Title");
    expect(dupTitle).toBeTruthy();
    expect(dupTitle!.urls).toHaveLength(2);
    expect(site.duplicateDescriptions[0]!.urls).toContain("https://example.com/");
  });

  it("finds broken internal links pointing at a crawled 4xx page", () => {
    const broke = site.brokenInternalLinks.find((b) => b.to === normUrl("https://example.com/broken"));
    expect(broke).toBeTruthy();
    expect(broke!.status).toBe(404);
    expect(broke!.from).toBe("https://example.com/");
  });

  it("uses extraStatus for off-crawl link targets", () => {
    const two = analyzeSite("https://example.com/", [home], { "https://example.com/about": 500 });
    expect(two.brokenInternalLinks.some((b) => b.status === 500)).toBe(true);
  });

  it("surfaces the most common warn/fail issues with counts", () => {
    expect(site.commonIssues.length).toBeGreaterThan(0);
    expect(site.commonIssues[0]!.count).toBeGreaterThanOrEqual(1);
  });
});
