import { describe, it, expect } from "vitest";
import {
  changeSummary, formatText, formatSlack, formatDiscord, formatTelegram, formatEmail,
} from "./notify.js";
import type { CheckResult } from "./types.js";

const price: CheckResult = {
  id: "1", label: "Widget price", url: "https://shop.site/p", type: "selector",
  changed: true, alerted: true, baseline: false, before: "$10", after: "$8", at: "2026-09-06T00:00:00Z",
};
const feed: CheckResult = {
  id: "2", label: "Blog", url: "https://blog.site/rss", type: "feed",
  changed: true, alerted: true, baseline: false, added: ["Post A", "Post B"], at: "2026-09-06T00:00:00Z",
};
const err: CheckResult = {
  id: "3", label: "API", url: "https://api.site", type: "json",
  changed: false, alerted: false, baseline: false, error: "timeout", at: "2026-09-06T00:00:00Z",
};

describe("changeSummary", () => {
  it("describes a value change, a feed and an error", () => {
    expect(changeSummary(price)).toBe("Widget price: $10 → $8");
    expect(changeSummary(feed)).toContain("2 new items");
    expect(changeSummary(err)).toContain("error — timeout");
  });
});

describe("formatText", () => {
  it("has a title line + one bullet per change with the url", () => {
    const t = formatText([price, feed]);
    expect(t).toContain("lacspace-monitor");
    expect(t).toContain("• Widget price: $10 → $8  https://shop.site/p");
    expect(t.split("\n")).toHaveLength(3);
  });
});

describe("formatSlack", () => {
  it("produces blocks + a text fallback", () => {
    const p = formatSlack([price]);
    expect(p.text).toContain("Widget price");
    expect(Array.isArray(p.blocks)).toBe(true);
    // header + one section
    expect(p.blocks).toHaveLength(2);
    expect(JSON.stringify(p.blocks)).toContain("Widget price");
  });
});

describe("formatDiscord", () => {
  it("produces embeds with title/url/description", () => {
    const p = formatDiscord([price]);
    expect(p.content).toContain("lacspace-monitor");
    expect(p.embeds).toHaveLength(1);
    expect(JSON.stringify(p.embeds)).toContain("https://shop.site/p");
  });
});

describe("formatTelegram", () => {
  it("is Markdown text with the summary and url", () => {
    const t = formatTelegram([price]);
    expect(t).toContain("*lacspace-monitor");
    expect(t).toContain("$10 → $8");
    expect(t).toContain("https://shop.site/p");
  });
});

describe("formatEmail", () => {
  it("has a subject and escaped html body", () => {
    const e = formatEmail([price, err]);
    expect(e.subject).toContain("lacspace-monitor");
    expect(e.text).toContain("Widget price");
    expect(e.html).toContain("<li>");
    expect(e.html).toContain("Widget price");
  });
  it("escapes html-sensitive characters", () => {
    const naughty: CheckResult = { ...price, label: "A & B <x>", after: '"q"' };
    const e = formatEmail([naughty]);
    expect(e.html).toContain("A &amp; B &lt;x&gt;");
    expect(e.html).not.toContain("<x>");
  });
});
