import { test, expect } from "vitest";
import {
  openGraphArticle,
  openGraphProduct,
  openGraphProfile,
  openGraphVideo,
  openGraphAudio,
  twitterSummaryCard,
  twitterPlayerCard,
  twitterAppCard,
  metaTags,
} from "./index";

test("openGraphArticle keeps array author/tags and drops empties", () => {
  const m = openGraphArticle({
    title: "Post",
    publishedTime: "2026-09-01",
    author: ["Lumi", "Ada"],
    tags: ["seo", "next"],
  });
  expect(m["og:type"]).toBe("article");
  expect(m["og:title"]).toBe("Post");
  expect(m["article:author"]).toEqual(["Lumi", "Ada"]);
  expect(m["article:tag"]).toEqual(["seo", "next"]);
  expect(m["og:description"]).toBeUndefined();
});

test("openGraphProduct emits price/currency/availability", () => {
  const m = openGraphProduct({ title: "Widget", price: 9.99, currency: "USD", availability: "instock", condition: "new" });
  expect(m["og:type"]).toBe("product");
  expect(m["product:price:amount"]).toBe("9.99");
  expect(m["product:price:currency"]).toBe("USD");
  expect(m["product:availability"]).toBe("instock");
  expect(m["product:condition"]).toBe("new");
});

test("openGraphProfile emits profile:* fields", () => {
  const m = openGraphProfile({ firstName: "Ada", lastName: "Lovelace", username: "ada" });
  expect(m["og:type"]).toBe("profile");
  expect(m["profile:first_name"]).toBe("Ada");
  expect(m["profile:username"]).toBe("ada");
});

test("openGraphVideo defaults video type and carries dimensions", () => {
  const m = openGraphVideo({ videoUrl: "https://x.com/v.mp4", width: 1280, height: 720, duration: 120 });
  expect(m["og:type"]).toBe("video.other");
  expect(m["og:video"]).toBe("https://x.com/v.mp4");
  expect(m["og:video:type"]).toBe("video/mp4");
  expect(m["og:video:width"]).toBe(1280);
  expect(m["video:duration"]).toBe(120);
});

test("openGraphAudio defaults the audio MIME type", () => {
  const m = openGraphAudio({ audioUrl: "https://x.com/a.mp3" });
  expect(m["og:audio"]).toBe("https://x.com/a.mp3");
  expect(m["og:audio:type"]).toBe("audio/mpeg");
});

test("twitterSummaryCard toggles large image", () => {
  expect(twitterSummaryCard({ title: "T" })["twitter:card"]).toBe("summary");
  expect(twitterSummaryCard({ title: "T", largeImage: true })["twitter:card"]).toBe("summary_large_image");
});

test("twitterPlayerCard carries player + dimensions", () => {
  const m = twitterPlayerCard({ player: "https://x.com/embed", width: 640, height: 360, site: "@lacspace" });
  expect(m["twitter:card"]).toBe("player");
  expect(m["twitter:player"]).toBe("https://x.com/embed");
  expect(m["twitter:player:width"]).toBe(640);
});

test("twitterAppCard flattens nested app ids", () => {
  const m = twitterAppCard({ site: "@lacspace", iphone: { id: "12345", name: "App" }, googleplay: { id: "com.x.app" } });
  expect(m["twitter:card"]).toBe("app");
  expect(m["twitter:app:id:iphone"]).toBe("12345");
  expect(m["twitter:app:name:iphone"]).toBe("App");
  expect(m["twitter:app:id:googleplay"]).toBe("com.x.app");
  expect(m["twitter:app:id:ipad"]).toBeUndefined();
});

test("metaTags renders property vs name and expands arrays, escaping content", () => {
  const out = metaTags(
    openGraphArticle({ title: 'A & "B"', tags: ["x", "y"] }),
    twitterSummaryCard({ largeImage: true }),
  );
  expect(out).toContain('<meta property="og:type" content="article">');
  expect(out).toContain('<meta property="og:title" content="A &amp; &quot;B&quot;">');
  // array expands to one tag per value
  expect((out.match(/property="article:tag"/g) ?? []).length).toBe(2);
  // twitter uses name=
  expect(out).toContain('<meta name="twitter:card" content="summary_large_image">');
});
