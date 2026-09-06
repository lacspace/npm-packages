import { describe, it, expect } from "vitest";
import { discoverPages } from "./pages.js";

describe("discoverPages", () => {
  it("finds contact/about/careers/pricing/blog/status + rss from nav links", () => {
    const html = `
      <nav>
        <a href="/about-us">About us</a>
        <a href="/contact">Get in touch</a>
        <a href="/careers">We're hiring</a>
        <a href="/pricing">Plans &amp; Pricing</a>
        <a href="/blog">Blog</a>
        <a href="https://status.acme.com">System status</a>
      </nav>
      <link rel="alternate" type="application/rss+xml" href="/feed.xml">`;
    const pages = discoverPages(html, "https://acme.com/");
    expect(pages.about).toBe("https://acme.com/about-us");
    expect(pages.contact).toBe("https://acme.com/contact");
    expect(pages.careers).toBe("https://acme.com/careers");
    expect(pages.pricing).toBe("https://acme.com/pricing");
    expect(pages.blog).toBe("https://acme.com/blog");
    expect(pages.status).toBe("https://status.acme.com/");
    expect(pages.rss).toBe("https://acme.com/feed.xml");
  });

  it("recognises careers via link text and off-domain ATS hosts", () => {
    const html = `<a href="https://boards.greenhouse.io/acme">Open roles</a>
      <a href="/company">Who we are</a>`;
    const pages = discoverPages(html, "https://acme.com/");
    expect(pages.careers).toBe("https://boards.greenhouse.io/acme");
    expect(pages.about).toBe("https://acme.com/company");
  });

  it("returns an empty object when nothing matches", () => {
    expect(discoverPages("<a href='/x'>random</a>", "https://acme.com/")).toEqual({});
  });
});
