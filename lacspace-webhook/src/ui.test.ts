import { describe, it, expect } from "vitest";
import { sseFrame, inspectorHtml, UI_EVENTS, UI_PAGE } from "./ui.js";

describe("sseFrame", () => {
  it("formats an event + JSON data frame ending in a blank line", () => {
    const f = sseFrame("capture", { a: 1 });
    expect(f).toBe('event: capture\ndata: {"a":1}\n\n');
  });
  it("escapes newlines inside data (single data line)", () => {
    const f = sseFrame("x", { s: "a\nb" });
    expect(f.split("\n").filter((l) => l.startsWith("data:"))).toHaveLength(1);
  });
});

describe("inspectorHtml", () => {
  it("is a self-contained page wired to the SSE endpoint", () => {
    const html = inspectorHtml({ port: 4000, verify: "auto" });
    expect(html).toContain("<!doctype html>");
    expect(html).toContain("lacspace-webhook");
    expect(html).toContain(`new EventSource('${UI_EVENTS}')`);
    expect(html).not.toContain("http://cdn"); // no external assets
    expect(html).toContain('"port":4000');
  });
  it("exposes stable route constants", () => {
    expect(UI_PAGE).toBe("/__inspector");
    expect(UI_EVENTS).toBe("/__inspector/events");
  });
});
