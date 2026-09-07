import { describe, it, expect } from "vitest";
import {
  AI_BOTS,
  AI_CRAWLER_CATALOG,
  blockAiCrawlers,
  allowAiCrawlers,
  aiCrawlersByType,
  parseRobots,
  isAllowed,
  allowAll,
  disallowAll,
  robots,
} from "./index";

describe("AI_CRAWLER_CATALOG", () => {
  it("has an entry for every AI_BOTS token", () => {
    const names = new Set(AI_CRAWLER_CATALOG.map((c) => c.name));
    for (const bot of AI_BOTS) expect(names).toContain(bot);
  });

  it("names are unique and every row is well-formed", () => {
    const names = AI_CRAWLER_CATALOG.map((c) => c.name);
    expect(new Set(names).size).toBe(names.length);
    for (const c of AI_CRAWLER_CATALOG) {
      expect(c.name.length).toBeGreaterThan(0);
      expect(c.operator.length).toBeGreaterThan(0);
      expect(["training", "search", "assistant", "scraper"]).toContain(c.type);
    }
  });

  it("aiCrawlersByType filters by purpose", () => {
    const training = aiCrawlersByType("training");
    expect(training).toContain("GPTBot");
    expect(training).toContain("ClaudeBot");
    expect(training).not.toContain("OAI-SearchBot");
    const searchAndAssistant = aiCrawlersByType("search", "assistant");
    expect(searchAndAssistant).toContain("OAI-SearchBot");
    expect(searchAndAssistant).toContain("ChatGPT-User");
  });
});

describe("blockAiCrawlers()", () => {
  it("emits one Disallow: / group per known AI agent", () => {
    const txt = blockAiCrawlers();
    for (const bot of AI_BOTS) expect(txt).toContain(`User-agent: ${bot}`);
    // wildcard group stays allow-all
    expect(txt).toContain("User-agent: *");
    // one Disallow: / per bot
    const disallowAllCount = txt.split("\n").filter((l) => l === "Disallow: /").length;
    expect(disallowAllCount).toBe(AI_BOTS.length);
    // parses back to N bot groups + the wildcard group
    const parsed = parseRobots(txt);
    expect(parsed.groups.length).toBe(AI_BOTS.length + 1);
  });

  it("applies crawl-delay to each bot group", () => {
    const txt = blockAiCrawlers({ crawlDelay: 10 });
    const delays = txt.split("\n").filter((l) => l === "Crawl-delay: 10").length;
    expect(delays).toBe(AI_BOTS.length);
  });

  it("adds host, multiple sitemaps and wildcard clean-param", () => {
    const txt = blockAiCrawlers({
      host: "acme.com",
      sitemap: ["https://acme.com/sitemap.xml", "https://acme.com/news.xml"],
      cleanParam: ["utm_source&utm_medium"],
      extraDisallow: ["/private"],
    });
    expect(txt).toContain("Host: acme.com");
    expect(txt).toContain("Sitemap: https://acme.com/sitemap.xml");
    expect(txt).toContain("Sitemap: https://acme.com/news.xml");
    expect(txt).toContain("Clean-param: utm_source&utm_medium");
    expect(txt).toContain("Disallow: /private");
  });

  it("respects a custom bot list", () => {
    const txt = blockAiCrawlers({ bots: ["GPTBot", "ClaudeBot"] });
    expect(txt).toContain("User-agent: GPTBot");
    expect(txt).toContain("User-agent: ClaudeBot");
    expect(txt).not.toContain("User-agent: CCBot");
  });

  it("accepts a single sitemap string", () => {
    const txt = blockAiCrawlers({ sitemap: "https://acme.com/sitemap.xml" });
    expect(txt).toContain("Sitemap: https://acme.com/sitemap.xml");
  });

  it("can block only training crawlers via aiCrawlersByType", () => {
    const txt = blockAiCrawlers({ bots: aiCrawlersByType("training") });
    const parsed = parseRobots(txt);
    expect(isAllowed("/", parsed, "GPTBot")).toBe(false);
    // a live-search bot is not in the training set, so it is allowed
    expect(isAllowed("/", parsed, "OAI-SearchBot")).toBe(true);
  });

  it("actually blocks a targeted bot per the matcher", () => {
    const parsed = parseRobots(blockAiCrawlers());
    expect(isAllowed("/anything", parsed, "GPTBot")).toBe(false);
    // an unlisted regular crawler is still allowed
    expect(isAllowed("/anything", parsed, "Googlebot")).toBe(true);
  });
});

