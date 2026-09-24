import { test, expect } from "vitest";
import {
  breadcrumb, faqPage, qaPage, itemList, graph, jsonLd, jsonLdScript,
  organization, website, defineSite, breadcrumbFromPath,
} from "./index";

// A schema asserting an empty list is invalid structured data, and Search
// Console reports it as an error. clean() has always dropped empty arrays for
// every other builder in this file — these four bypassed it. Reachable in
// practice as faqPage(post.faqs) on a post with no FAQs.
const ORG = { name: "A", url: "https://a.com" };

test("empty collections do not assert an empty list", () => {
  for (const [label, node] of [
    ["breadcrumb", breadcrumb([])],
    ["faqPage", faqPage([])],
    ["qaPage", qaPage([])],
    ["itemList", itemList([])],
  ] as const) {
    const json = JSON.stringify(node);
    expect(json, label).not.toMatch(/:\[\]/);
    expect(json, label).not.toContain("numberOfItems");
  }
  expect(graph()).toEqual({ "@context": "https://schema.org" });
});

test("jsonLdScript emits no tag at all for a content-free schema", () => {
  for (const node of [breadcrumb([]), faqPage([]), qaPage([]), itemList([]), graph()]) {
    expect(jsonLdScript(node)).toBe("");
  }
});

test("real content still emits exactly as before", () => {
  const faq = faqPage([{ question: "Q?", answer: "A." }]);
  expect(faq).toMatchObject({ "@type": "FAQPage" });
  expect((faq as { mainEntity: unknown[] }).mainEntity).toHaveLength(1);
  expect(jsonLdScript(faq)).toContain('<script type="application/ld+json">');
  expect(jsonLdScript(faq)).toContain("FAQPage");

  const bc = breadcrumb([{ name: "Home", url: "https://a.com" }]);
  expect((bc as { itemListElement: unknown[] }).itemListElement).toHaveLength(1);

  const list = itemList([{ name: "A", url: "/a" }, { name: "B", url: "/b" }]);
  expect(list).toMatchObject({ numberOfItems: 2 });
});

test("an empty itemList that carries authored content still emits", () => {
  // The author explicitly named this list, so it says something even with no
  // items — it must not be swallowed.
  const named = itemList([], { name: "Empty shelf" });
  expect(named).toMatchObject({ name: "Empty shelf" });
  expect(jsonLdScript(named)).not.toBe("");
});

test("graph drops falsy and content-free nodes but keeps real ones", () => {
  const g = graph(organization(ORG), false, undefined, null, faqPage([]), website(ORG));
  expect((g["@graph"] as { "@type": string }[]).map((n) => n["@type"])).toEqual(["Organization", "WebSite"]);
});

test("graph strips the nested @context from each node", () => {
  const g = graph(organization(ORG));
  expect(JSON.stringify((g["@graph"] as unknown[])[0])).not.toContain("@context");
  expect(g["@context"]).toBe("https://schema.org");
});

test("an array passed to jsonLdScript is filtered per node", () => {
  const out = jsonLdScript([faqPage([]), organization(ORG)]);
  expect(out).toContain("Organization");
  expect(out).not.toContain("FAQPage");
  expect(jsonLdScript([faqPage([]), breadcrumb([])])).toBe("");
});

test("jsonLd stays a low-level stringifier and always stringifies", () => {
  // Only jsonLdScript decides whether to emit; jsonLd must not surprise callers
  // who pass it to dangerouslySetInnerHTML themselves.
  expect(jsonLd(faqPage([]))).toBe('{"@context":"https://schema.org","@type":"FAQPage"}');
  expect(jsonLd(organization(ORG))).toContain("Organization");
  expect(jsonLd({ a: "<script>" })).not.toContain("<script>");
});

test("the site helpers are unaffected", () => {
  const site = defineSite({ name: "A", url: "https://a.com", description: "d" });
  expect((site.rootJsonLd()["@graph"] as { "@type": string }[]).map((n) => n["@type"])).toEqual(["Organization", "WebSite"]);
  const page = site.page({ title: "T", path: "/x" });
  expect((page.jsonLd["@graph"] as { "@type": string }[]).map((n) => n["@type"])).toEqual(["WebPage", "BreadcrumbList"]);
  expect(jsonLdScript(site.rootJsonLd())).not.toBe("");
});

test("breadcrumbFromPath always has Home, so it is never content-free", () => {
  const root = breadcrumbFromPath("/", { baseUrl: "https://a.com" });
  expect((root as { itemListElement: unknown[] }).itemListElement).toHaveLength(1);
  expect(jsonLdScript(root)).not.toBe("");
});
