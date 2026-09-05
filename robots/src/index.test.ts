import { describe, it, expect } from "vitest";
import {
  AI_BOTS,
  AI_TRAINING_BOTS,
  aiPolicy,
  robots,
  parseRobots,
  xRobotsTag,
  metaRobots,
} from "./index";

describe("AI_BOTS coverage", () => {
  it("includes the well-known AI crawlers", () => {
    for (const bot of [
      "GPTBot",
      "ChatGPT-User",
      "OAI-SearchBot",
      "ClaudeBot",
      "Claude-Web",
      "anthropic-ai",
      "PerplexityBot",
      "Perplexity-User",
      "Google-Extended",
      "Applebot-Extended",
      "Bytespider",
      "Amazonbot",
      "CCBot",
      "Meta-ExternalAgent",
      "cohere-ai",
      "Diffbot",
      "ImagesiftBot",
      "Timpibot",
      "Omgilibot",
      "YouBot",
    ]) {
      expect(AI_BOTS).toContain(bot);
    }
  });
});

describe("aiPolicy()", () => {
  it("block-all-ai disallows every AI bot", () => {
    const groups = aiPolicy("block-all-ai");
    expect(groups).toHaveLength(1);
    expect(groups[0]!.userAgent).toEqual(AI_BOTS);
    expect(groups[0]!.disallow).toEqual(["/"]);
  });

  it("allow-search-block-training targets only training bots", () => {
    const groups = aiPolicy("allow-search-block-training");
    expect(groups[0]!.userAgent).toEqual(AI_TRAINING_BOTS);
    // AI search engines must remain unblocked
    expect(AI_TRAINING_BOTS).not.toContain("OAI-SearchBot");
    expect(AI_TRAINING_BOTS).not.toContain("PerplexityBot");
  });

  it("allow-all returns no restrictions and spreads cleanly", () => {
    expect(aiPolicy("allow-all")).toEqual([]);
    const txt = robots({ groups: [{ userAgent: "*", allow: ["/"] }, ...aiPolicy("block-all-ai")] });
    expect(txt).toContain("User-agent: GPTBot");
    expect(txt).toContain("Disallow: /");
  });
});

describe("cleanParam support", () => {
  it("emits Clean-param lines", () => {
    const txt = robots({
      groups: [{ userAgent: "*", cleanParam: ["ref /articles/", "utm_source&utm_medium"] }],
    });
    expect(txt).toContain("Clean-param: ref /articles/");
    expect(txt).toContain("Clean-param: utm_source&utm_medium");
  });

  it("accepts a single string cleanParam", () => {
    const txt = robots({ groups: [{ userAgent: "*", cleanParam: "sid" }] });
    expect(txt).toContain("Clean-param: sid");
  });

  it("round-trips through parseRobots", () => {
    const txt = robots({
      groups: [{ userAgent: "Yandex", crawlDelay: 2, cleanParam: ["ref /a/"] }],
    });
    const parsed = parseRobots(txt);
    expect(parsed.groups[0]!.cleanParam).toEqual(["ref /a/"]);
    expect(parsed.groups[0]!.crawlDelay).toBe(2);
  });
});

describe("xRobotsTag() / metaRobots()", () => {
  it("builds a directive string", () => {
    expect(metaRobots({ noindex: true, nofollow: true })).toBe("noindex, nofollow");
  });

  it("supports max-* and unavailable_after", () => {
    const v = xRobotsTag({
      noindex: true,
      maxImagePreview: "large",
      maxSnippet: -1,
      unavailableAfter: new Date("2026-12-31T00:00:00.000Z"),
    });
    expect(v).toContain("noindex");
    expect(v).toContain("max-image-preview:large");
    expect(v).toContain("max-snippet:-1");
    expect(v).toContain("unavailable_after: ");
    expect(v).toContain("2026");
  });

  it("prefixes a user-agent when given", () => {
    expect(xRobotsTag({ noindex: true }, { userAgent: "googlebot" })).toBe("googlebot: noindex");
  });

  it("emits none/all tokens", () => {
    expect(metaRobots({ none: true })).toBe("none");
    expect(metaRobots({ all: true })).toBe("all");
  });
});