describe("allowAiCrawlers()", () => {
  it("emits an Allow: / group per bot", () => {
    const txt = allowAiCrawlers();
    for (const bot of AI_BOTS) expect(txt).toContain(`User-agent: ${bot}`);
    const allows = txt.split("\n").filter((l) => l === "Allow: /").length;
    expect(allows).toBe(AI_BOTS.length);
    expect(isAllowed("/", parseRobots(txt), "PerplexityBot")).toBe(true);
  });
});

describe("allowAll() / disallowAll()", () => {
  it("allowAll allows everything with sitemap", () => {
    const txt = allowAll({ sitemap: "https://acme.com/sitemap.xml" });
    expect(txt).toContain("User-agent: *");
    expect(txt).toContain("Allow: /");
    expect(txt).toContain("Sitemap: https://acme.com/sitemap.xml");
    expect(isAllowed("/deep/path", parseRobots(txt), "Googlebot")).toBe(true);
  });

  it("disallowAll blocks everything", () => {
    const parsed = parseRobots(disallowAll());
    expect(isAllowed("/", parsed, "Googlebot")).toBe(false);
  });
});

describe("per-group host directive", () => {
  it("emits Host inside a group and round-trips through the parser", () => {
    const txt = robots({ groups: [{ userAgent: "Yandex", disallow: ["/tmp"], host: "mirror.acme.com" }] });
    expect(txt).toContain("Host: mirror.acme.com");
    const parsed = parseRobots(txt);
    expect(parsed.groups[0]!.host).toBe("mirror.acme.com");
    expect(parsed.host).toBe("mirror.acme.com");
  });
});

describe("isAllowed longest-match precedence", () => {
  it("Allow /admin/public wins over Disallow /admin for the deeper path", () => {
    const parsed = parseRobots(
      robots({ groups: [{ userAgent: "*", disallow: ["/admin"], allow: ["/admin/public"] }] }),
    );
    expect(isAllowed("/admin/secret", parsed, "Googlebot")).toBe(false);
    expect(isAllowed("/admin/public/page", parsed, "Googlebot")).toBe(true);
  });

  it("round-trips a non-trivial robots.txt", () => {
    const src = robots({
      groups: [
        { userAgent: "*", disallow: ["/admin", "/api"], allow: ["/api/public"], crawlDelay: 5 },
        { userAgent: ["Bingbot", "Slurp"], disallow: ["/no-bing"] },
      ],
      sitemap: ["https://acme.com/s1.xml", "https://acme.com/s2.xml"],
      host: "acme.com",
    });
    const parsed = parseRobots(src);
    expect(parsed.groups).toHaveLength(2);
    expect(parsed.groups[0]!.disallow).toEqual(["/admin", "/api"]);
    expect(parsed.groups[0]!.allow).toEqual(["/api/public"]);
    expect(parsed.groups[0]!.crawlDelay).toBe(5);
    expect(parsed.groups[1]!.userAgents).toEqual(["Bingbot", "Slurp"]);
    expect(parsed.sitemaps).toEqual(["https://acme.com/s1.xml", "https://acme.com/s2.xml"]);
    expect(parsed.host).toBe("acme.com");
    // matcher against the parsed result
    expect(isAllowed("/api/public/data", parsed, "Googlebot")).toBe(true);
    expect(isAllowed("/api/internal", parsed, "Googlebot")).toBe(false);
    expect(isAllowed("/no-bing", parsed, "Bingbot")).toBe(false);
  });
});
