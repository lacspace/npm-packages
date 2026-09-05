import { test, expect } from "vitest";
import {
  jsonLd,
  seoMetadata,
  breadcrumbFromPath,
  itemList,
  collectionPage,
  qaPage,
  imageObject,
  softwareSourceCode,
  profilePage,
  defineSite,
} from "./index";

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

/* ---- new: robots / hreflang on seoMetadata ---- */

test("seoMetadata robots directive maps to Metadata.robots", () => {
  const m = seoMetadata({ title: "T", robots: { index: true, follow: false } }) as any;
  expect(m.robots).toEqual({ index: true, follow: false });
});

test("seoMetadata robots defaults missing keys to true", () => {
  const m = seoMetadata({ title: "T", robots: { follow: false } }) as any;
  expect(m.robots).toEqual({ index: true, follow: false });
});

test("seoMetadata noindex still wins over robots", () => {
  const m = seoMetadata({ title: "T", noindex: true, robots: { index: true, follow: true } }) as any;
  expect(m.robots).toEqual({ index: false, follow: false });
});

test("seoMetadata languages populate alternates.languages", () => {
  const m = seoMetadata({ title: "T", languages: { en: "https://x.com/en", ne: "https://x.com/ne" } }) as any;
  expect(m.alternates.languages).toEqual({ en: "https://x.com/en", ne: "https://x.com/ne" });
});

/* ---- new: JSON-LD builders ---- */

test("itemList builds a positioned ItemList", () => {
  const ld = itemList(
    [
      { name: "A", url: "/a" },
      { name: "B", url: "/b", image: "/b.png" },
    ],
    { name: "Posts", url: "/blog" },
  ) as any;
  expect(ld["@type"]).toBe("ItemList");
  expect(ld.name).toBe("Posts");
  expect(ld.numberOfItems).toBe(2);
  expect(ld.itemListElement[0]).toMatchObject({ "@type": "ListItem", position: 1, name: "A", url: "/a" });
  expect(ld.itemListElement[1].position).toBe(2);
  expect(ld.itemListElement[1].image).toBe("/b.png");
});

test("itemList honours explicit positions", () => {
  const ld = itemList([{ name: "X", url: "/x", position: 5 }]) as any;
  expect(ld.itemListElement[0].position).toBe(5);
});

test("collectionPage embeds a hasPart ItemList when items given", () => {
  const ld = collectionPage({ name: "Blog", url: "/blog", description: "All posts", items: [{ name: "A", url: "/a" }] }) as any;
  expect(ld["@type"]).toBe("CollectionPage");
  expect(ld.description).toBe("All posts");
  expect(ld.hasPart["@type"]).toBe("ItemList");
  expect(ld.hasPart["@context"]).toBeUndefined();
  expect(ld.hasPart.numberOfItems).toBe(1);
});

test("collectionPage omits hasPart when no items", () => {
  const ld = collectionPage({ name: "Blog", url: "/blog" }) as any;
  expect(ld.hasPart).toBeUndefined();
});

test("qaPage builds Questions with accepted + suggested answers", () => {
  const ld = qaPage([
    { question: "Is it free?", acceptedAnswer: "Yes.", suggestedAnswers: ["Mostly.", "For personal use."] },
  ]) as any;
  expect(ld["@type"]).toBe("QAPage");
  expect(ld.mainEntity[0]["@type"]).toBe("Question");
  expect(ld.mainEntity[0].acceptedAnswer).toEqual({ "@type": "Answer", text: "Yes." });
  expect(ld.mainEntity[0].suggestedAnswer).toHaveLength(2);
});

test("imageObject includes dimensions and caption", () => {
  const ld = imageObject({ url: "https://x.com/a.png", width: 1200, height: 630, caption: "Hero" }) as any;
  expect(ld["@type"]).toBe("ImageObject");
  expect(ld.url).toBe("https://x.com/a.png");
  expect(ld.contentUrl).toBe("https://x.com/a.png");
  expect(ld.width).toBe(1200);
  expect(ld.caption).toBe("Hero");
});

test("softwareSourceCode builds an open-source node", () => {
  const ld = softwareSourceCode({
    name: "@lacspace/seo",
    codeRepository: "https://github.com/lacspace/npm-packages",
    programmingLanguage: "TypeScript",
    license: "https://lacspace.com/licenses/lacspace-free-1.0",
    runtimePlatform: "Node.js",
  }) as any;
  expect(ld["@type"]).toBe("SoftwareSourceCode");
  expect(ld.codeRepository).toContain("github.com");
  expect(ld.programmingLanguage).toBe("TypeScript");
  expect(ld.runtimePlatform).toBe("Node.js");
});

test("profilePage wraps a Person as mainEntity", () => {
  const ld = profilePage({
    person: { name: "Lumi AI", url: "https://lacspace.com", jobTitle: "AI" },
    dateModified: "2026-09-05",
  }) as any;
  expect(ld["@type"]).toBe("ProfilePage");
  expect(ld.dateModified).toBe("2026-09-05");
  expect(ld.mainEntity["@type"]).toBe("Person");
  expect(ld.mainEntity["@context"]).toBeUndefined();
  expect(ld.mainEntity.name).toBe("Lumi AI");
});

/* ---- new: site.collection ---- */

test("site.collection returns metadata + @graph(CollectionPage, ItemList, Breadcrumb)", () => {
  const site = defineSite({ name: "Acme", url: "https://acme.com" });
  const { metadata, jsonLd: ld } = site.collection({
    title: "Blog",
    path: "/blog",
    items: [
      { name: "Post A", url: "/blog/a" },
      { name: "Post B", url: "/blog/b" },
    ],
  });
  expect((metadata as any).title).toBe("Blog · Acme");
  const graphNodes = (ld as any)["@graph"];
  const types = graphNodes.map((n: any) => n["@type"]);
  expect(types).toEqual(["CollectionPage", "ItemList", "BreadcrumbList"]);
  const list = graphNodes.find((n: any) => n["@type"] === "ItemList");
  expect(list.numberOfItems).toBe(2);
  // relative item URLs resolved to absolute
  expect(list.itemListElement[0].url).toBe("https://acme.com/blog/a");
  const cp = graphNodes.find((n: any) => n["@type"] === "CollectionPage");
  expect(cp.url).toBe("https://acme.com/blog");
});

test("site.meta forwards robots + languages", () => {
  const site = defineSite({ name: "Acme", url: "https://acme.com" });
  const m = site.meta({ title: "Secret", robots: { index: false, follow: true }, languages: { en: "https://acme.com/en" } }) as any;
  expect(m.robots).toEqual({ index: false, follow: true });
  expect(m.alternates.languages).toEqual({ en: "https://acme.com/en" });
});
