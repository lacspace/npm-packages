import { describe, it, expect } from "vitest";
import {
  sitemap,
  sitemapStylesheet,
  newsSitemap,
  videoSitemap,
  imageSitemap,
} from "./index";

describe("sitemap() backward compatibility", () => {
  it("still builds a plain sitemap with no options", () => {
    const xml = sitemap([{ loc: "https://x.com/" }]);
    expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(xml).toContain("<loc>https://x.com/</loc>");
    expect(xml).not.toContain("xml-stylesheet");
  });

  it("adds the xml-stylesheet PI when stylesheet is set", () => {
    const xml = sitemap([{ loc: "https://x.com/" }], { stylesheet: "/sitemap.xsl" });
    expect(xml).toContain('<?xml-stylesheet type="text/xsl" href="/sitemap.xsl"?>');
    // PI must sit between the declaration and the urlset
    expect(xml.indexOf("xml-stylesheet")).toBeLessThan(xml.indexOf("<urlset"));
  });
});

describe("sitemapStylesheet()", () => {
  it("returns a valid XSL document referencing sitemap fields", () => {
    const xsl = sitemapStylesheet();
    expect(xsl).toContain("xsl:stylesheet");
    expect(xsl).toContain('xmlns:s="http://www.sitemaps.org/schemas/sitemap/0.9"');
    expect(xsl).toContain("s:loc");
    expect(xsl).toContain("<title>XML Sitemap</title>");
  });
});

describe("newsSitemap()", () => {
  it("emits news:news with publication metadata", () => {
    const xml = newsSitemap([
      {
        loc: "https://x.com/a",
        publicationName: "The Times",
        language: "en",
        title: "Big Headline",
        publicationDate: new Date("2026-09-05T00:00:00.000Z"),
      },
    ]);
    expect(xml).toContain("<news:news>");
    expect(xml).toContain("<news:name>The Times</news:name>");
    expect(xml).toContain("<news:language>en</news:language>");
    expect(xml).toContain("<news:title>Big Headline</news:title>");
    expect(xml).toContain("<news:publication_date>2026-09-05T00:00:00.000Z</news:publication_date>");
    expect(xml).toContain("<loc>https://x.com/a</loc>");
  });
});

describe("videoSitemap()", () => {
  it("emits video:video with content/player/duration", () => {
    const xml = videoSitemap([
      {
        loc: "https://x.com/watch",
        thumbnailLoc: "https://x.com/t.jpg",
        title: "Clip",
        description: "A clip",
        contentLoc: "https://x.com/v.mp4",
        playerLoc: "https://x.com/p",
        duration: 120,
      },
    ]);
    expect(xml).toContain("<video:video>");
    expect(xml).toContain("<video:thumbnail_loc>https://x.com/t.jpg</video:thumbnail_loc>");
    expect(xml).toContain("<video:title>Clip</video:title>");
    expect(xml).toContain("<video:content_loc>https://x.com/v.mp4</video:content_loc>");
    expect(xml).toContain("<video:player_loc>https://x.com/p</video:player_loc>");
    expect(xml).toContain("<video:duration>120</video:duration>");
  });
});

describe("imageSitemap()", () => {
  it("groups multiple images under one url", () => {
    const xml = imageSitemap([
      {
        loc: "https://x.com/gallery",
        images: [
          { loc: "https://x.com/1.jpg", title: "One" },
          { loc: "https://x.com/2.jpg", caption: "Two" },
        ],
      },
    ]);
    expect(xml).toContain("<loc>https://x.com/gallery</loc>");
    expect(xml).toContain("<image:loc>https://x.com/1.jpg</image:loc>");
    expect(xml).toContain("<image:title>One</image:title>");
    expect(xml).toContain("<image:loc>https://x.com/2.jpg</image:loc>");
    expect(xml).toContain("<image:caption>Two</image:caption>");
  });

  it("passes a stylesheet through to the PI", () => {
    const xml = imageSitemap([{ loc: "https://x.com/g", images: [] }], {
      stylesheet: "/s.xsl",
    });
    expect(xml).toContain('<?xml-stylesheet type="text/xsl" href="/s.xsl"?>');
  });
});
