import { test, expect } from "vitest";
import {
  alternates,
  paginationLinks,
  paginationLinkTags,
  themeColorTags,
} from "./index";

test("alternates resolves canonical + languages against baseUrl and adds x-default", () => {
  const a = alternates({
    canonical: "/pricing",
    baseUrl: "https://x.com",
    languages: { en: "/en/pricing", ne: "https://ne.x.com/pricing" },
    xDefault: "/pricing",
  });
  expect(a.canonical).toBe("https://x.com/pricing");
  expect(a.languages).toEqual({
    en: "https://x.com/en/pricing",
    ne: "https://ne.x.com/pricing",
    "x-default": "https://x.com/pricing",
  });
});

test("alternates omits languages when none given", () => {
  const a = alternates({ canonical: "https://x.com/a" });
  expect(a.canonical).toBe("https://x.com/a");
  expect(a.languages).toBeUndefined();
});

test("paginationLinks yields prev+next in the middle", () => {
  const l = paginationLinks({ page: 2, totalPages: 5, href: (p) => `/blog?page=${p}` });
  expect(l).toEqual({ prev: "/blog?page=1", next: "/blog?page=3" });
});

test("paginationLinks omits prev on page 1 and next on the last page", () => {
  expect(paginationLinks({ page: 1, totalPages: 3, href: (p) => `/p/${p}` })).toEqual({ next: "/p/2" });
  expect(paginationLinks({ page: 3, totalPages: 3, href: (p) => `/p/${p}` })).toEqual({ prev: "/p/2" });
});

test("paginationLinks always emits next when totalPages unknown", () => {
  expect(paginationLinks({ page: 4, href: (p) => `/p/${p}` })).toEqual({ prev: "/p/3", next: "/p/5" });
});

test("paginationLinkTags renders rel prev/next link tags", () => {
  const tags = paginationLinkTags({ page: 2, totalPages: 4, href: (p) => `/blog?page=${p}` });
  expect(tags).toContain('<link rel="prev" href="/blog?page=1">');
  expect(tags).toContain('<link rel="next" href="/blog?page=3">');
});

test("themeColorTags renders a single colour and media variants", () => {
  expect(themeColorTags("#4d9fff")).toBe('<meta name="theme-color" content="#4d9fff">');
  const dual = themeColorTags([
    { color: "#fff", media: "(prefers-color-scheme: light)" },
    { color: "#000", media: "(prefers-color-scheme: dark)" },
  ]);
  expect(dual).toContain('content="#fff" media="(prefers-color-scheme: light)"');
  expect(dual.split("\n")).toHaveLength(2);
});
